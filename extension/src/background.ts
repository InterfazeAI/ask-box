// Per-browser action behavior.
//
// Chrome implements the Side Panel API, so we open the side panel when the
// toolbar icon is clicked. A `default_popup` (declared in the manifest) takes
// precedence over the side panel, so we must clear it at runtime for the panel
// to open.
//
// Arc does NOT implement chrome.sidePanel (and never fires action.onClicked),
// so the only mechanism it honors is the manifest's `default_popup`. There we
// leave the popup untouched.
function configureActionBehavior() {
  if (chrome.sidePanel?.setPanelBehavior) {
    // Chromium browsers with the Side Panel API (Chrome, Edge, Brave, …).
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      // Clear the manifest popup so the click opens the side panel instead.
      .then(() => chrome.action.setPopup({ popup: "" }))
      .catch((err) => console.error("Ask Box: side panel setup failed", err));
  }
  // Arc (no chrome.sidePanel): keep the manifest's default_popup.
}

chrome.runtime.onInstalled.addListener(configureActionBehavior);
chrome.runtime.onStartup.addListener(configureActionBehavior);
