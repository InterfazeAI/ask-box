const KEY = "askbox_base_url";
export const DEFAULT_BASE_URL = "https://box-demo.interfaze.ai";

export function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(trimmed)) {
    throw new Error("Base URL must start with http:// or https://");
  }
  return trimmed;
}

export async function getBaseUrl(): Promise<string> {
  const result = await chrome.storage.sync.get(KEY);
  return (result[KEY] as string) || DEFAULT_BASE_URL;
}

export async function setBaseUrl(url: string): Promise<void> {
  await chrome.storage.sync.set({ [KEY]: normalizeBaseUrl(url) });
}

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
