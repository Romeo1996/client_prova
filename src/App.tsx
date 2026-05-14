import { CopilotKit } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import { HttpAgent } from "@ag-ui/client";
import "@copilotkit/react-ui/styles.css";
import "./App.css";
import it from "./it.json";

const ADK_BACKEND_URL = "http://130.110.8.177:8086";

const adkAgent = new HttpAgent({
  url: ADK_BACKEND_URL,
});

function App() {
  return (
    <CopilotKit
      selfManagedAgents={{ "adk_agent": adkAgent }}
      agent="adk_agent"
    >
      <CopilotSidebar
        defaultOpen={true}
        labels={{
          title: it.copilotkit.sidebar.title,
          initial: it.copilotkit.chat.initialMessage,
        }}
      >
        <main style={{ padding: "2rem", textAlign: "center" }}>
          <h1>Client Prova con ADK Agent</h1>
          <p>
            Interfaccia AG-UI (CopilotKit) per il tuo server ADK remoto.
            Apri il pannello laterale per chattare con l'agente.
          </p>
        </main>
      </CopilotSidebar>
    </CopilotKit>
  );
}

export default App;
