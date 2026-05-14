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
    <div className={`sidebar-panel ${closed ? "closed" : ""}`}>
      <div className="sidebar-inner">
        <div className="sidebar-header-row">
          <UIButton
            label={L.sidebar.newChat}
            icon="pi pi-plus"
            onClick={onNewChat}
            className="sidebar-btn-full"
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

        <div className="sidebar-scroll">
          {threads.length === 0 ? (
            <div className="sidebar-empty">{L.sidebar.empty}</div>
          ) : (
            threads.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                active={t.id === activeId}
                onSelect={onSelectThread}
                onDelete={onDeleteThread}
              />
            ))
          )}
        </div>

        <div className="sidebar-footer">
          <div className="theme-row">
            <PrimeIcon name="moon" className="theme-icon" />
            <UISwitch checked={dark} onChange={onToggleTheme} />
            <PrimeIcon name="sun" className="theme-icon" />
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
      className={`thread-row ${active ? "active" : ""}`}
      onClick={() => onSelect(thread.id)}
    >
      <PrimeIcon name="comment" className="icon-muted" />
      <div className="thread-title">{thread.title}</div>
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
  );
}
