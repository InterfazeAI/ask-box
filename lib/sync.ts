import type { FileStatus } from "@/lib/redis";

export type BoxItem = { type: string; id: string; name: string };
export type BoxFile = { id: string; name: string };

/**
 * Walk a Box folder tree via an injected pager and collect every file,
 * recursing into subfolders and paginating within each folder. The pager is
 * injected so this logic stays pure and unit-testable (no network).
 */
export async function collectFiles(
  listPage: (
    folderId: string,
    offset: number,
  ) => Promise<{ items: BoxItem[]; totalCount: number }>,
  rootFolderId: string,
): Promise<BoxFile[]> {
  const files: BoxFile[] = [];
  const stack = [rootFolderId];
  while (stack.length) {
    const folderId = stack.pop()!;
    let offset = 0;
    for (;;) {
      const { items, totalCount } = await listPage(folderId, offset);
      for (const it of items) {
        if (it.type === "folder") stack.push(it.id);
        else if (it.type === "file") files.push({ id: it.id, name: it.name });
      }
      offset += items.length;
      if (items.length === 0 || offset >= totalCount) break;
    }
  }
  return files;
}

// Video containers we never OCR/embed — there's no text to extract, so
// processing them just wastes download/extract calls (and can error out).
const VIDEO_EXTENSIONS = new Set([
  "mp4", "m4v", "mov", "avi", "mkv", "webm", "flv", "wmv", "mpeg", "mpg",
  "mpe", "m2v", "3gp", "3g2", "ogv", "mts", "m2ts", "ts", "vob", "f4v",
  "asf", "rm", "rmvb", "divx", "mxf",
]);

/**
 * True when a file name looks like a video by its extension. Video files carry
 * no extractable text, so they must be excluded from the embed pipeline.
 */
export function isVideoFile(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  return VIDEO_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/**
 * Given all Box files and the current Redis statuses, return the files that
 * still need indexing — i.e. everything not already at the "indexed" stage.
 * Files stuck mid-pipeline (queued/extracting/embedding/error) are re-synced.
 * Video files are skipped outright — they have no text to embed.
 */
export function selectFilesToSync(
  files: BoxFile[],
  statuses: FileStatus[],
): BoxFile[] {
  const indexed = new Set(
    statuses.filter((s) => s.stage === "indexed").map((s) => s.fileId),
  );
  return files.filter((f) => !indexed.has(f.id) && !isVideoFile(f.name));
}

/**
 * Return the fileIds present in Redis (statuses) that no longer exist in Box.
 * These are stale ghosts — e.g. files deleted from Box — that Sync should prune
 * so the UI reflects the true state of the Box folder.
 */
export function selectFilesToRemove(
  files: BoxFile[],
  statuses: FileStatus[],
): string[] {
  const present = new Set(files.map((f) => f.id));
  return statuses.map((s) => s.fileId).filter((id) => !present.has(id));
}
