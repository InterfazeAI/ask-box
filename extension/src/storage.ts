const KEY = "askbox_base_url";
export const DEFAULT_BASE_URL = "http://localhost:3000";

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
