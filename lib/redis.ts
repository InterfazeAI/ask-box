import { Redis } from "@upstash/redis";

export type Stage = "queued" | "extracting" | "embedding" | "indexed" | "error";
export type FileStatus = {
  fileId: string; name: string; stage: Stage;
  chunkCount?: number; error?: string; updatedAt: number;
};

export const redis = Redis.fromEnv();

// All state is keyed by the Box account id so accounts never see each other.
export const tokensKey = (id: string) => `box:tokens:${id}`;
export const filesKey = (id: string) => `files:${id}`;
export const fileKey = (id: string, fileId: string) => `file:${id}:${fileId}`;

export function buildStatusEvent(s: FileStatus): string {
  return JSON.stringify(s);
}

export async function setFileStatus(id: string, s: FileStatus): Promise<void> {
  await redis.set(fileKey(id, s.fileId), s);
  await redis.sadd(filesKey(id), s.fileId);
}

export async function removeFileStatus(id: string, fileId: string): Promise<void> {
  await redis.del(fileKey(id, fileId));
  await redis.srem(filesKey(id), fileId);
}

export async function getAllFileStatuses(id: string): Promise<FileStatus[]> {
  const ids = await redis.smembers(filesKey(id));
  if (ids.length === 0) return [];
  const rows = await Promise.all(ids.map((fid) => redis.get<FileStatus>(fileKey(id, fid))));
  return rows.filter((r): r is FileStatus => !!r).sort((a, b) => b.updatedAt - a.updatedAt);
}

export type BoxTokens = { accessToken: string; refreshToken: string; expiresAt: number };
export const getBoxTokens = (id: string) => redis.get<BoxTokens>(tokensKey(id));
export const setBoxTokens = (id: string, t: BoxTokens) => redis.set(tokensKey(id), t);
export const clearBoxTokens = (id: string) => redis.del(tokensKey(id));
