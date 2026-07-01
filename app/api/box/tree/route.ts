import { NextResponse } from "next/server";
import { getFolderTree, type TreeNode } from "@/lib/box";
import {
  getAllFileStatuses,
  setFileStatus,
  removeFileStatus,
} from "@/lib/redis";
import { deleteFileChunks } from "@/lib/vector";
import { enqueueProcess } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function collectFiles(
  nodes: TreeNode[],
  acc: { id: string; name: string }[] = [],
): { id: string; name: string }[] {
  for (const n of nodes) {
    if (n.type === "file") acc.push({ id: n.id, name: n.name });
    else collectFiles(n.children, acc);
  }
  return acc;
}

/**
 * Returns the live Box folder tree AND reconciles it with our index:
 *  - prunes ghosts (files removed from Box) from Redis + the vector store,
 *  - auto-enqueues brand-new files (no status yet) for processing.
 * Already-indexed and errored files are left untouched (no retry storms).
 * The dashboard polls this on an interval, which is what makes sync automatic.
 */
export async function GET() {
  let tree: TreeNode[];
  try {
    tree = await getFolderTree("0");
  } catch (err) {
    console.error("[tree] failed to list Box folder", err);
    return NextResponse.json(
      { error: "Failed to list Box folder. Check your Box connection." },
      { status: 502 },
    );
  }

  const files = collectFiles(tree);
  const present = new Set(files.map((f) => f.id));
  const statuses = await getAllFileStatuses();
  const known = new Map(statuses.map((s) => [s.fileId, s]));

  // Prune ghosts: files indexed in Redis that no longer exist in Box.
  const ghosts = statuses.filter((s) => !present.has(s.fileId));
  await Promise.all(
    ghosts.map(async (g) => {
      await deleteFileChunks(g.fileId);
      await removeFileStatus(g.fileId);
    }),
  );

  // Auto-enqueue brand-new files (never seen before). Mark queued first so a
  // subsequent poll won't enqueue them again.
  const fresh = files.filter((f) => !known.has(f.id));
  await Promise.all(
    fresh.map(async (f) => {
      await setFileStatus({
        fileId: f.id,
        name: f.name,
        stage: "queued",
        updatedAt: Date.now(),
      });
      await enqueueProcess(f.id);
    }),
  );

  const merged = await getAllFileStatuses();
  return NextResponse.json({ tree, statuses: merged });
}
