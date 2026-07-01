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
  fileId: string,
  initialName?: string,
): Promise<number> {
  let name = initialName ?? fileId;
  try {
    await setFileStatus({ fileId, name, stage: "extracting", updatedAt: Date.now() });
    const file = await downloadFile(fileId);
    name = file.name;
    const text = await extractText(file);
    const chunks = chunkText(text);

    await setFileStatus({ fileId, name, stage: "embedding", updatedAt: Date.now() });
    const items = [];
    for (let i = 0; i < chunks.length; i++) {
      const vector = await embed(chunks[i]);
      items.push({ vector, meta: { fileId, fileName: name, chunkIdx: i, text: chunks[i] } });
    }
    await upsertChunks(fileId, items);

    await setFileStatus({
      fileId, name, stage: "indexed", chunkCount: chunks.length, updatedAt: Date.now(),
    });
    return chunks.length;
  } catch (err) {
    await setFileStatus({
      fileId, name, stage: "error",
      error: err instanceof Error ? err.message : "unknown error",
      updatedAt: Date.now(),
    });
    throw err;
  }
}
