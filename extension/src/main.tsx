import { createRoot } from "react-dom/client";
import SidePanel from "./SidePanel";
import { maybeDetectDisplayMode } from "./detection";
import "./styles.css";

// First open: detect Arc vs Chrome from the active tab (no-op once a mode is
// stored). Fire-and-forget — the UI doesn't depend on the verdict.
maybeDetectDisplayMode();

// NOT wrapped in <React.StrictMode> — useChat has a documented double-request
// issue under Strict Mode.
createRoot(document.getElementById("root")!).render(<SidePanel />);
