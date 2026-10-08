import { InteractionEffects } from "./components/common/InteractionEffects.tsx";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <InteractionEffects />
    <App />
  </StrictMode>,
);
