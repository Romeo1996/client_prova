import { useEffect, useState } from "react";
import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import { HttpAgent } from "@ag-ui/client";
import { Toast } from "primereact/toast";

import { AGENT_URL } from "./services/api";
import { L } from "./labels";
import { useTheme } from "./hooks/useTheme";
import { useThreads } from "./hooks/useThreads";
import { useAppToast } from "./hooks/useToast";
import { Sidebar } from "./components/layout/Sidebar";
import { ChatView } from "./components/Chat/ChatView";

const agent = new HttpAgent({ url: AGENT_URL });

export default function App() {
  const toastRef = useAppToast();
  const { dark, toggle: toggleTheme } = useTheme();
  const {
    threads,
    activeId,
    newChat,
    selectThread,
    deleteThread,
    tryUpdateTitle,
  } = useThreads();

  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (!activeId) return;
    const thread = threads.find((t) => t.id === activeId);
    if (thread?.title === L.thread.defaultTitle) {
      const timer = setTimeout(() => tryUpdateTitle(activeId), 3000);
      return () => clearTimeout(timer);
    }
  }, [activeId, threads, tryUpdateTitle]);

  const handleNewChat = () => {
    newChat();
    setSidebarOpen(false);
  };

  return (
    <>
      <Toast ref={toastRef} />
      <CopilotKitProvider agents__unsafe_dev_only={{ default: agent }}>
        <div className="flex h-dvh bg-background">
          <Sidebar
            threads={threads}
            activeId={activeId}
            dark={dark}
            closed={!sidebarOpen}
            onNewChat={handleNewChat}
            onSelectThread={selectThread}
            onDeleteThread={deleteThread}
            onToggleTheme={toggleTheme}
            onClose={() => setSidebarOpen(false)}
          />

          <ChatView
            threadId={activeId}
            sidebarOpen={sidebarOpen}
            onOpenSidebar={() => setSidebarOpen(true)}
          />
        </div>
      </CopilotKitProvider>
    </>
  );
}
