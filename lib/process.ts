import { downloadFile } from "@/lib/box";
import { extractText } from "@/lib/interfaze";
import { chunkText } from "@/lib/chunk";
import { embed } from "@/lib/jigsawstack";
import { upsertChunks } from "@/lib/vector";
import { setFileStatus } from "@/lib/redis";

/**
 * Download a Box file, OCR it, chunk, embed, and upsert into the vector index,
 * emitting live status (extracting → embedding → indexed) at each stage. On
 * failure, records an "error" status and rethrows.
 *
 * Shared by both entry points: the QStash-driven /api/process route and the
 * inline /api/sync route. Returns the number of chunks indexed.
 */
export async function processFile(
  boxUserId: string,
  fileId: string,
  initialName?: string,
): Promise<number> {
  let name = initialName ?? fileId;
  try {
    await setFileStatus(boxUserId, { fileId, name, stage: "extracting", updatedAt: Date.now() });
    const file = await downloadFile(boxUserId, fileId);
    name = file.name;
    const text = await extractText(file);
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      throw new Error("No text could be extracted from this file");
    }

    await setFileStatus(boxUserId, { fileId, name, stage: "embedding", updatedAt: Date.now() });
    // Embed all chunks concurrently. The JigsawStack rate limiter still caps
    // starts at 30 req/s, so this overlaps network latency without exceeding the
    // limit. allSettled preserves order and lets a bad chunk be skipped, not fatal.
    const results = await Promise.allSettled(chunks.map((chunk) => embed(chunk)));
    const items = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled") {
        items.push({
          vector: r.value,
          meta: { fileId, fileName: name, chunkIdx: i, text: chunks[i] },
        });
      } else {
        // One bad chunk shouldn't sink the whole file — skip it and continue.
        console.warn(
          `[process] skipped chunk ${i}/${chunks.length} of ${name}:`,
          r.reason instanceof Error ? r.reason.message : r.reason,
        );
      }
    }
    if (items.length === 0) {
      throw new Error("All chunks failed to embed");
    }
    await upsertChunks(boxUserId, fileId, items);

    await setFileStatus(boxUserId, {
      fileId, name, stage: "indexed", chunkCount: items.length, updatedAt: Date.now(),
    });
    return items.length;
  } catch (err) {
    await setFileStatus(boxUserId, {
      fileId, name, stage: "error",
      error: err instanceof Error ? err.message : "unknown error",
      updatedAt: Date.now(),
    });
    throw err;
  }
}
