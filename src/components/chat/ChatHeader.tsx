import { UIButton } from "../ui/Button";
import { L } from "../../labels";

interface ChatHeaderProps {
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
}

export function ChatHeader({ sidebarOpen, onOpenSidebar }: ChatHeaderProps) {
  return (
    <div className="h-12 flex items-center justify-between px-4 border-b border-border">
      <div className="flex items-center gap-3">
        {!sidebarOpen && (
          <UIButton
            icon="pi pi-chevron-right"
            text
            rounded
            severity="secondary"
            onClick={onOpenSidebar}
            tooltip={L.chat.openSidebar}
          />
        )}
        <span className="text-sm font-medium text-primary">ADK Chat</span>
        <span className="text-xs bg-accent-soft text-accent px-2 py-0.5 rounded-full font-medium">
          online
        </span>
      </div>
    </div>
  );
}
