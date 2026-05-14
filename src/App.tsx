import { CopilotKitProvider, CopilotSidebar } from "@copilotkit/react-core/v2";
import { HttpAgent } from "@ag-ui/client";
import "@copilotkit/react-core/v2/styles.css";
import "./App.css";
import it from "./it.json";

const agent = new HttpAgent({
  url: "/api/agent/chat",
});

function App() {
  return (
    <CopilotKitProvider agents__unsafe_dev_only={{ default: agent }}>
      <CopilotSidebar
        defaultOpen={true}
        agentId="default"
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
    </CopilotKitProvider>
  );
}

export default App;
