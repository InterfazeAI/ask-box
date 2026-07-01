import { describe, it, expect } from "vitest";
import { collectFiles, selectFilesToSync, type BoxItem } from "@/lib/sync";
import type { FileStatus } from "@/lib/redis";

describe("collectFiles", () => {
  it("collects files recursively and ignores folders/web links", async () => {
    const tree: Record<string, BoxItem[]> = {
      "0": [
        { type: "file", id: "f1", name: "a.pdf" },
        { type: "folder", id: "sub", name: "rag-demo" },
        { type: "web_link", id: "w1", name: "link" },
      ],
      sub: [{ type: "file", id: "f2", name: "b.pdf" }],
    };
    const listPage = async (folderId: string, offset: number) => ({
      items: (tree[folderId] ?? []).slice(offset),
      totalCount: (tree[folderId] ?? []).length,
    });
    const files = await collectFiles(listPage, "0");
    expect(files.map((f) => f.id).sort()).toEqual(["f1", "f2"]);
  });

  it("paginates within a folder", async () => {
    const all: BoxItem[] = Array.from({ length: 5 }, (_, i) => ({
      type: "file",
      id: `f${i}`,
      name: `f${i}`,
    }));
    const listPage = async (_folderId: string, offset: number) => ({
      items: all.slice(offset, offset + 2), // page size 2
      totalCount: all.length,
    });
    const files = await collectFiles(listPage, "0");
    expect(files.length).toBe(5);
  });

  it("returns [] for an empty folder", async () => {
    const listPage = async () => ({ items: [], totalCount: 0 });
    expect(await collectFiles(listPage, "0")).toEqual([]);
  });
});

describe("selectFilesToSync", () => {
  const files = [
    { id: "f1", name: "a" },
    { id: "f2", name: "b" },
  ];

  it("skips already-indexed files", () => {
    const statuses: FileStatus[] = [
      { fileId: "f1", name: "a", stage: "indexed", updatedAt: 1 },
    ];
    expect(selectFilesToSync(files, statuses).map((f) => f.id)).toEqual(["f2"]);
  });

  it("returns all files when none are indexed", () => {
    expect(selectFilesToSync(files, []).map((f) => f.id)).toEqual(["f1", "f2"]);
  });

  it("re-syncs files stuck mid-pipeline", () => {
    const statuses: FileStatus[] = [
      { fileId: "f1", name: "a", stage: "embedding", updatedAt: 1 },
    ];
    expect(selectFilesToSync(files, statuses).map((f) => f.id)).toEqual([
      "f1",
      "f2",
    ]);
  });
});
