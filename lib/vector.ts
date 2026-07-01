import { Index } from "@upstash/vector";

export type ChunkMeta = { fileId: string; fileName: string; chunkIdx: number; text: string };

const index = Index.fromEnv();
// One Upstash namespace per Box account isolates every account's vectors.
const ns = (userId: string) => index.namespace(userId);

export async function upsertChunks(
  userId: string,
  fileId: string,
  items: { vector: number[]; meta: ChunkMeta }[],
): Promise<void> {
  // Trailing ":" so file "1" doesn't also match "10", "11", ...
  await ns(userId).delete({ prefix: `${fileId}:` }).catch(() => {});
  if (items.length) {
    await ns(userId).upsert(
      items.map((it) => ({
        id: `${it.meta.fileId}:${it.meta.chunkIdx}`,
        vector: it.vector,
        metadata: it.meta as unknown as Record<string, unknown>,
      })),
    );
  }
}

export async function deleteFileChunks(userId: string, fileId: string): Promise<void> {
  await ns(userId).delete({ prefix: `${fileId}:` }).catch(() => {});
}

export type ScoredChunk = ChunkMeta & { score: number };

export async function queryTopK(
  userId: string,
  vector: number[],
  k: number,
): Promise<ScoredChunk[]> {
  const res = await ns(userId).query({ vector, topK: k, includeMetadata: true });
  return res
    .filter((r) => r.metadata)
    .map((r) => ({ ...(r.metadata as unknown as ChunkMeta), score: r.score }));
}
