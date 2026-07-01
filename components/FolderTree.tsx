"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { FileStatus } from "@/lib/redis";
import type { TreeNode } from "@/lib/box";
import FileCard from "@/components/FileCard";

type SnapshotEvent = { type: "snapshot"; files: FileStatus[] };
type UpdateEvent = { type: "update"; file: FileStatus };
type StreamEvent = SnapshotEvent | UpdateEvent;

const POLL_MS = 15000;

function countFiles(nodes: TreeNode[]): number {
  let c = 0;
  for (const n of nodes) c += n.type === "file" ? 1 : countFiles(n.children);
  return c;
}

/* ── tree rows (module-level so folder collapse state survives re-renders) ── */

function FileRow({
  node,
  depth,
  status,
}: {
  node: Extract<TreeNode, { type: "file" }>;
  depth: number;
  status?: FileStatus;
}) {
  const pad = { paddingLeft: depth * 18 };

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
      className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.01] px-4 py-3"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.02] text-zinc-600">
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4.5" aria-hidden="true">
          <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
        </svg>
      </div>
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-400">{node.name}</span>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-zinc-500">
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
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ paddingLeft: 10 + depth * 18 }}
        className="flex w-full items-center gap-2 rounded-xl py-2.5 pr-3 text-left transition-colors hover:bg-white/[0.04]"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          className={`size-3.5 shrink-0 text-zinc-500 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
        </svg>
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-4 shrink-0 text-zinc-400" aria-hidden="true">
          <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
        </svg>
        <span className="truncate text-sm font-medium text-zinc-200">{node.name}</span>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-500">
          {count} file{count === 1 ? "" : "s"}
        </span>
      </button>

      {open &&
        (node.children.length ? (
          <div className="mt-2">
            <TreeRows nodes={node.children} depth={depth + 1} statuses={statuses} />
          </div>
        ) : (
          <p
            style={{ paddingLeft: (depth + 1) * 18 }}
            className="px-2 py-1.5 text-xs text-zinc-600"
          >
            Empty folder
          </p>
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
    <div className="space-y-2">
      <AnimatePresence mode="popLayout">
        {nodes.map((n) => (
          <motion.div
            key={n.id}
            layout
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          >
            {n.type === "folder" ? (
              <FolderRow node={n} depth={depth} statuses={statuses} />
            ) : (
              <FileRow node={n} depth={depth} status={statuses.get(n.id)} />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ── panel ──────────────────────────────────────────────────────────────── */

export default function FolderTree() {
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [statuses, setStatuses] = useState<Map<string, FileStatus>>(new Map());
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const inFlight = useRef(false);

  // Live status stream (drives the pipeline animation between polls).
  useEffect(() => {
    const source = new EventSource("/api/stream");
    source.onopen = () => setConnected(true);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as StreamEvent;
        if (payload.type === "snapshot") {
          setStatuses(new Map(payload.files.map((f) => [f.fileId, f])));
        } else if (payload.type === "update") {
          setStatuses((prev) => {
            const next = new Map(prev);
            next.set(payload.file.fileId, payload.file);
            return next;
          });
        }
      } catch {
        // ignore malformed events
      }
    };
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, []);

  // Auto-sync: poll the tree endpoint (lists Box, prunes deletions, queues new).
  useEffect(() => {
    let active = true;
    async function poll() {
      if (inFlight.current) return;
      inFlight.current = true;
      setSyncing(true);
      try {
        const res = await fetch("/api/box/tree", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          tree?: TreeNode[];
          statuses?: FileStatus[];
        };
        if (!active) return;
        if (data.tree) setTree(data.tree);
        // Authoritative snapshot — also drops pruned ghosts the SSE can't signal.
        if (Array.isArray(data.statuses)) {
          setStatuses(new Map(data.statuses.map((s) => [s.fileId, s])));
        }
      } catch {
        // transient; next tick retries
      } finally {
        inFlight.current = false;
        if (active) setSyncing(false);
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const totalFiles = tree ? countFiles(tree) : 0;
  const activeCount = Array.from(statuses.values()).filter(
    (s) => s.stage === "extracting" || s.stage === "embedding",
  ).length;

  return (
    <section
      className="panel animate-fade-up flex h-full flex-col overflow-hidden"
      style={{ animationDelay: "220ms" }}
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
        <div>
          <h2 className="text-[15px] font-medium tracking-tight text-white">
            Box workspace
          </h2>
          <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
            {tree === null
              ? "loading folder…"
              : `${totalFiles} file${totalFiles === 1 ? "" : "s"} · auto-synced${
                  activeCount ? ` · ${activeCount} processing` : ""
                }`}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-zinc-300">
          {syncing ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" className="size-3 animate-spin text-zinc-400" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Syncing
            </>
          ) : (
            <>
              <span className="relative flex size-2">
                {connected && (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-green opacity-70" />
                )}
                <span
                  className={`relative inline-flex size-2 rounded-full ${
                    connected ? "bg-status-green" : "bg-status-amber animate-breathe"
                  }`}
                />
              </span>
              Live
            </>
          )}
        </span>
      </header>

      {tree === null ? (
        <div className="flex flex-1 items-center justify-center px-8 py-16">
          <span className="font-mono text-xs text-zinc-600">Reading your Box folder…</span>
        </div>
      ) : totalFiles === 0 && tree.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
          <div className="relative mb-5">
            <div className="absolute inset-0 -z-10 rounded-full bg-white/10 blur-2xl" />
            <div className="flex size-14 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] text-zinc-400">
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-6" aria-hidden="true">
                <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
              </svg>
            </div>
          </div>
          <p className="text-sm font-medium text-zinc-200">Your Box is empty</p>
          <p className="mt-1.5 max-w-xs text-sm text-zinc-500">
            Drop a file into a Box folder — Interfaze picks it up automatically and
            streams it through the pipeline here.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <TreeRows nodes={tree} depth={0} statuses={statuses} />
        </div>
      )}
    </section>
  );
}
