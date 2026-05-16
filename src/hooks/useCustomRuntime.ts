"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useExternalStoreRuntime,
  useRuntimeAdapters,
  useToolInvocations,
} from "@assistant-ui/core/react";
import type { ToolExecutionStatus } from "@assistant-ui/core/react";
import type {
  AssistantRuntime,
  AppendMessage,
  AttachmentAdapter,
  DictationAdapter,
  ExternalStoreAdapter,
  FeedbackAdapter,
  SpeechSynthesisAdapter,
  ThreadHistoryAdapter,
  ThreadMessage,
} from "@assistant-ui/core";
import type { ReadonlyJSONValue } from "assistant-stream/utils";
import { makeLogger } from "@assistant-ui/react-ag-ui/runtime/logger";
import type { HttpAgent } from "@ag-ui/client";
import type {
  AgUiInterrupt,
  AgUiResumeEntry,
} from "@assistant-ui/react-ag-ui/runtime/types";
import { AgUiThreadRuntimeCore } from "@assistant-ui/react-ag-ui/runtime/AgUiThreadRuntimeCore";

export type AgUiAssistantRuntime = AssistantRuntime & {
  unstable_getPendingInterrupts: () => readonly AgUiInterrupt[];
  unstable_submitInterruptResponses: (
    responses: readonly AgUiResumeEntry[],
  ) => Promise<void>;
};

export type ThreadListAdapter = {
  threadId: string | undefined;
  threads: { id: string; title?: string; status?: "regular" | "archived"; updatedAt?: Date }[];
  isLoading?: boolean;
  archivedThreads?: { id: string; title?: string; status?: "regular" | "archived"; updatedAt?: Date }[];
  onSwitchToNewThread?: () => Promise<void>;
  onSwitchToThread?: (threadId: string) => Promise<{
    messages: readonly ThreadMessage[];
    state?: ReadonlyJSONValue;
  }>;
  onDelete?: (threadId: string) => Promise<void>;
  onRename?: (threadId: string, newTitle: string) => Promise<void>;
  onArchive?: (threadId: string) => Promise<void>;
  onUnarchive?: (threadId: string) => Promise<void>;
  onBeforeSwitch?: (
    messages: readonly ThreadMessage[],
    state?: ReadonlyJSONValue,
  ) => void;
};

type UseCustomRuntimeOptions = {
  agent: ConstructorParameters<typeof AgUiThreadRuntimeCore>[0]["agent"];
  logger?: ConstructorParameters<typeof AgUiThreadRuntimeCore>[0]["logger"];
  showThinking?: boolean;
  onError?: (e: Error) => void;
  onCancel?: () => void;
  adapters?: {
    attachments?: AttachmentAdapter;
    speech?: SpeechSynthesisAdapter;
    dictation?: DictationAdapter;
    feedback?: FeedbackAdapter;
    history?: ThreadHistoryAdapter;
    threadList?: ThreadListAdapter;
  };
};

let diagMsgCounter = 0;
function diagMsg(...args: unknown[]) {
  const tag = `[D${++diagMsgCounter}]`;
  console.log(tag, ...args);
}

function applySkipHeuristic(messages: readonly ThreadMessage[]): ThreadMessage[] {
  let hasLaterUser = false;
  const result: ThreadMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") {
      hasLaterUser = true;
      result.unshift(m);
    } else if (m.role === "assistant" && hasLaterUser && m.status?.type === "running") {
      diagMsg("HEURISTIC MATCH idx=", i, "msgId=", m.id, "status=", m.status);
      result.unshift({
        ...m,
        content: [],
        status: { type: "incomplete" as const, reason: "cancelled" as const },
      });
    } else {
      result.unshift(m);
    }
  }
  return result;
}

export function useCustomRuntime(
  options: UseCustomRuntimeOptions,
): AgUiAssistantRuntime {
  const logger = useMemo(() => makeLogger(options.logger), [options.logger]);
  const [_version, setVersion] = useState(0);
  const notifyUpdate = useCallback(() => {
    setVersion((v) => {
      diagMsg("notifyUpdate version", v + 1);
      return v + 1;
    });
  }, []);
  const coreRef = useRef<AgUiThreadRuntimeCore | null>(null);
  const runtimeAdapters = useRuntimeAdapters();

  const historyAdapter = options.adapters?.history ?? runtimeAdapters?.history;
  const threadListAdapter = options.adapters?.threadList;

  if (!coreRef.current) {
    diagMsg("CREATING core");
    coreRef.current = new AgUiThreadRuntimeCore({
      agent: options.agent,
      logger,
      showThinking: options.showThinking ?? true,
      ...(options.onError && { onError: options.onError }),
      ...(options.onCancel && { onCancel: options.onCancel }),
      ...(historyAdapter && { history: historyAdapter }),
      notifyUpdate,
    });
    // monkey-patch updateAssistantMessage for diagnostics
    const coreAny = coreRef.current as any;
    const origUpdate = coreAny.updateAssistantMessage.bind(coreAny);
    coreAny.updateAssistantMessage = (messageId: string, update: any) => {
      const result = origUpdate(messageId, update);
      if (update?.status) {
        diagMsg("CORE updateAssistantMessage msgId=", messageId, "status=", JSON.stringify(update.status), "contentLen=", update.content?.length ?? "same");
        const msgs = coreAny.getMessages().map((m: any) => ({
          id: m.id,
          role: m.role,
          status: m.status,
          contentLen: m.content.length,
        }));
        diagMsg("CORE messages after update:", JSON.stringify(msgs));
      }
      return result;
    };

    // Monkey-patch handleEvent: log events, guard terminal transitions, convert known pipeline errors
    const origHandleEvent = coreAny.handleEvent.bind(coreAny);
    coreAny.handleEvent = (aggregator: any, event: any) => {
      diagMsg("HANDLE_EVENT event=", event.type, "msg=", event.message, "aggregatorStatus=", aggregator.status?.type, "reason=", aggregator.status?.reason);

      // Convert pipeline errors to RUN_FINISHED (these are validation/ordering errors in the event stream, not real failures)
      if (event.type === "RUN_ERROR" && typeof event.message === "string") {
        const isPipelineError = event.message.includes("Cannot send event type") || event.message.includes("First event must");
        diagMsg("HANDLE_EVENT RUN_ERROR msg=", event.message, "pipelineError=", isPipelineError);
        if (isPipelineError) {
          diagMsg("HANDLE_EVENT CONVERT pipeline error to RUN_FINISHED");
          return origHandleEvent(aggregator, { type: "RUN_FINISHED" });
        }
      }

      // Guard against terminal-state transitions (RUN_FINISHED / RUN_ERROR / RUN_CANCELLED after already terminal)
      const terminalStates = ["incomplete", "complete"];
      if (aggregator.status && terminalStates.includes(aggregator.status.type)) {
        if (event.type === "RUN_FINISHED" || event.type === "RUN_ERROR" || event.type === "RUN_CANCELLED") {
          diagMsg("HANDLE_EVENT GUARD SKIP event=", event.type, "currStatus=", aggregator.status.type, "reason=", aggregator.status.reason, "msg=", event.message);
          return;
        }
      }
      return origHandleEvent(aggregator, event);
    };
    diagMsg("handleEvent patched");

    // Monkey-patch startRun to catch the REAL pipeline error message
    const origStartRun = coreAny.startRun.bind(coreAny);
    coreAny.startRun = async (...args: any[]) => {
      diagMsg("startRun ENTER parentId=", args[0], "pendingError BEFORE=", coreAny.pendingError?.message ?? "none");
      const errBefore = coreAny.pendingError;
      try {
        const result = await origStartRun(...args);
        diagMsg("startRun RESOLVED pendingError AFTER=", coreAny.pendingError?.message ?? "none");
        return result;
      } catch (err) {
        const msg = err instanceof Error ? `${err.message} | ${err.stack?.substring(0, 300) || ""}` : String(err);
        diagMsg("startRun REJECTED err=", msg, "pendingError AFTER=", coreAny.pendingError?.message ?? "none");
        diagMsg("startRun REJECTED diff:", coreAny.pendingError === errBefore ? "SAME error object (was set before)" : "DIFFERENT error object (new)");
        throw err;
      }
    };
    diagMsg("startRun patched");

    // Monkey-patch fetch to wrap SSE response body
    // 1) Suppress AbortError from premature stream closure
    // 2) Parse SSE events properly (line-by-line)
    // 3) Convert RUN_ERROR to text content so the error is visible in the message
    // 4) Strip RUN_FINISHED after RUN_ERROR to prevent pipeline validation error
    const origFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/agent/chat")) {
        diagMsg("FETCH REQUEST url=", url, "method=", init?.method ?? "GET", "body=", init?.body ? String(init.body).substring(0, 500) : "none");
      }
      try {
        const response = await origFetch(input, init);
        if (url.includes("/api/agent/chat")) {
          diagMsg("FETCH RESPONSE status=", response.status, "statusText=", response.statusText, "ok=", response.ok, "contentType=", response.headers.get("content-type"));
        }
        if (url.includes("/api/agent/chat") && response.ok && response.body) {
          const reader = response.body.getReader();
          let chunkCount = 0;
          let sawRunError = false;
          let errorMsgIdCount = 0;
          const decoder = new TextDecoder();
          let buffer = "";
          const newStream = new ReadableStream({
            async start(controller) {
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  chunkCount++;
                  buffer += decoder.decode(value, { stream: true });
                  // Process complete SSE events (delimited by \n\n)
                  let eventEnd;
                  while ((eventEnd = buffer.indexOf('\n\n')) !== -1) {
                    const sseBlock = buffer.slice(0, eventEnd);
                    buffer = buffer.slice(eventEnd + 2);
                    // Extract data: lines from the SSE block
                    const dataLines: string[] = [];
                    for (const line of sseBlock.split('\n')) {
                      if (line.startsWith('data: ')) {
                        dataLines.push(line.slice(6));
                      }
                    }
                    if (dataLines.length === 0) continue;
                    for (const jsonStr of dataLines) {
                      try {
                        const parsed = JSON.parse(jsonStr);
                        if (parsed.type === 'RUN_ERROR') {
                          sawRunError = true;
                          errorMsgIdCount++;
                          const errorMsg = parsed.message || 'An error occurred';
                          const msgId = `error-${errorMsgIdCount}-${Date.now()}`;
                          const textEvents = [
                            { type: "TEXT_MESSAGE_START", messageId: msgId },
                            { type: "TEXT_MESSAGE_CONTENT", delta: `Error: ${errorMsg}`, messageId: msgId },
                            { type: "TEXT_MESSAGE_END", messageId: msgId },
                          ].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
                          controller.enqueue(new TextEncoder().encode(textEvents));
                        } else if (sawRunError && parsed.type === 'RUN_FINISHED') {
                          diagMsg(`FETCH STRIP RUN_FINISHED after RUN_ERROR`);
                        } else {
                          controller.enqueue(new TextEncoder().encode(`data: ${jsonStr}\n\n`));
                        }
                      } catch {
                        controller.enqueue(new TextEncoder().encode(`data: ${jsonStr}\n\n`));
                      }
                    }
                  }
                }
                // Flush remaining buffer
                if (buffer.length > 0) {
                  controller.enqueue(new TextEncoder().encode(buffer));
                }
                diagMsg(`FETCH STREAM COMPLETE totalChunks=${chunkCount}`);
              } catch (e: any) {
                if (e?.name === "AbortError") {
                  diagMsg(`FETCH ABORT (suppressed) after ${chunkCount} chunks`);
                } else {
                  diagMsg(`FETCH READ ERROR:`, e?.message ?? String(e));
                }
              } finally {
                try { controller.close(); } catch {}
              }
            },
            cancel() {
              reader.cancel().catch(() => {});
            },
          });
          return new Response(newStream, {
            status: response.status,
            statusText: response.statusText,
            headers: new Headers(response.headers),
          });
        }
        return response;
      } catch (err) {
        if (url.includes("/api/agent/chat")) {
          diagMsg("FETCH ERROR", err);
        }
        throw err;
      }
    };
    diagMsg("fetch patched");
  }

  diagMsg("isRunningFlag at hook start:", coreRef.current.isRunning());
  diagMsg("core messages at hook start:", coreRef.current.getMessages().length);

  const core = coreRef.current;
  core.updateOptions({
    agent: options.agent,
    logger,
    showThinking: options.showThinking ?? true,
    ...(options.onError && { onError: options.onError }),
    ...(options.onCancel && { onCancel: options.onCancel }),
    ...(historyAdapter && { history: historyAdapter }),
  });

  const [toolStatuses, setToolStatuses] = useState<
    Record<string, ToolExecutionStatus>
  >({});

  const hasExecutingTools = Object.values(toolStatuses).some(
    (s) => s?.type === "executing",
  );

  const [runtimeRef] = useState(() => ({
    get current(): AssistantRuntime {
      return runtime;
    },
  }));

  const cancelLockRef = useRef(false);

  diagMsg("cancelLockRef initial:", cancelLockRef.current);

  const toolInvocationsRef = useRef({
    reset: () => {},
    abort: (): Promise<void> => Promise.resolve(),
    resume: (_toolCallId: string, _payload: unknown) => {},
  });

  const threadList = useMemo(() => {
    if (!threadListAdapter) return undefined;

    const {
      threadId,
      isLoading,
      threads,
      archivedThreads,
      onSwitchToNewThread,
      onSwitchToThread,
      onDelete,
      onRename,
      onArchive,
      onUnarchive,
      onBeforeSwitch,
    } = threadListAdapter;

    return {
      threadId,
      isLoading,
      threads,
      archivedThreads,
      onDelete,
      onRename,
      onArchive,
      onUnarchive,
      onSwitchToNewThread: onSwitchToNewThread
        ? async () => {
            cancelLockRef.current = false;
            onBeforeSwitch?.(core.getMessages(), core.getState());
            toolInvocationsRef.current.reset();
            await onSwitchToNewThread();
            core.applyExternalMessages([]);
          }
        : undefined,
      onSwitchToThread: onSwitchToThread
        ? async (targetId: string) => {
            cancelLockRef.current = false;
            onBeforeSwitch?.(core.getMessages(), core.getState());
            toolInvocationsRef.current.reset();
            const result = await onSwitchToThread(targetId);
            core.applyExternalMessages(result.messages);
            if (result.state) {
              core.loadExternalState(result.state);
            }
          }
        : undefined,
    };
  }, [threadListAdapter, core]);

  const adapters = options.adapters;
  const adapterAdapters = useMemo(
    () => ({
      attachments: adapters?.attachments ?? runtimeAdapters?.attachments,
      speech: adapters?.speech,
      dictation: adapters?.dictation,
      feedback: adapters?.feedback,
      threadList,
    }),
    [adapters, runtimeAdapters, threadList],
  );

  const toolInvocations = useToolInvocations({
    state: {
      messages: core.getMessages(),
      isRunning: core.isRunning() || hasExecutingTools,
    },
    getTools: () => runtimeRef.current.thread.getModelContext().tools,
    onResult: (command) => {
      if (command.type === "add-tool-result") {
        const messageId = core.findMessageIdForToolCall(command.toolCallId);
        if (messageId) {
          core.addToolResult({
            messageId,
            toolCallId: command.toolCallId,
            toolName: command.toolName,
            result: command.result,
            isError: command.isError,
            ...(command.artifact && { artifact: command.artifact }),
          });
        }
      }
    },
    setToolStatuses,
  });
  toolInvocationsRef.current = toolInvocations;

  const store = useMemo(
    () => {
      void _version;
      const raw = core.getMessages();
      const messages = applySkipHeuristic(raw);

      const computedIsRunning = cancelLockRef.current ? false : messages.some((m) => m.role === "assistant" && m.status?.type === "running");

      diagMsg("STORE COMPUTE version=", _version,
        "rawMsgs=", raw.length,
        "msgs=", messages.length,
        "hasRunning=", messages.some(m => m.role === "assistant" && m.status?.type === "running"),
        "computedIsRunning=", computedIsRunning,
        "cancelLock=", cancelLockRef.current,
        "statuses=", messages.filter(m => m.role === "assistant").map(m => ({ id: m.id, status: m.status?.type, reason: (m.status as any)?.reason })));

      return {
        isLoading: core.isLoading,
        messages,
        state: core.getState(),
        isRunning: computedIsRunning,
        setMessages: (incoming: readonly ThreadMessage[]) => {
          diagMsg("setMessages called with", incoming.length, "msgs, cancelLock=", cancelLockRef.current);
          if (cancelLockRef.current) {
            diagMsg("setMessages BLOCKED by cancelLock");
            return;
          }
          core.applyExternalMessages(incoming);
        },
        onNew: async (message: AppendMessage) => {
          diagMsg("onNew ENTER parentId=", message.parentId, "role=", message.role);
          diagMsg("onNew core.isRunning() =", core.isRunning(), "isRunningFlag =", (core as any).isRunningFlag);
          const preMsgs = core.getMessages();
          diagMsg("onNew messages before:", preMsgs.length, "lastRole=", preMsgs.at(-1)?.role, "runningCount=", preMsgs.filter(m => m.role === "assistant" && m.status?.type === "running").length);
          if (core.isRunning()) {
            const preCancelMsgs = core.getMessages();
            const hasRunning = preCancelMsgs.some(
              (m) => m.role === "assistant" && m.status?.type === "running",
            );
            diagMsg("onNew cancel check: hasRunning=", hasRunning, "msgs=", preCancelMsgs.length);
            if (!hasRunning) {
              diagMsg("onNew SKIP cancel (no running msgs), going straight to append");
              cancelLockRef.current = false;
              try {
                await core.append(message);
              } catch (e) {
                diagMsg("onNew append error (suppressed):", e instanceof Error ? `${e.message} | ${e.stack?.substring(0, 300)}` : String(e));
              }
              return;
            }
            diagMsg("onNew ENTERING CANCEL PATH");
            cancelLockRef.current = true;
            await core.cancel();
            diagMsg("onNew after core.cancel()");
            (options.agent as HttpAgent).abortRun();
            diagMsg("onNew after agent.abortRun()");
            const msgs = core.getMessages();
            diagMsg("onNew messages after cancel:", msgs.length, "statuses=", msgs.filter(m => m.role === "assistant").map(m => ({ id: m.id, status: m.status?.type })));
            const idx = msgs.findLastIndex((m) => m.role === "assistant");
            diagMsg("onNew last assistant idx=", idx);
            if (idx !== -1) {
              diagMsg("onNew marking last assistant as incomplete");
              core.applyExternalMessages(
                msgs.map((m, i) =>
                  i === idx
                  ? { ...m, content: [], status: { type: "incomplete" as const, reason: "cancelled" as const } } as ThreadMessage
                  : m,
                ),
              );
            }
            toolInvocationsRef.current.reset();
            setToolStatuses({});
            diagMsg("onNew cancel path complete");
          }
          cancelLockRef.current = false;
          diagMsg("onNow appending message");
          try {
            await core.append(message);
          } catch (e) {
            diagMsg("onNew append error (suppressed):", e instanceof Error ? `${e.message} | ${e.stack?.substring(0, 300)}` : String(e));
          }
          diagMsg("onNew EXIT");
        },
        onEdit: async (message: AppendMessage) => {
          await core.edit(message);
        },
        onReload: (parentId: string | null, config: { runConfig?: any }) =>
          core.reload(parentId, config),
        onCancel: async () => {
          diagMsg("onCancel ENTER");
          cancelLockRef.current = true;
          await core.cancel();
          diagMsg("onCancel after core.cancel()");
          (options.agent as HttpAgent).abortRun();
          diagMsg("onCancel after agent.abortRun()");
          const msgs = core.getMessages();
          diagMsg("onCancel msgs:", msgs.length, "statuses=", msgs.filter(m => m.role === "assistant").map(m => ({ id: m.id, status: m.status?.type })));
          const idx = msgs.findLastIndex((m) => m.role === "assistant");
          if (idx !== -1) {
            diagMsg("onCancel marking assistant idx=", idx, "as incomplete");
            core.applyExternalMessages(
              msgs.map((m, i) =>
                i === idx
                  ? { ...m, content: [], status: { type: "incomplete" as const, reason: "cancelled" as const } } as ThreadMessage
                  : m,
              ),
            );
          }
          toolInvocationsRef.current.reset();
          setToolStatuses({});
          diagMsg("onCancel EXIT");
        },
        onAddToolResult: (options: Parameters<typeof core.addToolResult>[0]) => core.addToolResult(options),
        onResume: (config: Parameters<typeof core.resume>[0]) => core.resume(config),
        onResumeToolCall: (options: { toolCallId: string; payload: unknown }) =>
          toolInvocationsRef.current.resume(
            options.toolCallId,
            options.payload,
          ),
        onImport: (messages: readonly ThreadMessage[]) =>
          core.applyExternalMessages(messages),
        onLoadExternalState: (state: ReadonlyJSONValue) =>
          core.loadExternalState(state),
        adapters: adapterAdapters,
      };
    },
    [adapterAdapters, core, _version],
  );

  const baseRuntime = useExternalStoreRuntime(store as ExternalStoreAdapter<ThreadMessage>);

  const runtime = useMemo<AgUiAssistantRuntime>(() => {
    const wrapper = Object.create(baseRuntime) as AgUiAssistantRuntime;
    wrapper.unstable_getPendingInterrupts = () =>
      core.getPendingInterrupts()?.interrupts ?? [];
    wrapper.unstable_submitInterruptResponses = (responses) =>
      core.submitInterruptResponses(responses);
    return wrapper;
  }, [baseRuntime, core]);

  useEffect(() => {
    core.attachRuntime(runtime);
    return () => {
      core.detachRuntime();
    };
  }, [core, runtime]);

  useEffect(() => {
    core.__internal_load();
  }, [core]);

  return runtime;
}
