import { getDisplayMode } from "./storage";

/**
 * Toggle between the toolbar popup and the Chrome side panel.
 *
 * Popup is the default and the only mode that works in Arc (its sidePanel API is
 * non-functional and it never fires action.onClicked). Chrome supports the side
 * panel, but a popup takes precedence over it — so enabling the panel means
 * clearing the popup and turning on openPanelOnActionClick.
 *
 * Presence of chrome.sidePanel can't distinguish Chrome from Arc, so the mode is
 * auto-detected by the content script (detect.ts) rather than inferred here.
 */
export async function applySidePanelMode(enabled: boolean): Promise<void> {
  const hasSidePanel = !!chrome.sidePanel?.setPanelBehavior;
  if (enabled && hasSidePanel) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    await chrome.action.setPopup({ popup: "" }); // let the click open the panel
  } else {
    if (hasSidePanel) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    }
    await chrome.action.setPopup({ popup: "popup.html" });
  }
}

export async function syncSidePanelMode(): Promise<void> {
  await applySidePanelMode((await getDisplayMode()) === "sidepanel");
}
