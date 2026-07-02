import { NextRequest, NextResponse } from "next/server";
import { getFolderTree, type TreeNode } from "@/lib/box";
import {
  getAllFileStatuses,
  setFileStatus,
  removeFileStatus,
} from "@/lib/redis";
import { deleteFileChunks } from "@/lib/vector";
import { enqueueProcess } from "@/lib/queue";
import { isVideoFile } from "@/lib/sync";
import { resolveBoxUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

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
export async function GET(req: NextRequest) {
  const boxUserId = await resolveBoxUserId(req);
  if (!boxUserId) return NextResponse.json({ error: "not connected" }, { status: 401 });

  let tree: TreeNode[];
  try {
    tree = await getFolderTree(boxUserId, "0");
  } catch (err) {
    console.error("[tree] failed to list Box folder", err);
    return NextResponse.json(
      { error: "Failed to list Box folder. Check your Box connection." },
      { status: 502 },
    );
  }

  const files = collectFiles(tree);
  const present = new Set(files.map((f) => f.id));
  const statuses = await getAllFileStatuses(boxUserId);
  const known = new Map(statuses.map((s) => [s.fileId, s]));

  // Prune ghosts: files indexed in Redis that no longer exist in Box.
  const ghosts = statuses.filter((s) => !present.has(s.fileId));
  await Promise.all(
    ghosts.map(async (g) => {
      await deleteFileChunks(boxUserId, g.fileId);
      await removeFileStatus(boxUserId, g.fileId);
    }),
  );

  // Auto-enqueue brand-new files (never seen before). Mark queued first so a
  // subsequent poll won't enqueue them again. Video files are skipped — they
  // carry no extractable text to embed.
  const fresh = files.filter((f) => !known.has(f.id) && !isVideoFile(f.name));
  await Promise.all(
    fresh.map(async (f) => {
      await setFileStatus(boxUserId, {
        fileId: f.id,
        name: f.name,
        stage: "queued",
        updatedAt: Date.now(),
      });
      await enqueueProcess(boxUserId, f.id);
    }),
  );

  const merged = await getAllFileStatuses(boxUserId);
  return NextResponse.json({ tree, statuses: merged });
}
