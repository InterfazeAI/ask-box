import { createRoot } from "react-dom/client";
import "./styles.css";

// NOTE: intentionally NOT wrapped in <React.StrictMode> — useChat has a
// documented double-request issue under Strict Mode. SidePanel arrives in a
// later task; this placeholder proves the build + panel load.
createRoot(document.getElementById("root")!).render(
  <div style={{ padding: 16, fontFamily: "var(--font-geist-sans)" }}>
    Ask Box — side panel loaded.
  </div>,
);
