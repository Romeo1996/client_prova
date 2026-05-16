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

      // Convert the known pipeline false-error to RUN_FINISHED
      if (event.type === "RUN_ERROR" && typeof event.message === "string" && event.message.includes("Cannot send event type")) {
        diagMsg("HANDLE_EVENT CONVERT pipeline error to RUN_FINISHED (original msg truncated)");
        return origHandleEvent(aggregator, { type: "RUN_FINISHED" });
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
              await core.append(message);
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
          await core.append(message);
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
