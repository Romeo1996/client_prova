import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAgUiRuntime } from "@assistant-ui/react-ag-ui";
import { HttpAgent } from "@ag-ui/client";
import { Thread } from "./components/assistant-ui/thread";
import { ThreadList } from "./components/assistant-ui/thread-list";
import { Sidebar, SidebarContent, SidebarInset, SidebarProvider, SidebarTrigger } from "./components/ui/sidebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { AGENT_URL } from "./services/api";

const agent = new HttpAgent({ url: AGENT_URL });

export default function App() {
  const runtime = useAgUiRuntime({ agent });
  return (
    <TooltipProvider>
      <AssistantRuntimeProvider runtime={runtime}>
        <SidebarProvider>
          <div className="flex h-dvh w-full">
            <Sidebar>
              <SidebarContent className="px-2">
                <ThreadList />
              </SidebarContent>
            </Sidebar>
            <SidebarInset>
              <SidebarTrigger className="absolute top-4 left-4" />
              <Thread />
            </SidebarInset>
          </div>
        </SidebarProvider>
      </AssistantRuntimeProvider>
    </TooltipProvider>
  );
}
