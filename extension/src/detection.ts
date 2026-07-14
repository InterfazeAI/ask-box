import { getStoredDisplayMode, setDisplayMode } from "./storage";

/**
 * Arc themes web pages by injecting `--arc-palette-*` CSS custom properties on
 * the root element; other Chromium browsers don't. Those vars only exist on
 * real web pages (not extension pages), so this function is injected into the
 * active tab via chrome.scripting — clicking the toolbar icon grants activeTab,
 * which is all the access that needs.
 *
 * Serialized by executeScript, so it must be fully self-contained (no
 * outer-scope references, including imports).
 */
export async function pageHasArcPalette(): Promise<boolean> {
  const hasVars = () => {
    const s = getComputedStyle(document.documentElement);
    return [
      "--arc-palette-title",
      "--arc-palette-background",
      "--arc-palette-foregroundPrimary",
    ].some((v) => s.getPropertyValue(v).trim() !== "");
  };
  if (hasVars()) return true;
  // Arc injects its palette after the page loads, so wait for load + a short
  // delay before trusting a negative — a false "not Arc" would switch Arc users
  // to the side panel, which Arc can't open.
  if (document.readyState !== "complete") {
    await new Promise((r) => window.addEventListener("load", r, { once: true }));
  }
  await new Promise((r) => setTimeout(r, 1200));
  return hasVars();
}

/**
 * One-time browser detection, run when the popup opens. No-op once a mode is
 * stored (whether detected or user-chosen in Settings). On any failure —
 * uninjectable page (chrome://, web store), no active tab, popup closed before
 * the verdict — the mode stays unset and detection retries on the next open,
 * with the popup default remaining in effect (safe in every browser).
 */
export async function maybeDetectDisplayMode(): Promise<void> {
  if ((await getStoredDisplayMode()) !== null) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id == null) return;
    const [frame] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageHasArcPalette,
    });
    if (typeof frame?.result !== "boolean") return;
    await setDisplayMode(frame.result ? "popup" : "sidepanel");
  } catch {
    // Page not injectable — leave unset and retry next time.
  }
}
