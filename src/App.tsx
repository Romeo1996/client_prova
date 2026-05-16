import { useMemo } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { HttpAgent } from "@ag-ui/client";
import { Thread } from "./components/assistant-ui/thread";
import { ThreadList } from "./components/assistant-ui/thread-list";
import { Sidebar, SidebarContent, SidebarFooter, SidebarInset, SidebarProvider, SidebarTrigger } from "./components/ui/sidebar";
import { ThemeToggle } from "./components/theme-toggle";
import { TooltipProvider } from "./components/ui/tooltip";
import { AGENT_URL } from "./services/api";
import { useCustomRuntime } from "./hooks/useCustomRuntime";
import { useThreadManager } from "./hooks/useThreadManager";

const agent = new HttpAgent({ url: AGENT_URL });

export default function App() {
  const { activeThreadId, getThreads, saveThread, createThread, setActiveThreadId, getThread, deleteThread } = useThreadManager();

  const threadListAdapter = useMemo(
    () => ({
      threadId: activeThreadId,
      threads: getThreads(),
      isLoading: false,
      onBeforeSwitch: (messages: any, state?: any) => {
        if (activeThreadId) saveThread(activeThreadId, { messages, state });
      },
      onSwitchToNewThread: async () => {
        createThread();
      },
      onSwitchToThread: async (id: string) => {
        setActiveThreadId(id);
        const t = getThread(id);
        return { messages: t?.messages ?? [], state: t?.state };
      },
      onDelete: async (id: string) => {
        deleteThread(id);
      },
    }),
    [activeThreadId, getThreads, saveThread, createThread, setActiveThreadId, getThread, deleteThread],
  );

  const runtime = useCustomRuntime({ agent, adapters: { threadList: threadListAdapter } });

  return (
    <TooltipProvider>
      <AssistantRuntimeProvider runtime={runtime}>
        <SidebarProvider>
          <div className="flex h-dvh w-full">
            <Sidebar>
              <SidebarContent className="px-2">
                <ThreadList />
              </SidebarContent>
              <SidebarFooter className="border-t border-sidebar-border px-2 py-2">
                <ThemeToggle />
              </SidebarFooter>
            </Sidebar>
            <SidebarInset>
              <SidebarTrigger className="fixed top-4 left-4 z-30" />
              <Thread />
            </SidebarInset>
          </div>
        </SidebarProvider>
      </AssistantRuntimeProvider>
    </TooltipProvider>
  );
}
