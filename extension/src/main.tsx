import { createRoot } from "react-dom/client";
import SidePanel from "./SidePanel";
import "./styles.css";

// NOT wrapped in <React.StrictMode> — useChat has a documented double-request
// issue under Strict Mode.
createRoot(document.getElementById("root")!).render(<SidePanel />);
