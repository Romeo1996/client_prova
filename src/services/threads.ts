import type { Thread, ThreadStateResponse } from "../models/thread";
import { AGENTS_STATE_URL, post } from "./api";
import { L } from "../labels";

const STORAGE_KEY = "chat_threads";
const DEFAULT_TITLE = L.thread.defaultTitle;

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function loadThreads(): Thread[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveThreads(threads: Thread[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
}

export function createThread(): Thread {
  return { id: generateId(), title: DEFAULT_TITLE, timestamp: Date.now() };
}

export async function fetchThreadState(
  threadId: string
): Promise<ThreadStateResponse | null> {
  try {
    return await post<ThreadStateResponse>(AGENTS_STATE_URL, {
      threadId,
    });
  } catch {
    return null;
  }
}

export function extractThreadTitle(data: ThreadStateResponse): string | null {
  if (!data.messages?.length) return null;
  const first = data.messages.find((m) => m.role === "user");
  if (!first?.content) return null;
  const text =
    typeof first.content === "string"
      ? first.content
      : (first.content as unknown as { text?: string }[])?.[0]?.text ?? "";
  if (!text) return null;
  return text.length > 60 ? text.slice(0, 60) + "..." : text;
}
