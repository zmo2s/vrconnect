import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applySavedMotion } from "./hooks/use-settings";
import { applySavedPersonalization } from "./lib/personalize";

applySavedMotion();
applySavedPersonalization();

createRoot(document.getElementById("root")!).render(<App />);
