import { Redis } from "@upstash/redis";

export type Stage = "queued" | "extracting" | "embedding" | "indexed" | "error";
export type FileStatus = {
  fileId: string; name: string; stage: Stage;
  chunkCount?: number; error?: string; updatedAt: number;
};

export const redis = Redis.fromEnv();
export const CHANNEL = "file-updates";

export function buildStatusEvent(s: FileStatus): string {
  return JSON.stringify(s);
}

export async function setFileStatus(s: FileStatus): Promise<void> {
  await redis.set(`file:${s.fileId}`, s);
  await redis.sadd("files", s.fileId);
  await redis.publish(CHANNEL, buildStatusEvent(s));
}

export async function removeFileStatus(fileId: string): Promise<void> {
  await redis.del(`file:${fileId}`);
  await redis.srem("files", fileId);
}

export async function getAllFileStatuses(): Promise<FileStatus[]> {
  const ids = await redis.smembers("files");
  if (ids.length === 0) return [];
  const rows = await Promise.all(ids.map((id) => redis.get<FileStatus>(`file:${id}`)));
  return rows.filter((r): r is FileStatus => !!r).sort((a, b) => b.updatedAt - a.updatedAt);
}

export type BoxTokens = { accessToken: string; refreshToken: string; expiresAt: number };
export const getBoxTokens = () => redis.get<BoxTokens>("box:tokens");
export const setBoxTokens = (t: BoxTokens) => redis.set("box:tokens", t);
export const getWebhookId = () => redis.get<string>("box:webhook");
export const setWebhookId = (id: string) => redis.set("box:webhook", id);
