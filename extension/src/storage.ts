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
// Chrome side panel. Auto-detected once on demand (detection.ts) or set by the
// user in Settings, then stored per-browser in local. Defaults to popup until
// something is stored.
export type DisplayMode = "popup" | "sidepanel";
export const DISPLAY_MODE_KEY = "askbox_display";

/** null = no verdict yet (neither detection nor the user has picked a mode). */
export async function getStoredDisplayMode(): Promise<DisplayMode | null> {
  const result = await chrome.storage.local.get(DISPLAY_MODE_KEY);
  const value = result[DISPLAY_MODE_KEY];
  return value === "sidepanel" || value === "popup" ? value : null;
}

export async function getDisplayMode(): Promise<DisplayMode> {
  return (await getStoredDisplayMode()) ?? "popup";
}

export async function setDisplayMode(mode: DisplayMode): Promise<void> {
  await chrome.storage.local.set({ [DISPLAY_MODE_KEY]: mode });
}
