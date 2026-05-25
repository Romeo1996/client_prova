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
  onSwitchToNewThread?: () => Promise<string | void>;
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
    targetThreadId?: string,
  ) => void;
};

type RunCompleteData = {
  threadId: string;
  messages: ThreadMessage[];
  state?: ReadonlyJSONValue;
};

type UseCustomRuntimeOptions = {
  agent: ConstructorParameters<typeof AgUiThreadRuntimeCore>[0]["agent"];
  logger?: ConstructorParameters<typeof AgUiThreadRuntimeCore>[0]["logger"];
  showThinking?: boolean;
  onError?: (e: Error) => void;
  onCancel?: () => void;
  onRunComplete?: (data: RunCompleteData) => void;
  adapters?: {
    attachments?: AttachmentAdapter;
    speech?: SpeechSynthesisAdapter;
    dictation?: DictationAdapter;
    feedback?: FeedbackAdapter;
    history?: ThreadHistoryAdapter;
    threadList?: ThreadListAdapter;
  };
};

function applySkipHeuristic(messages: readonly ThreadMessage[]): ThreadMessage[] {
  let hasLaterUser = false;
  const result: ThreadMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") {
      hasLaterUser = true;
      result.unshift(m);
    } else if (m.role === "assistant" && hasLaterUser && m.status?.type === "running") {
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
    setVersion((v) => v + 1);
  }, []);
  const coreRef = useRef<AgUiThreadRuntimeCore | null>(null);
  const runtimeAdapters = useRuntimeAdapters();

  const historyAdapter = options.adapters?.history ?? runtimeAdapters?.history;
  const threadListAdapter = options.adapters?.threadList;

  const onRunCompleteRef = useRef(options.onRunComplete);
  onRunCompleteRef.current = options.onRunComplete;

  if (!coreRef.current) {
    coreRef.current = new AgUiThreadRuntimeCore({
      agent: options.agent,
      logger,
      showThinking: options.showThinking ?? true,
      ...(options.onError && { onError: options.onError }),
      ...(options.onCancel && { onCancel: options.onCancel }),
      ...(historyAdapter && { history: historyAdapter }),
      notifyUpdate,
    });

    const coreAny = coreRef.current as any;

    // Monkey-patch handleEvent: guard terminal transitions, convert pipeline errors
    const origHandleEvent = coreAny.handleEvent.bind(coreAny);
    coreAny.handleEvent = (aggregator: any, event: any) => {
      // Convert pipeline validation/ordering errors to RUN_FINISHED
      if (event.type === "RUN_ERROR" && typeof event.message === "string") {
        const isPipelineError = event.message.includes("Cannot send event type") || event.message.includes("First event must");
        if (isPipelineError) {
          return origHandleEvent(aggregator, { type: "RUN_FINISHED" });
        }
      }
      // Guard against terminal-state transitions after user cancel or completion
      const terminalStates = ["incomplete", "complete"];
      if (aggregator.status && terminalStates.includes(aggregator.status.type)) {
        if (event.type === "RUN_FINISHED" || event.type === "RUN_ERROR" || event.type === "RUN_CANCELLED") {
          return;
        }
      }
      const result = origHandleEvent(aggregator, event);
      if (event.type === "RUN_FINISHED") {
        const cb = onRunCompleteRef.current;
        if (cb) {
          const core = coreRef.current as any;
          const threadId = core?.agent?.threadId;
          if (threadId) {
            const state = core.getState();
            const msgs = core.getMessages();
            console.log('[DEBUG] RUN_FINISHED threadId:', threadId, 'state:', JSON.stringify(state), 'msgsCount:', msgs.length);
            cb({ threadId, messages: msgs, state });
          }
        }
      }
      return result;
    };

    // Monkey-patch buildRunInput to preserve fork metadata in state
    const origBuildInput = coreAny.buildRunInput.bind(coreAny);
    coreAny.buildRunInput = (runId: string, config: any, messages: any, resume?: any) => {
      const snapshot = coreAny.stateSnapshot as Record<string, unknown> | undefined;
      const forkParentId = config.state?.__forkParentId ?? snapshot?.__forkParentId;
      const forkParentMsgId = config.state?.__forkParentMessageId ?? snapshot?.__forkParentMessageId;
      const state = { ...config.state };
      if (forkParentId) state.__forkParentId = forkParentId;
      if (forkParentMsgId) state.__forkParentMessageId = forkParentMsgId;
      return origBuildInput(runId, { ...config, state }, messages, resume);
    };

    // Monkey-patch fetch to:
    //   1) Suppress AbortError from premature stream closure
    //   2) Parse SSE events line-by-line
    //   3) Convert RUN_ERROR to text content so errors are visible in the message
    //   4) Strip RUN_FINISHED after RUN_ERROR to prevent pipeline validation errors
    const origFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      try {
        const response = await origFetch(input, init);
        if (url.includes("/api/agent/chat") && response.ok && response.body) {
          const reader = response.body.getReader();
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
                  buffer += decoder.decode(value, { stream: true });
                  let eventEnd;
                  while ((eventEnd = buffer.indexOf('\n\n')) !== -1) {
                    const sseBlock = buffer.slice(0, eventEnd);
                    buffer = buffer.slice(eventEnd + 2);
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
                          // Stripped — onRunFinalized will dispatch a synthetic RUN_FINISHED
                        } else {
                          controller.enqueue(new TextEncoder().encode(`data: ${jsonStr}\n\n`));
                        }
                      } catch {
                        controller.enqueue(new TextEncoder().encode(`data: ${jsonStr}\n\n`));
                      }
                    }
                  }
                }
                if (buffer.length > 0) {
                  controller.enqueue(new TextEncoder().encode(buffer));
                }
              } catch {
                // AbortError and other stream errors are silently handled
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
        throw err;
      }
    };
  }

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
      onDelete: onDelete
        ? async (id: string) => {
            const wasActive = threadId === id;
            const otherThreads = (threads ?? []).filter(t => t.id !== id);
            await onDelete(id);
            if (wasActive) {
              if (otherThreads.length > 0) {
                (options.agent as any).threadId = otherThreads[0].id;
                const data = (threadListAdapter as any).getThread?.(otherThreads[0].id);
                if (data) {
                  core.applyExternalMessages(data.messages);
                  const state = data.state as Record<string, unknown> | undefined;
                  if (state) core.loadExternalState(state as any);
                }
              } else {
                const newId = crypto.randomUUID();
                (options.agent as any).threadId = newId;
                core.applyExternalMessages([]);
              }
            }
          }
        : undefined,
      onRename,
      onArchive,
      onUnarchive,
      onSwitchToNewThread: onSwitchToNewThread
        ? async () => {
            cancelLockRef.current = false;
            const beforeState = core.getState();
            const beforeMsgs = core.getMessages();
            console.log('[DEBUG] useCustomRuntime onSwitchToNewThread BEFORE - state:', JSON.stringify(beforeState), 'msgsCount:', beforeMsgs.length);
            onBeforeSwitch?.(beforeMsgs, beforeState);
            toolInvocationsRef.current.reset();
            const newId = await onSwitchToNewThread();
            console.log('[DEBUG] useCustomRuntime onSwitchToNewThread AFTER - newId:', newId);
            if (newId) (options.agent as any).threadId = newId;
            core.applyExternalMessages([]);
            core.loadExternalState({});
            console.log('[DEBUG] useCustomRuntime onSwitchToNewThread DONE - state after reset:', JSON.stringify(core.getState()));
          }
        : undefined,
      onSwitchToThread: onSwitchToThread
        ? async (targetId: string) => {
            cancelLockRef.current = false;
            const beforeState = core.getState();
            const beforeMsgs = core.getMessages();
            console.log('[DEBUG] useCustomRuntime onSwitchToThread BEFORE - targetId:', targetId, 'currentId:', (options.agent as any).threadId, 'state:', JSON.stringify(beforeState), 'msgsCount:', beforeMsgs.length);
            onBeforeSwitch?.(beforeMsgs, beforeState);
            toolInvocationsRef.current.reset();
            (options.agent as any).threadId = targetId;
            const result = await onSwitchToThread(targetId);
            console.log('[DEBUG] useCustomRuntime onSwitchToThread RESULT - result state:', JSON.stringify(result.state), 'result msgsCount:', result.messages.length);
            core.applyExternalMessages(result.messages);
            const state = result.state as Record<string, unknown> | undefined;
            if (state) {
              core.loadExternalState(state as any);
              console.log('[DEBUG] useCustomRuntime onSwitchToThread loaded state:', JSON.stringify(state));
            } else {
              core.loadExternalState({});
              console.log('[DEBUG] useCustomRuntime onSwitchToThread no state, reset to {}');
            }
            console.log('[DEBUG] useCustomRuntime onSwitchToThread DONE - core.getState():', JSON.stringify(core.getState()));
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

      return {
        isLoading: core.isLoading,
        messages,
        state: core.getState(),
        isRunning: computedIsRunning,
        setMessages: (incoming: readonly ThreadMessage[]) => {
          if (cancelLockRef.current) return;
          core.applyExternalMessages(incoming);
        },
        onNew: async (message: AppendMessage) => {
          console.log('[DEBUG] store.onNew threadId:', (options.agent as any)?.threadId, 'msg:', JSON.stringify(message), 'current state:', JSON.stringify(core.getState()), 'current msgs:', core.getMessages().length);
          if (core.isRunning()) {
            const preCancelMsgs = core.getMessages();
            const hasRunning = preCancelMsgs.some(
              (m) => m.role === "assistant" && m.status?.type === "running",
            );
            if (!hasRunning) {
              cancelLockRef.current = false;
              try {
                await core.append(message);
              } catch {
                // suppressed
              }
              return;
            }
            cancelLockRef.current = true;
            await core.cancel();
            (options.agent as HttpAgent).abortRun();
            const msgs = core.getMessages();
            const idx = msgs.findLastIndex((m) => m.role === "assistant");
            if (idx !== -1) {
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
          }
          cancelLockRef.current = false;
          try {
            await core.append(message);
          } catch {
            // suppressed
          }
        },
        onEdit: async (message: AppendMessage) => {
          await core.edit(message);
        },
        onReload: async (parentId: string | null, config: { runConfig?: any } = {}) => {
          const adapter = threadListAdapter;
          if (adapter?.onSwitchToNewThread) {
            const currentMessages = core.getMessages();
            adapter.onBeforeSwitch?.(currentMessages, core.getState());

            const parentIdx = parentId
              ? currentMessages.findIndex(m => m.id === parentId)
              : currentMessages.findLastIndex(m => m.role === "user");
            const truncated = parentIdx >= 0 ? currentMessages.slice(0, parentIdx + 1) : [];

            const newThreadId = await adapter.onSwitchToNewThread();
            if (newThreadId) {
              (options.agent as any).threadId = newThreadId;
              core.applyExternalMessages(truncated);

              const forkState = {
                __forkParentId: adapter.threadId,
                __forkParentMessageId: parentId ?? truncated.at(-1)?.id ?? null,
              } as any;

              core.loadExternalState({ ...(core.getState() as any), ...forkState });
              adapter.onBeforeSwitch?.(truncated, forkState, newThreadId);

              return core.reload(parentId, config);
            }
          }
          return core.reload(parentId, config);
        },
        onCancel: async () => {
          cancelLockRef.current = true;
          await core.cancel();
          (options.agent as HttpAgent).abortRun();
          const msgs = core.getMessages();
          const idx = msgs.findLastIndex((m) => m.role === "assistant");
          if (idx !== -1) {
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
