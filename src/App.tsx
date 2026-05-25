import { useMemo } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { HttpAgent } from "@ag-ui/client";
import { Thread } from "./components/assistant-ui/thread";
import { ThreadList } from "./components/assistant-ui/thread-list";
import { Sidebar, SidebarContent, SidebarFooter, SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "./components/ui/sidebar";
import { ThemeToggle } from "./components/theme-toggle";
import { TooltipProvider } from "./components/ui/tooltip";
import type { ThreadMessage } from "@assistant-ui/react";
import type { ReadonlyJSONValue } from "assistant-stream/utils";
import { AGENT_URL, fetchThreadData } from "./services/api";
import { cn } from "./lib/utils";
import { useCustomRuntime } from "./hooks/useCustomRuntime";
import { useThreadManager } from "./hooks/useThreadManager";
import { ThreadBranchContext, computeBranchInfo } from "./hooks/useThreadManager";
import { useUserId } from "./hooks/useUserId";
import { UserIdSelector } from "./components/assistant-ui/user-selector";

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
  const { userId, updateUserId } = useUserId();

  const agent = useMemo(() => {
    console.log("[App] Creating HttpAgent with X-User-Id:", userId);
    return new HttpAgent({
      url: AGENT_URL,
      headers: { "X-User-Id": userId },
    });
  }, [userId]);

  const { activeThreadId, getThreads, saveThread, createThread, setActiveThreadId, getThread, deleteThread, getAllThreadData, refreshThreads } = useThreadManager(userId);

  const threadListAdapter = useMemo(
    () => ({
      threadId: activeThreadId,
      threads: getThreads(),
      isLoading: false,
      onBeforeSwitch: (messages: any, state?: any, targetThreadId?: string) => {
        const id = targetThreadId ?? activeThreadId;
        if (id) saveThread(id, { messages, state });
      },
      onSwitchToNewThread: async () => {
        return createThread();
      },
      onSwitchToThread: async (id: string) => {
        setActiveThreadId(id);
        let t = getThread(id);
        if (t && t.messages.length === 0) {
          const data = await fetchThreadData(id, userId);
          if (data?.messages?.length) {
            const threadMessages = data.messages as unknown as ThreadMessage[];
            const threadState = data.state as ReadonlyJSONValue | undefined;
            saveThread(id, { messages: threadMessages, state: threadState });
            t = getThread(id);
          }
        }
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

  const runtime = useCustomRuntime({
    agent,
    adapters: { threadList: threadListAdapter },
    onRunComplete: ({ threadId, messages, state }) => {
      saveThread(threadId, { messages, state });
      refreshThreads();
    },
  });

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
                <UserIdSelector userId={userId} onUserIdChange={updateUserId} />
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
