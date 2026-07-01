import { NextResponse } from "next/server";
import { listFolderFilesRecursive } from "@/lib/box";
import { selectFilesToSync, selectFilesToRemove } from "@/lib/sync";
import { processFile } from "@/lib/process";
import { setFileStatus, getAllFileStatuses, removeFileStatus } from "@/lib/redis";
import { deleteFileChunks } from "@/lib/vector";

export const dynamic = "force-dynamic";
// Inline processing can take a while for many/large files; allow a long request.
export const maxDuration = 300;

/**
 * Manual, webhook-free indexing of files already in Box. Lists the Box root
 * recursively, skips already-indexed files, then processes the rest INLINE
 * (download → OCR → embed → upsert). No QStash: status flows to the UI via
 * Redis + SSE as each file moves through the pipeline.
 */
export async function POST() {
  let files;
  try {
    files = await listFolderFilesRecursive("0");
  } catch (err) {
    console.error("[sync] failed to list Box files", err);
    return NextResponse.json(
      { error: "Failed to list Box files. Check your Box token/connection." },
      { status: 502 },
    );
  }

  const statuses = await getAllFileStatuses();

  // Prune ghosts: files in Redis that no longer exist in Box (e.g. deleted).
  const toRemove = selectFilesToRemove(files, statuses);
  await Promise.all(
    toRemove.map(async (id) => {
      await deleteFileChunks(id);
      await removeFileStatus(id);
    }),
  );

  const toSync = selectFilesToSync(files, statuses);

  // Mark everything queued up front so all files appear immediately in the UI.
  await Promise.all(
    toSync.map((f) =>
      setFileStatus({ fileId: f.id, name: f.name, stage: "queued", updatedAt: Date.now() }),
    ),
  );

  let indexed = 0;
  for (const f of toSync) {
    try {
      await processFile(f.id, f.name);
      indexed++;
    } catch (err) {
      // processFile already recorded an "error" status for this file; keep going.
      console.error(`[sync] failed to process ${f.id}`, err);
    }
  }

  return NextResponse.json({
    total: files.length,
    indexed,
    skipped: files.length - toSync.length,
    failed: toSync.length - indexed,
    removed: toRemove.length,
  });
}
