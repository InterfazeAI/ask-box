import { applySidePanelMode, syncSidePanelMode } from "./displayMode";
import { DISPLAY_MODE_KEY } from "./storage";

// Apply the last-detected display mode (popup vs Chrome side panel) on load.
// Defaults to popup, which works everywhere including Arc.
chrome.runtime.onInstalled.addListener(() => {
  syncSidePanelMode();
});

chrome.runtime.onStartup.addListener(() => {
  syncSidePanelMode();
});

// The content script (detect.ts) writes the detected mode here; apply it live.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[DISPLAY_MODE_KEY]) {
    applySidePanelMode(changes[DISPLAY_MODE_KEY].newValue === "sidepanel");
  }
});
