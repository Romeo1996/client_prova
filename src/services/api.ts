const BASE = import.meta.env.VITE_API_BASE ?? "";

export const AGENT_URL = `${BASE}/api/agent/chat`;

export type ThreadMetadata = {
  id: string;
  title?: string | null;
  updated_at?: number | null;
  state?: Record<string, unknown> | null;
};

export async function fetchThreads(userId: string): Promise<ThreadMetadata[]> {
  const url = `${BASE}/api/threads?userId=${encodeURIComponent(userId)}`;
  console.log("[api] fetchThreads:", url);
  try {
    const res = await fetch(url);
    console.log("[api] fetchThreads status:", res.status);
    if (!res.ok) return [];
    const data = await res.json();
    return data.threads ?? [];
  } catch (err) {
    console.error("[api] fetchThreads error:", err);
    return [];
  }
}

export async function deleteThreadOnBE(
  threadId: string,
  userId: string,
): Promise<boolean> {
  const url = `${BASE}/api/threads/${threadId}?userId=${encodeURIComponent(userId)}`;
  console.log("[api] deleteThreadOnBE:", url);
  try {
    const res = await fetch(url, { method: "DELETE" });
    console.log("[api] deleteThreadOnBE status:", res.status);
    return res.ok;
  } catch (err) {
    console.error("[api] deleteThreadOnBE error:", err);
    return false;
  }
}

export async function renameThreadOnBE(
  threadId: string,
  title: string,
  userId: string,
): Promise<boolean> {
  const url = `${BASE}/api/threads/${threadId}?userId=${encodeURIComponent(userId)}`;
  console.log("[api] renameThreadOnBE:", url, "title:", title);
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    console.log("[api] renameThreadOnBE status:", res.status);
    return res.ok;
  } catch (err) {
    console.error("[api] renameThreadOnBE error:", err);
    return false;
  }
}
