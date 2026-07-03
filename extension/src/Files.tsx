import { useCallback, useEffect, useRef, useState } from "react";
import type { FileStatus } from "@/lib/redis";
import type { TreeNode } from "@/lib/box";
import FileCard from "@/components/FileCard";
import { getTree, runSync, UnauthorizedError } from "./api";

// Poll the tree endpoint on this cadence — it refreshes the view AND enqueues
// new Box files for indexing, so it is the auto-sync.
const POLL_MS = 12000;

function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${className} animate-spin`} aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function countFiles(nodes: TreeNode[]): number {
  let c = 0;
  for (const n of nodes) c += n.type === "file" ? 1 : countFiles(n.children);
  return c;
}

function FileRow({
  node,
  depth,
  status,
}: {
  node: Extract<TreeNode, { type: "file" }>;
  depth: number;
  status?: FileStatus;
}) {
  const pad = { paddingLeft: depth * 14 };

  // Indexed / processing / errored files get the full pipeline card.
  if (status) {
    return (
      <div style={pad}>
        <FileCard status={status} />
      </div>
    );
  }

  // In Box, not yet in our index.
  return (
    <div
      style={pad}
      className="group flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.03] px-4 py-3"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-zinc-600">
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4.5" aria-hidden="true">
          <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
        </svg>
      </div>
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-400">{node.name}</span>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-zinc-400">
        <span className="size-2 rounded-full bg-status-gray" />
        Not indexed
      </span>
    </div>
  );
}

function FolderRow({
  node,
  depth,
  statuses,
}: {
  node: Extract<TreeNode, { type: "folder" }>;
  depth: number;
  statuses: Map<string, FileStatus>;
}) {
  const [open, setOpen] = useState(true);
  const count = countFiles(node.children);

  return (
    <div>
      <div
        style={{ paddingLeft: 6 + depth * 14 }}
        className="group flex items-center gap-2 rounded-xl py-2 pr-2 transition-colors hover:bg-white/[0.04]"
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            className={`size-3.5 shrink-0 text-zinc-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
          </svg>
          <svg viewBox="0 0 24 24" fill="currentColor" className="size-4 shrink-0 text-zinc-400" aria-hidden="true">
            <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
          </svg>
          <span className="truncate text-sm font-medium text-zinc-200">{node.name}</span>
        </button>
        <span className="shrink-0 font-mono text-[11px] text-zinc-400">
          {count} file{count === 1 ? "" : "s"}
        </span>
      </div>

      {open &&
        (node.children.length ? (
          <div className="mt-1.5">
            <TreeRows nodes={node.children} depth={depth + 1} statuses={statuses} />
          </div>
        ) : (
          <div
            style={{ marginLeft: (depth + 1) * 14 }}
            className="mt-1.5 flex items-center gap-2 rounded-lg border border-dashed border-white/8 bg-white/[0.015] px-3 py-2 text-xs text-zinc-500"
          >
            Empty folder
          </div>
        ))}
    </div>
  );
}

function TreeRows({
  nodes,
  depth,
  statuses,
}: {
  nodes: TreeNode[];
  depth: number;
  statuses: Map<string, FileStatus>;
}) {
  return (
    <div className="space-y-1.5">
      {nodes.map((n) =>
        n.type === "folder" ? (
          <FolderRow key={n.id} node={n} depth={depth} statuses={statuses} />
        ) : (
          <FileRow key={n.id} node={n} depth={depth} status={statuses.get(n.id)} />
        ),
      )}
    </div>
  );
}

export default function Files({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [statuses, setStatuses] = useState<Map<string, FileStatus>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await getTree();
      if (!mounted.current) return;
      setTree(data.tree);
      setStatuses(new Map(data.statuses.map((s) => [s.fileId, s])));
      setError(null);
    } catch (e) {
      if (e instanceof UnauthorizedError) onUnauthorized();
      else if (mounted.current) setError((e as Error).message);
    } finally {
      inFlight.current = false;
    }
  }, [onUnauthorized]);

  // Initial load + auto-sync poll.
  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      await runSync();
      await load();
    } catch (e) {
      if (e instanceof UnauthorizedError) onUnauthorized();
      else setError((e as Error).message);
    } finally {
      if (mounted.current) setSyncing(false);
    }
  }

  const totalFiles = tree ? countFiles(tree) : 0;
  const activeCount = Array.from(statuses.values()).filter(
    (s) => s.stage === "extracting" || s.stage === "embedding",
  ).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-zinc-400">
            {tree === null
              ? "loading folder…"
              : `${totalFiles} file${totalFiles === 1 ? "" : "s"} · auto-synced${
                  activeCount ? ` · ${activeCount} processing` : ""
                }`}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-60"
        >
          {syncing ? (
            <Spinner className="size-3.5 text-zinc-400" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          {syncing ? "Syncing…" : "Sync"}
        </button>
      </header>

      {error && <p className="px-4 py-2 text-xs text-destructive">{error}</p>}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {tree === null ? (
          <p className="py-16 text-center font-mono text-xs text-zinc-600">
            Reading your Box folder…
          </p>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-8 py-14 text-center">
            <div className="relative mb-5">
              <div className="absolute inset-0 -z-10 rounded-full bg-white/10 blur-2xl" />
              <div className="flex size-14 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] text-zinc-400">
                <svg viewBox="0 0 24 24" fill="currentColor" className="size-6" aria-hidden="true">
                  <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
                </svg>
              </div>
            </div>
            <p className="text-sm font-medium text-zinc-200">Your Box is empty</p>
            <p className="mt-1.5 max-w-xs text-sm text-zinc-400">
              Add a file to your Box folder and it gets indexed here automatically.
            </p>
          </div>
        ) : (
          <TreeRows nodes={tree} depth={0} statuses={statuses} />
        )}
      </div>
    </div>
  );
}
