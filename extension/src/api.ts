import type { FileStatus } from "@/lib/redis";
import type { TreeNode } from "@/lib/box";
import { BASE_URL, getStoredSid, clearStoredSid } from "./storage";

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const sid = await getStoredSid();
  const headers = new Headers(init.headers);
  if (sid) headers.set("x-askbox-sid", sid);
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (res.status === 401) {
    await clearStoredSid();
    throw new UnauthorizedError();
  }
  return res;
}

/**
 * The Box folder tree plus index statuses. Fetching this also auto-enqueues any
 * brand-new Box files for indexing server-side — so polling it is the auto-sync.
 */
export async function getTree(): Promise<{ tree: TreeNode[]; statuses: FileStatus[] }> {
  const res = await authedFetch("/api/box/tree");
  if (!res.ok) throw new Error(`tree request failed: ${res.status}`);
  return (await res.json()) as { tree: TreeNode[]; statuses: FileStatus[] };
}

export type SyncResult = {
  total: number;
  indexed: number;
  skipped: number;
  failed: number;
  removed: number;
};

/** Manually run a full Box→index sync now (synchronous on the server). */
export async function runSync(): Promise<SyncResult> {
  const res = await authedFetch("/api/sync", { method: "POST" });
  if (!res.ok) throw new Error(`sync failed: ${res.status}`);
  return (await res.json()) as SyncResult;
}
