import { NextResponse } from "next/server";
import { listFolderFilesRecursive } from "@/lib/box";
import { selectFilesToSync } from "@/lib/sync";
import { enqueueProcess } from "@/lib/queue";
import { setFileStatus, getAllFileStatuses } from "@/lib/redis";

export const dynamic = "force-dynamic";

/**
 * Manual replacement for the Box FILE.UPLOADED webhook: list files already in
 * Box (root, recursive), skip ones already indexed, and push the rest through
 * the existing pipeline (setFileStatus queued + enqueueProcess → /api/process).
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
  const toSync = selectFilesToSync(files, statuses);

  let queued = 0;
  for (const f of toSync) {
    try {
      await setFileStatus({
        fileId: f.id,
        name: f.name,
        stage: "queued",
        updatedAt: Date.now(),
      });
      await enqueueProcess(f.id);
      queued++;
    } catch (err) {
      console.error(`[sync] failed to enqueue ${f.id}`, err);
    }
  }

  return NextResponse.json({
    total: files.length,
    queued,
    skipped: files.length - toSync.length,
    failed: toSync.length - queued,
  });
}
