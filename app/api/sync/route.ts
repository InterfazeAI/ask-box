import { NextRequest, NextResponse } from "next/server";
import { listFolderFilesRecursive } from "@/lib/box";
import { selectFilesToSync, selectFilesToRemove } from "@/lib/sync";
import { processFile } from "@/lib/process";
import { setFileStatus, getAllFileStatuses, removeFileStatus } from "@/lib/redis";
import { deleteFileChunks } from "@/lib/vector";
import { resolveBoxUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
// Inline processing can take a while for many/large files; allow a long request.
export const maxDuration = 800;

/**
 * Manual, webhook-free indexing of files already in Box. Lists the Box root
 * recursively, skips already-indexed files, then processes the rest INLINE
 * (download → OCR → embed → upsert). No QStash: status flows to the UI via
 * Redis + SSE as each file moves through the pipeline.
 */
export async function POST(req: NextRequest) {
  const boxUserId = await resolveBoxUserId(req);
  if (!boxUserId) return NextResponse.json({ error: "not connected" }, { status: 401 });

  let files;
  try {
    files = await listFolderFilesRecursive(boxUserId, "0");
  } catch (err) {
    console.error("[sync] failed to list Box files", err);
    return NextResponse.json(
      { error: "Failed to list Box files. Check your Box token/connection." },
      { status: 502 },
    );
  }

  const statuses = await getAllFileStatuses(boxUserId);

  // Prune ghosts: files in Redis that no longer exist in Box (e.g. deleted).
  const toRemove = selectFilesToRemove(files, statuses);
  await Promise.all(
    toRemove.map(async (id) => {
      await deleteFileChunks(boxUserId, id);
      await removeFileStatus(boxUserId, id);
    }),
  );

  const toSync = selectFilesToSync(files, statuses);

  // Mark everything queued up front so all files appear immediately in the UI.
  await Promise.all(
    toSync.map((f) =>
      setFileStatus(boxUserId, { fileId: f.id, name: f.name, stage: "queued", updatedAt: Date.now() }),
    ),
  );

  let indexed = 0;
  for (const f of toSync) {
    try {
      await processFile(boxUserId, f.id, f.name);
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
