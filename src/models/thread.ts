export interface Thread {
  id: string;
  title: string;
  timestamp: number;
}

export interface ThreadStateResponse {
  threadId: string;
  threadExists: boolean;
  state: Record<string, unknown>;
  messages: ThreadMessage[];
}

export interface ThreadMessage {
  role: "user" | "assistant" | "tool";
  content: string | ThreadMessageContent[];
  id?: string;
  tool_call_id?: string;
}

export interface ThreadMessageContent {
  text: string;
  type?: string;
}
