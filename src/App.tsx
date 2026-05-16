import { useMemo } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { HttpAgent } from "@ag-ui/client";
import { Thread } from "./components/assistant-ui/thread";
import { ThreadList } from "./components/assistant-ui/thread-list";
import { Sidebar, SidebarContent, SidebarFooter, SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "./components/ui/sidebar";
import { ThemeToggle } from "./components/theme-toggle";
import { TooltipProvider } from "./components/ui/tooltip";
import { AGENT_URL } from "./services/api";
import { cn } from "./lib/utils";
import { useCustomRuntime } from "./hooks/useCustomRuntime";
import { useThreadManager } from "./hooks/useThreadManager";
import { ThreadBranchContext, computeBranchInfo } from "./hooks/useThreadBranchInfo";

const agent = new HttpAgent({ url: AGENT_URL });

function SidebarTriggerWrapper() {
  const { open } = useSidebar();
  return (
    <SidebarTrigger
      className={cn(
        "fixed top-1 z-30 h-9 w-9 transition-[left] duration-200 ease-linear",
        open ? "left-[calc(var(--sidebar-width)+8px)]" : "left-4"
      )}
    />
  );
}

export default function App() {
  const { activeThreadId, getThreads, saveThread, createThread, setActiveThreadId, getThread, deleteThread, getAllThreadData } = useThreadManager();

  const threadListAdapter = useMemo(
    () => ({
      threadId: activeThreadId,
      threads: getThreads(),
      isLoading: false,
      onBeforeSwitch: (messages: any, state?: any) => {
        if (activeThreadId) saveThread(activeThreadId, { messages, state });
      },
      onSwitchToNewThread: async () => {
        return createThread();
      },
      onSwitchToThread: async (id: string) => {
        setActiveThreadId(id);
        const t = getThread(id);
        return { messages: t?.messages ?? [], state: t?.state };
      },
      getThread: (id: string) => {
        const t = getThread(id);
        return t ? { messages: t.messages, state: t.state } : undefined;
      },
      onDelete: async (id: string) => {
        deleteThread(id);
      },
    }),
    [activeThreadId, getThreads, saveThread, createThread, setActiveThreadId, getThread, deleteThread],
  );

  const branchContextValue = useMemo(
    () => computeBranchInfo(getAllThreadData(), activeThreadId),
    [getAllThreadData, activeThreadId],
  );

  const runtime = useCustomRuntime({ agent, adapters: { threadList: threadListAdapter } });

  return (
    <TooltipProvider>
      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadBranchContext.Provider value={branchContextValue}>
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
              <SidebarTriggerWrapper />
              <Thread />
            </SidebarInset>
          </div>
        </SidebarProvider>
        </ThreadBranchContext.Provider>
      </AssistantRuntimeProvider>
    </TooltipProvider>
  );
}
