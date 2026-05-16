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

function applySkipHeuristic(messages: readonly ThreadMessage[]): ThreadMessage[] {
  let hasLaterUser = false;
  const result: ThreadMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") {
      hasLaterUser = true;
      result.unshift(m);
    } else if (m.role === "assistant" && hasLaterUser) {
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
  const notifyUpdate = useCallback(() => setVersion((v) => v + 1), []);
  const coreRef = useRef<AgUiThreadRuntimeCore | null>(null);
  const runtimeAdapters = useRuntimeAdapters();

  const historyAdapter = options.adapters?.history ?? runtimeAdapters?.history;
  const threadListAdapter = options.adapters?.threadList;

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

      return {
        isLoading: core.isLoading,
        messages,
        state: core.getState(),
        isRunning: cancelLockRef.current ? false : messages.some((m) => m.role === "assistant" && m.status?.type === "running"),
        setMessages: (messages: readonly ThreadMessage[]) =>
          core.applyExternalMessages(messages),
        onNew: async (message: AppendMessage) => {
          if (core.isRunning()) {
            cancelLockRef.current = true;
            await core.cancel();
            (options.agent as HttpAgent).abortRun();
            const msgs = core.getMessages();
            core.applyExternalMessages(
              msgs.map((m) =>
                m.role === "assistant"
                  ? { ...m, content: [], status: { type: "incomplete" as const, reason: "cancelled" as const } }
                  : m,
              ),
            );
            toolInvocationsRef.current.reset();
            setToolStatuses({});
          }
          cancelLockRef.current = false;
          await core.append(message);
        },
        onEdit: async (message: AppendMessage) => {
          await core.edit(message);
        },
        onReload: (parentId: string | null, config: { runConfig?: any }) =>
          core.reload(parentId, config),
        onCancel: async () => {
          cancelLockRef.current = true;
          await core.cancel();
          (options.agent as HttpAgent).abortRun();
          const msgs = core.getMessages();
          core.applyExternalMessages(
            msgs.map((m) =>
              m.role === "assistant"
                ? { ...m, content: [], status: { type: "incomplete" as const, reason: "cancelled" as const } }
                : m,
            ),
          );
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
