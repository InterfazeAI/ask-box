import type { FileStatus } from "@/lib/redis";
import { getBaseUrl, getStoredSid, clearStoredSid } from "./storage";

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = await getBaseUrl();
  const sid = await getStoredSid();
  const headers = new Headers(init.headers);
  if (sid) headers.set("x-askbox-sid", sid);
  const res = await fetch(`${base}${path}`, { ...init, headers });
  if (res.status === 401) {
    await clearStoredSid();
    throw new UnauthorizedError();
  }
  return res;
}

export async function getFiles(): Promise<FileStatus[]> {
  const res = await authedFetch("/api/box/files");
  if (!res.ok) throw new Error(`files request failed: ${res.status}`);
  const data = (await res.json()) as { files: FileStatus[] };
  return data.files;
}
