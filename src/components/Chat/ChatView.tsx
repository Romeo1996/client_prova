import { CopilotChat } from "@copilotkit/react-core/v2";
import { AssistantBubble } from "../chat/AssistantBubble";
import { UserBubble } from "../chat/UserBubble";
import { ChatCursor } from "../chat/ChatCursor";
import { ChatHeader } from "../chat/ChatHeader";
import { L } from "../../labels";

interface ChatViewProps {
  threadId: string | null;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
}

export function ChatView({
  threadId,
  sidebarOpen,
  onOpenSidebar,
}: ChatViewProps) {
  return (
    <div className="flex-1 flex flex-col min-w-0">
      <ChatHeader sidebarOpen={sidebarOpen} onOpenSidebar={onOpenSidebar} />

      <div className="flex-1 flex flex-col max-w-[720px] mx-auto w-full">
        <CopilotChat
          agentId="default"
          threadId={threadId ?? undefined}
          labels={{
            chatInputPlaceholder: L.chat.inputPlaceholder,
            welcomeMessageText: L.chat.welcomeMessage,
          }}
          messageView={{
            assistantMessage: AssistantBubble as any,
            userMessage: UserBubble as any,
            cursor: ChatCursor as any,
          }}
          feather="hidden"
          inputContainer="bg-background/80 backdrop-blur-sm border-t border-border px-4 py-3"
          input={{
            textArea:
              "w-full bg-card border border-border rounded-xl px-4 py-3 pr-12 text-sm text-primary placeholder:text-primary-secondary focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 resize-none max-h-[200px] leading-relaxed",
            sendButton:
              "bg-accent hover:bg-accent-hover text-white rounded-xl w-9 h-9 flex items-center justify-center transition-all active:scale-95 disabled:opacity-40",
          }}
        />
      </div>
    </div>
  );
}
