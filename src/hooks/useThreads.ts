import { useState, useCallback } from "react";
import type { Thread } from "../models/thread";
import {
  loadThreads,
  saveThreads,
  createThread,
  fetchThreadState,
  extractThreadTitle,
} from "../services/threads";

export function useThreads() {
  const [threads, setThreads] = useState<Thread[]>(loadThreads);
  const [activeId, setActiveId] = useState<string | null>(null);

  const newChat = useCallback(() => {
    const t = createThread();
    const updated = [t, ...threads];
    setThreads(updated);
    saveThreads(updated);
    setActiveId(t.id);
    return t.id;
  }, [threads]);

  const selectThread = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const deleteThread = useCallback(
    (id: string) => {
      const updated = threads.filter((t) => t.id !== id);
      setThreads(updated);
      saveThreads(updated);
      if (activeId === id) {
        setActiveId(updated[0]?.id ?? null);
      }
    },
    [threads, activeId]
  );

  const tryUpdateTitle = useCallback(
    async (threadId: string) => {
      const state = await fetchThreadState(threadId);
      if (!state) return;
      const title = extractThreadTitle(state);
      if (!title) return;
      setThreads((prev) => {
        const updated = prev.map((t) =>
          t.id === threadId ? { ...t, title } : t
        );
        saveThreads(updated);
        return updated;
      });
    },
    []
  );

  return {
    threads,
    activeId,
    setActiveId,
    newChat,
    selectThread,
    deleteThread,
    tryUpdateTitle,
  };
}
