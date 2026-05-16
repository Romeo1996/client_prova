import { useState, useCallback } from "react";
import type { ThreadMessage } from "@assistant-ui/react";
import type { ExternalStoreThreadData } from "@assistant-ui/core";
import type { ReadonlyJSONValue } from "assistant-stream/utils";

export type ThreadData = {
  id: string;
  title: string;
  messages: ThreadMessage[];
  state?: ReadonlyJSONValue;
};

type ThreadManagerState = {
  threads: Map<string, ThreadData>;
  activeThreadId: string | undefined;
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

export function useThreadManager() {
  const [state, setState] = useState<ThreadManagerState>(() => {
    const initialId = crypto.randomUUID();
    const threads = new Map<string, ThreadData>();
    threads.set(initialId, {
      id: initialId,
      title: "New Chat",
      messages: [],
      state: undefined,
    });
    return { threads, activeThreadId: initialId };
  });

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
      return { threads: next, activeThreadId: id };
    });
    return id;
  }, []);

  const deleteThread = useCallback((id: string) => {
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

      return { threads: next, activeThreadId: newActiveId };
    });
  }, []);

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
          next.set(id, {
            ...existing,
            messages: data.messages,
            state: data.state,
            title: userTitle ?? existing.title,
          });
        }
        return { ...prev, threads: next };
      });
    },
    [],
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

  const updateTitle = useCallback((id: string, title: string) => {
    setState((prev) => {
      const next = new Map(prev.threads);
      const existing = next.get(id);
      if (existing) {
        next.set(id, { ...existing, title });
      }
      return { ...prev, threads: next };
    });
  }, []);

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
    getThreadCount: state.threads.size,
    isEmpty: state.threads.size === 0,
  } as const;
}
