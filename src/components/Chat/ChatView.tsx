import { CopilotChat } from "@copilotkit/react-core/v2";
import { UIButton } from "../ui/Button";
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
    <div className="chat-panel">
      {!sidebarOpen && (
        <div className="open-sidebar-btn-w">
          <UIButton
            icon="pi pi-chevron-right"
            text
            rounded
            severity="secondary"
            onClick={onOpenSidebar}
            tooltip={L.chat.openSidebar}
          />
        </div>
      )}
      <CopilotChat
        agentId="default"
        threadId={threadId ?? undefined}
        labels={{
          chatInputPlaceholder: L.chat.inputPlaceholder,
          welcomeMessageText: L.chat.welcomeMessage,
        }}
      />
    </div>
  );
}
