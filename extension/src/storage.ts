// The extension always talks to the production backend.
export const BASE_URL = "https://box-demo.interfaze.ai";

// The session token is a credential, so it lives in local (not synced) storage.
const SID_KEY = "askbox_sid";

export async function getStoredSid(): Promise<string | null> {
  const result = await chrome.storage.local.get(SID_KEY);
  return (result[SID_KEY] as string) || null;
}

export async function setStoredSid(sid: string): Promise<void> {
  await chrome.storage.local.set({ [SID_KEY]: sid });
}

export async function clearStoredSid(): Promise<void> {
  await chrome.storage.local.remove(SID_KEY);
}

// How to surface the extension: a plain popup (Arc, and the safe default) or the
// Chrome side panel. Auto-detected by the content script (detect.ts) and stored
// per-browser in local. Defaults to popup until detection runs.
export type DisplayMode = "popup" | "sidepanel";
export const DISPLAY_MODE_KEY = "askbox_display";

export async function getDisplayMode(): Promise<DisplayMode> {
  const result = await chrome.storage.local.get(DISPLAY_MODE_KEY);
  return result[DISPLAY_MODE_KEY] === "sidepanel" ? "sidepanel" : "popup";
}
