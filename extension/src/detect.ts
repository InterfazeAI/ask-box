// Content script: detect Arc and record the display mode the extension should
// use. Arc themes web pages by injecting `--arc-palette-*` CSS custom properties
// on the root element; other Chromium browsers don't. Those vars only exist on
// real web pages (not extension pages), which is why this runs as a content
// script rather than in the background.
//
// Result → chrome.storage.local.askbox_display ("popup" for Arc, "sidepanel"
// otherwise). The background worker watches that key and applies the mode.
const ARC_VARS = [
  "--arc-palette-title",
  "--arc-palette-background",
  "--arc-palette-foregroundPrimary",
];

function isArcBrowser(): boolean {
  const s = getComputedStyle(document.documentElement);
  return ARC_VARS.some((v) => s.getPropertyValue(v).trim() !== "");
}

async function report(): Promise<void> {
  const mode = isArcBrowser() ? "popup" : "sidepanel";
  const current = await chrome.storage.local.get("askbox_display");
  if (current["askbox_display"] !== mode) {
    await chrome.storage.local.set({ askbox_display: mode });
  }
}

// Arc injects its palette after the page loads, so wait for load + a short delay.
if (document.readyState === "complete") {
  setTimeout(report, 1200);
} else {
  window.addEventListener("load", () => setTimeout(report, 1200));
}
