const BASE = import.meta.env.VITE_API_BASE ?? "";

export const AGENT_URL = `${BASE}/api/agent/chat`;

export type ThreadMetadata = {
  id: string;
  title?: string | null;
  updated_at?: number | null;
  state?: Record<string, unknown> | null;
};

export async function fetchThreads(userId: string): Promise<ThreadMetadata[]> {
  try {
    const res = await fetch(
      `${BASE}/api/threads?userId=${encodeURIComponent(userId)}`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.threads ?? [];
  } catch {
    return [];
  }
}

export async function deleteThreadOnBE(
  threadId: string,
  userId: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${BASE}/api/threads/${threadId}?userId=${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function renameThreadOnBE(
  threadId: string,
  title: string,
  userId: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${BASE}/api/threads/${threadId}?userId=${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}
