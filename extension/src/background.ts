import { applySidePanelMode, syncSidePanelMode } from "./displayMode";
import { DISPLAY_MODE_KEY } from "./storage";

// Apply the last-known mode on install/startup (defaults to popup — Arc-safe).
// Detection itself runs from the popup (detection.ts) the first time the user
// clicks the toolbar icon, via activeTab — no host permissions needed.
chrome.runtime.onInstalled.addListener(syncSidePanelMode);
chrome.runtime.onStartup.addListener(syncSidePanelMode);

// Detection (detection.ts) or the Settings toggle writes the mode; apply it live.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[DISPLAY_MODE_KEY]) {
    applySidePanelMode(changes[DISPLAY_MODE_KEY].newValue === "sidepanel");
  }
});
