import { Index } from "@upstash/vector";

export type ChunkMeta = { fileId: string; fileName: string; chunkIdx: number; text: string };

const index = Index.fromEnv();

export async function upsertChunks(
  fileId: string,
  items: { vector: number[]; meta: ChunkMeta }[],
): Promise<void> {
  // idempotent: remove any prior chunks for this file
  const priorIds = items.map((_, i) => `${fileId}:${i}`);
  await index.delete(priorIds).catch(() => {});
  await index.upsert(
    items.map((it) => ({
      id: `${it.meta.fileId}:${it.meta.chunkIdx}`,
      vector: it.vector,
      metadata: it.meta as unknown as Record<string, unknown>,
    })),
  );
}

export async function queryTopK(vector: number[], k: number): Promise<ChunkMeta[]> {
  const res = await index.query({ vector, topK: k, includeMetadata: true });
  return res.map((r) => r.metadata as unknown as ChunkMeta).filter(Boolean);
}
