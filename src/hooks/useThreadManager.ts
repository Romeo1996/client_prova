import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { ThreadMessage } from "@assistant-ui/react";
import type { ExternalStoreThreadData } from "@assistant-ui/core";
import type { ReadonlyJSONValue } from "assistant-stream/utils";
import { fetchThreads, deleteThreadOnBE, renameThreadOnBE } from "src/services/api";

export type ThreadData = {
  id: string;
  title: string;
  messages: ThreadMessage[];
  state?: ReadonlyJSONValue;
};

type ThreadManagerState = {
  threads: Map<string, ThreadData>;
  activeThreadId: string | undefined;
  initialized: boolean;
};

const extractTitle = (messages: ThreadMessage[]): string | null => {
  const userMsg = messages.find((m) => m.role === "user");
  if (!userMsg) return null;
  const text = userMsg.content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
  if (!text) return null;
  return text.length > 50 ? text.slice(0, 50) + "..." : text;
};

export function useThreadManager(userId: string) {
  const [state, setState] = useState<ThreadManagerState>(() => {
    const initialId = crypto.randomUUID();
    const threads = new Map<string, ThreadData>();
    threads.set(initialId, {
      id: initialId,
      title: "New Chat",
      messages: [],
      state: undefined,
    });
    return { threads, activeThreadId: initialId, initialized: false };
  });

  const refreshThreads = useCallback(async () => {
    if (!userId) return;
    const beThreads = await fetchThreads(userId);
    console.log('[DEBUG] refreshThreads from BE:', JSON.stringify(beThreads.map(t => ({ id: t.id, title: t.title, state: t.state }))));

    setState((prev) => {
      const next = new Map(prev.threads);
      const beIds = new Set(beThreads.map((t) => t.id));

      for (const t of beThreads) {
        if (next.has(t.id)) {
          const existing = next.get(t.id)!;
          const newTitle = t.title ?? existing.title;
          if (newTitle !== existing.title) {
            console.log('[DEBUG] refreshThreads UPDATE title:', existing.title, '->', newTitle, 'for id:', t.id);
          }
          next.set(t.id, {
            ...existing,
            title: newTitle,
            state: (t.state as ReadonlyJSONValue | undefined) ?? existing.state,
          });
        } else {
          const beState = (t.state as ReadonlyJSONValue | undefined) ?? undefined;
          const fallbackTitle = t.title ?? (beState ? "Chat" : null) ?? "New Chat";
          console.log('[DEBUG] refreshThreads ADD new thread id:', t.id, 'title:', t.title, 'fallbackTitle:', fallbackTitle, 'hasState:', !!beState);
          next.set(t.id, {
            id: t.id,
            title: fallbackTitle,
            messages: [],
            state: beState,
          });
        }
      }

      // Remove local empty threads that don't exist on BE,
      // but keep at least one thread so there's always an active chat.
      for (const [id, thread] of next) {
        if (!beIds.has(id) && thread.messages.length === 0 && next.size > 1) {
          next.delete(id);
        }
      }

      if (next.size === 0) {
        const id = crypto.randomUUID();
        next.set(id, { id, title: "New Chat", messages: [], state: undefined });
      }

      const prevId = prev.activeThreadId;
      const activeId =
        (prevId && next.has(prevId)) ? prevId
        : (beThreads[0]?.id ?? [...next.keys()][0]!);
      return { threads: next, activeThreadId: activeId, initialized: true };
    });
  }, [userId]);

  useEffect(() => {
    refreshThreads();
  }, [refreshThreads]);

  const saveThread = useCallback(
    (
      id: string,
      data: { messages: ThreadMessage[]; state?: ReadonlyJSONValue },
    ) => {
      setState((prev) => {
        const next = new Map(prev.threads);
        const existing = next.get(id);
        if (existing) {
          const userTitle = extractTitle(data.messages);
          const stateTitle =
            data.state && typeof data.state === "object" && !Array.isArray(data.state)
              ? (data.state as Record<string, unknown>).thread_title
              : undefined;
          const newTitle = (stateTitle as string | undefined) ?? userTitle ?? existing.title;
          console.log('[DEBUG] saveThread id:', id, 'stateTitle:', stateTitle, 'userTitle:', userTitle, 'existing.title:', existing.title, '-> newTitle:', newTitle, 'msgsCount:', data.messages.length);
          next.set(id, {
            ...existing,
            messages: data.messages,
            state: data.state,
            title: newTitle,
          });
        } else {
          console.log('[DEBUG] saveThread id NOT FOUND in local state:', id);
        }
        return { ...prev, threads: next };
      });
    },
    [],
  );

  const createThread = useCallback(() => {
    const id = crypto.randomUUID();
    setState((prev) => {
      const next = new Map(prev.threads);
      next.set(id, {
        id,
        title: "New Chat",
        messages: [],
        state: undefined,
      });
      return { ...prev, threads: next, activeThreadId: id };
    });
    return id;
  }, []);

  const deleteThread = useCallback(
    (id: string) => {
      deleteThreadOnBE(id, userId).catch(() => {});
      setState((prev) => {
        const next = new Map(prev.threads);
        const wasActive = prev.activeThreadId === id;
        next.delete(id);

        let newActiveId = prev.activeThreadId;
        if (wasActive) {
          if (next.size > 0) {
            newActiveId = next.keys().next().value!;
          } else {
            const newId = crypto.randomUUID();
            next.set(newId, {
              id: newId,
              title: "New Chat",
              messages: [],
              state: undefined,
            });
            newActiveId = newId;
          }
        }
        return { ...prev, threads: next, activeThreadId: newActiveId };
      });
    },
    [userId],
  );

  const getThread = useCallback(
    (id: string): ThreadData | undefined => {
      return state.threads.get(id);
    },
    [state.threads],
  );

  const getThreads = useCallback((): ExternalStoreThreadData<"regular">[] => {
    return Array.from(state.threads.values()).map((t) => ({
      id: t.id,
      title: t.title,
      status: "regular" as const,
    }));
  }, [state.threads]);

  const setActiveThreadId = useCallback((id: string | undefined) => {
    setState((prev) => ({ ...prev, activeThreadId: id }));
  }, []);

  const updateTitle = useCallback(
    (id: string, title: string) => {
      renameThreadOnBE(id, title, userId).catch(() => {});
      setState((prev) => {
        const next = new Map(prev.threads);
        const existing = next.get(id);
        if (existing) {
          next.set(id, { ...existing, title });
        }
        return { ...prev, threads: next };
      });
    },
    [userId],
  );

  const getAllThreadData = useCallback((): ThreadData[] => {
    return Array.from(state.threads.values());
  }, [state.threads]);

  return {
    activeThreadId: state.activeThreadId,
    setActiveThreadId,
    createThread,
    deleteThread,
    saveThread,
    getThread,
    getThreads,
    getAllThreadData,
    updateTitle,
    refreshThreads,
    initialized: state.initialized,
  } as const;
}

// --- Fork sibling context for BranchPicker ---

export type BranchSibling = {
  threadId: string;
  title?: string;
};

export type ThreadBranchContextType = {
  messageToSiblings: Record<string, BranchSibling[]>;
  currentThreadId: string | undefined;
};

export const ThreadBranchContext = createContext<ThreadBranchContextType>({
  messageToSiblings: {},
  currentThreadId: undefined,
});

export function useThreadBranchInfo() {
  return useContext(ThreadBranchContext);
}

export function computeBranchInfo(
  allThreads: ThreadData[],
  activeThreadId: string | undefined,
): ThreadBranchContextType {
  const messageToSiblings: Record<string, BranchSibling[]> = {};

  for (const thread of allThreads) {
    if (!thread.state) continue;
    const state = thread.state as Record<string, unknown>;
    const forkParentId = state.__forkParentId as string | undefined;
    const forkParentMsgId = state.__forkParentMessageId as string | undefined;
    if (!forkParentId || !forkParentMsgId) continue;

    const siblings: BranchSibling[] = [];

    const parentThread = allThreads.find((t) => t.id === forkParentId);
    if (parentThread) {
      siblings.push({ threadId: parentThread.id, title: parentThread.title });
    }

    for (const other of allThreads) {
      if (other.id === thread.id) continue;
      const otherState = other.state as Record<string, unknown> | undefined;
      if (
        otherState?.__forkParentId === forkParentId &&
        otherState?.__forkParentMessageId === forkParentMsgId
      ) {
        siblings.push({ threadId: other.id, title: other.title });
      }
    }

    siblings.push({ threadId: thread.id, title: thread.title });

    if (siblings.length > 1) {
      messageToSiblings[forkParentMsgId] = siblings;
    }
  }

  return { messageToSiblings, currentThreadId: activeThreadId };
}
