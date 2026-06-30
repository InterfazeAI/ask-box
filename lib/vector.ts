import { Index } from "@upstash/vector";

export type ChunkMeta = { fileId: string; fileName: string; chunkIdx: number; text: string };

const index = Index.fromEnv();

export async function upsertChunks(
  fileId: string,
  items: { vector: number[]; meta: ChunkMeta }[],
): Promise<void> {
  // Idempotent: remove ALL existing chunks for this file before upserting, regardless
  // of how many items the current run produced. This prevents stale higher-index
  // vectors (e.g. `${fileId}:3`, `:4`, ...) from lingering when a re-processed file
  // yields fewer chunks than a previous run.
  // The trailing ":" in the prefix is required so deleting file "1" doesn't also
  // delete file "10", "11", etc.
  await index.delete({ prefix: `${fileId}:` }).catch(() => {});

  // index.upsert([]) can throw on some clients, and there's nothing to do for an
  // empty document anyway.
  if (items.length) {
    await index.upsert(
      items.map((it) => ({
        id: `${it.meta.fileId}:${it.meta.chunkIdx}`,
        vector: it.vector,
        metadata: it.meta as unknown as Record<string, unknown>,
      })),
    );
  }
}

export async function queryTopK(vector: number[], k: number): Promise<ChunkMeta[]> {
  const res = await index.query({ vector, topK: k, includeMetadata: true });
  return res.map((r) => r.metadata as unknown as ChunkMeta).filter(Boolean);
}
