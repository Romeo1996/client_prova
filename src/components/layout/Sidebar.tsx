import type { Thread } from "../../models/thread";
import { UIButton } from "../ui/Button";
import { UISwitch } from "../ui/InputSwitchX";
import { PrimeIcon } from "../ui/Icon";
import { L } from "../../labels";

interface SidebarProps {
  threads: Thread[];
  activeId: string | null;
  dark: boolean;
  closed: boolean;
  onNewChat: () => void;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  onToggleTheme: () => void;
  onClose: () => void;
}

export function Sidebar({
  threads,
  activeId,
  dark,
  closed,
  onNewChat,
  onSelectThread,
  onDeleteThread,
  onToggleTheme,
  onClose,
}: SidebarProps) {
  return (
    <div
      className={`bg-sidebar border-r border-border flex flex-col transition-all duration-300 overflow-hidden ${
        closed ? "w-0" : "w-72"
      }`}
    >
      <div className="flex flex-col h-full min-w-72">
        <div className="p-3 border-b border-border flex gap-2 items-center">
          <UIButton
            label={L.sidebar.newChat}
            icon="pi pi-plus"
            onClick={onNewChat}
            className="flex-1"
          />
          <UIButton
            icon="pi pi-chevron-left"
            text
            rounded
            severity="secondary"
            onClick={onClose}
            tooltip={L.sidebar.close}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {threads.length === 0 ? (
            <div className="text-center py-6 text-primary-secondary text-sm">
              {L.sidebar.empty}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {threads.map((t) => (
                <ThreadRow
                  key={t.id}
                  thread={t}
                  active={t.id === activeId}
                  onSelect={onSelectThread}
                  onDelete={onDeleteThread}
                />
              ))}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border">
          <div className="flex items-center justify-center gap-2">
            <PrimeIcon name="moon" className="text-sm text-primary-secondary" />
            <UISwitch checked={dark} onChange={onToggleTheme} />
            <PrimeIcon name="sun" className="text-sm text-primary-secondary" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ThreadRow({
  thread,
  active,
  onSelect,
  onDelete,
}: {
  thread: Thread;
  active: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-sm transition-all duration-150 ${
        active
          ? "bg-accent-soft text-primary"
          : "text-primary-secondary hover:bg-white/[0.04] hover:text-primary"
      }`}
      onClick={() => onSelect(thread.id)}
    >
      <PrimeIcon name="comment" className="text-xs opacity-60 flex-shrink-0" />
      <div className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
        {thread.title}
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <UIButton
          icon="pi pi-trash"
          text
          rounded
          severity="danger"
          size="small"
          tooltip={L.sidebar.delete}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(thread.id);
          }}
        />
      </div>
    </div>
  );
}
