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
  ExternalStoreThreadListAdapter,
  FeedbackAdapter,
  SpeechSynthesisAdapter,
  ThreadHistoryAdapter,
  ThreadMessage,
} from "@assistant-ui/core";
import type { ReadonlyJSONValue } from "assistant-stream/utils";
import { makeLogger } from "@assistant-ui/react-ag-ui/runtime/logger";
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

export type CustomThreadListAdapter = ExternalStoreThreadListAdapter & {
  onSwitchToNewThread?: (() => Promise<void> | void) | undefined;
  onSwitchToThread?:
    | ((threadId: string) =>
        | Promise<{
            messages: readonly ThreadMessage[];
            state?: ReadonlyJSONValue;
          }>
        | { messages: readonly ThreadMessage[]; state?: ReadonlyJSONValue })
    | undefined;
  onBeforeSwitch?:
    | ((
        messages: readonly ThreadMessage[],
        state?: ReadonlyJSONValue,
      ) => void)
    | undefined;
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
    threadList?: CustomThreadListAdapter;
  };
};

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
            onBeforeSwitch?.(core.getMessages(), core.getState());
            toolInvocationsRef.current.reset();
            await onSwitchToNewThread();
            core.applyExternalMessages([]);
          }
        : undefined,
      onSwitchToThread: onSwitchToThread
        ? async (targetId: string) => {
            onBeforeSwitch?.(core.getMessages(), core.getState());
            toolInvocationsRef.current.reset();
            const result = await onSwitchToThread(targetId);
            core.applyExternalMessages(result.messages);
            if (result.state) {
              core.loadExternalState(result.state);
            }
          }
        : undefined,
    } satisfies ExternalStoreThreadListAdapter;
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

      return {
        isLoading: core.isLoading,
        messages: core.getMessages(),
        state: core.getState(),
        isRunning: core.isRunning() || hasExecutingTools,
        onNew: (message: AppendMessage) => core.append(message),
        onEdit: (message: AppendMessage) => core.edit(message),
        onReload: (parentId: string | null, config: { runConfig?: any }) =>
          core.reload(parentId, config),
        onCancel: () => {
          core.cancel();
          setToolStatuses({});
          toolInvocationsRef.current.abort();
        },
        onAddToolResult: (options) => core.addToolResult(options),
        onResume: (config) => core.resume(config),
        onResumeToolCall: (options) =>
          toolInvocationsRef.current.resume(
            options.toolCallId,
            options.payload,
          ),
        setMessages: (messages: readonly ThreadMessage[]) =>
          core.applyExternalMessages(messages),
        onImport: (messages: readonly ThreadMessage[]) =>
          core.applyExternalMessages(messages),
        onLoadExternalState: (state: ReadonlyJSONValue) =>
          core.loadExternalState(state),
        adapters: adapterAdapters,
      } satisfies ExternalStoreAdapter<ThreadMessage>;
    },
    [adapterAdapters, core, _version, hasExecutingTools],
  );

  const baseRuntime = useExternalStoreRuntime(store);

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
