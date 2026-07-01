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

/**
 * Given all Box files and the current Redis statuses, return the files that
 * still need indexing — i.e. everything not already at the "indexed" stage.
 * Files stuck mid-pipeline (queued/extracting/embedding/error) are re-synced.
 */
export function selectFilesToSync(
  files: BoxFile[],
  statuses: FileStatus[],
): BoxFile[] {
  const indexed = new Set(
    statuses.filter((s) => s.stage === "indexed").map((s) => s.fileId),
  );
  return files.filter((f) => !indexed.has(f.id));
}
