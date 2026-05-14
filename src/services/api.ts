import { L } from "../labels";

const BASE = import.meta.env.VITE_API_BASE ?? "";

export const AGENT_URL = `${BASE}/api/agent/chat`;
export const AGENTS_STATE_URL = `${BASE}/api/agent/agents/state`;

type ErrorListener = (msg: string) => void;
let onError: ErrorListener | null = null;

export function setErrorHandler(h: ErrorListener) {
  onError = h;
}

export async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = `${L.error.summary} ${res.status}: ${res.statusText}`;
    onError?.(detail);
    throw new Error(detail);
  }
  return res.json();
}
