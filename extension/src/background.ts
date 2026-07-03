import { applySidePanelMode, syncSidePanelMode } from "./displayMode";
import { DISPLAY_MODE_KEY } from "./storage";

// Declarative content scripts only run on pages loaded AFTER the extension
// loads, so already-open tabs wouldn't detect the browser. Inject the detector
// into any open web tab now so detection runs without the user navigating.
async function probeOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(
      tabs
        .filter((t) => t.id != null && t.url && /^https?:\/\//.test(t.url))
        .map((t) =>
          chrome.scripting
            .executeScript({ target: { tabId: t.id! }, files: ["detect.js"] })
            .catch(() => {}),
        ),
    );
  } catch {
    // No scriptable tabs; the declarative content script will detect on the
    // next web page the user visits.
  }
}

function init() {
  // Apply the last-detected mode immediately (defaults to popup — Arc-safe),
  // then (re)detect from open tabs.
  syncSidePanelMode();
  probeOpenTabs();
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);

// The content script (detect.ts) writes the detected mode here; apply it live.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[DISPLAY_MODE_KEY]) {
    applySidePanelMode(changes[DISPLAY_MODE_KEY].newValue === "sidepanel");
  }
});
