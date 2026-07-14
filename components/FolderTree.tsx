"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import type { FileStatus } from "@/lib/redis";
import type { TreeNode } from "@/lib/box";
import FileCard from "@/components/FileCard";

type SnapshotEvent = { type: "snapshot"; files: FileStatus[] };
type UpdateEvent = { type: "update"; file: FileStatus };
type StreamEvent = SnapshotEvent | UpdateEvent;

const POLL_MS = 12000;

// Read-only mode: hide upload / new-folder / delete actions from the dashboard.
const ALLOW_MUTATIONS = false;

type TreeActions = {
  requestUpload: (parentId: string) => void;
  startNewFolder: (parentId: string, parentName: string) => void;
  deleteFile: (id: string, name: string) => void;
  deletingIds: Set<string>;
};
const TreeCtx = createContext<TreeActions | null>(null);

const Spinner = ({ className = "size-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={`${className} animate-spin`} aria-hidden="true">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

/* Optimistic card shown while a file is uploading to Box. */
function UploadingCard({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-zinc-400">
        <Spinner className="size-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-100">{name}</p>
        <p className="truncate font-mono text-[11px] text-zinc-400">uploading to Box…</p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-zinc-400">
        <span className="size-2 rounded-full bg-status-amber animate-breathe" />
        Uploading
      </span>
    </div>
  );
}

function countFiles(nodes: TreeNode[]): number {
  let c = 0;
  for (const n of nodes) c += n.type === "file" ? 1 : countFiles(n.children);
  return c;
}

/* ── small ghost icon button ──────────────────────────────────────────────── */
function IconButton({
  title,
  onClick,
  children,
  hoverOnly = false,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  hoverOnly?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`flex size-7 items-center justify-center rounded-lg border border-white/8 bg-white/[0.03] text-zinc-400 transition-all hover:border-white/15 hover:bg-white/[0.06] hover:text-zinc-200 ${
        hoverOnly ? "opacity-0 group-hover:opacity-100" : ""
      }`}
    >
      {children}
    </button>
  );
}

const IconUpload = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-4" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4M5 20h14" />
  </svg>
);
const IconFolderPlus = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-4" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v4M10 13h4" />
  </svg>
);

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
  const actions = useContext(TreeCtx);
  const pad = { paddingLeft: depth * 18 };
  const deleting = actions?.deletingIds.has(node.id) ?? false;

  // Indexed / processing / errored files get the full pipeline card.
  if (status) {
    return (
      <div style={pad}>
        <FileCard
          status={status}
          deleting={deleting}
          onDelete={
            ALLOW_MUTATIONS ? () => actions?.deleteFile(node.id, node.name) : undefined
          }
        />
      </div>
    );
  }

  // In Box, not yet in our index.
  return (
    <div
      style={pad}
      className={`group flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.03] px-4 py-3 ${
        deleting ? "pointer-events-none opacity-50" : ""
      }`}
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
      {ALLOW_MUTATIONS &&
        (deleting ? (
          <span className="flex size-6 shrink-0 items-center justify-center text-status-red">
            <Spinner />
          </span>
        ) : (
          <button
            onClick={() => actions?.deleteFile(node.id, node.name)}
            title="Delete from Box"
            aria-label="Delete from Box"
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-all hover:bg-status-red/10 hover:text-status-red"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
            </svg>
          </button>
        ))}
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
  const actions = useContext(TreeCtx);
  const count = countFiles(node.children);

  return (
    <div>
      <div
        style={{ paddingLeft: 10 + depth * 18 }}
        className="group flex items-center gap-2 rounded-xl py-2.5 pr-2 transition-colors hover:bg-white/[0.04]"
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
        {ALLOW_MUTATIONS && (
          <div className="flex shrink-0 items-center gap-1">
            <IconButton title="Upload file here" onClick={() => actions?.requestUpload(node.id)}>
              {IconUpload}
            </IconButton>
            <IconButton
              title="New subfolder"
              onClick={() => actions?.startNewFolder(node.id, node.name)}
            >
              {IconFolderPlus}
            </IconButton>
          </div>
        )}
      </div>

      {open &&
        (node.children.length ? (
          <div className="mt-2">
            <TreeRows nodes={node.children} depth={depth + 1} statuses={statuses} />
          </div>
        ) : (
          <motion.div
            style={{ marginLeft: (depth + 1) * 18 }}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="mt-2 flex items-center gap-2.5 rounded-lg border border-dashed border-white/8 bg-white/[0.015] px-3 py-2.5"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-white/8 bg-white/[0.03] text-zinc-500">
              <svg viewBox="0 0 24 24" fill="none" className="size-3.5" aria-hidden="true">
                <path
                  d="M3 7.5A1.5 1.5 0 014.5 6h4l2 2h7A1.5 1.5 0 0119 9.5v7a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 013 16.5v-9z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="text-xs font-medium text-zinc-400">
              Empty folder
              <span className="ml-1.5 font-normal text-zinc-600">— nothing indexed yet</span>
            </span>
          </motion.div>
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
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
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
  // Box account connection (null = still checking). Distinct from `connected`,
  // which tracks the live SSE stream.
  const [boxConnected, setBoxConnected] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [newFolder, setNewFolder] = useState<{ parentId: string; parentName: string } | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  const inFlight = useRef(false);
  const mounted = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadParent = useRef<string>("0");

  useEffect(() => () => void (mounted.current = false), []);

  const runSync = useCallback(async (silent = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!silent) setSyncing(true);
    try {
      const res = await fetch("/api/box/tree", { cache: "no-store" });
      if (!res.ok) {
        // 401 = no session or the Box grant died (revoked/expired) — show the
        // connect state and tell the nav pill. 502 is transient (Box outage),
        // so keep the last good tree and let the next poll retry.
        if (res.status === 401 && mounted.current) {
          setBoxConnected(false);
          window.dispatchEvent(new Event("box:disconnected"));
        }
        return;
      }
      const data = (await res.json()) as { tree?: TreeNode[]; statuses?: FileStatus[] };
      if (!mounted.current) return;
      setBoxConnected(true);
      if (data.tree) setTree(data.tree);
      if (Array.isArray(data.statuses)) {
        setStatuses(new Map(data.statuses.map((s) => [s.fileId, s])));
      }
    } catch {
      // transient; next tick retries
    } finally {
      inFlight.current = false;
      if (mounted.current) setSyncing(false);
    }
  }, []);

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

  // Check Box connection up front so we can show the right state without waiting
  // for the (potentially failing) tree fetch to resolve.
  useEffect(() => {
    fetch("/api/box/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => mounted.current && setBoxConnected(!!d.connected))
      .catch(() => {});
  }, []);

  // Auto-sync poll.
  useEffect(() => {
    runSync();
    const id = setInterval(runSync, POLL_MS);
    return () => clearInterval(id);
  }, [runSync]);

  const actions = useMemo<TreeActions>(
    () => ({
      requestUpload: (parentId) => {
        uploadParent.current = parentId;
        fileInputRef.current?.click();
      },
      startNewFolder: (parentId, parentName) => {
        setNewFolder({ parentId, parentName });
        setNewFolderName("");
      },
      deleteFile: async (id, name) => {
        if (!window.confirm(`Delete "${name}" from Box? It will be moved to Box trash.`)) return;
        setDeletingIds((prev) => new Set(prev).add(id));
        try {
          await fetch(`/api/box/file/${encodeURIComponent(id)}`, { method: "DELETE" });
          await runSync();
        } finally {
          setDeletingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      },
      deletingIds,
    }),
    [runSync, deletingIds],
  );

  async function onFilesSelected(list: FileList | null) {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    setUploading(files.map((f) => f.name));
    try {
      const form = new FormData();
      form.append("parentId", uploadParent.current);
      files.forEach((f) => form.append("files", f));
      await fetch("/api/box/upload", { method: "POST", body: form });
      await runSync();
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploading([]);
    }
  }

  async function submitNewFolder(e: FormEvent) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name || !newFolder || creatingFolder) return;
    setCreatingFolder(true);
    try {
      await fetch("/api/box/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: newFolder.parentId }),
      });
      // Refresh silently BEFORE closing the form so the new folder is already in
      // the tree when the form disappears — avoids an "empty" flash in between.
      await runSync(true);
    } finally {
      setCreatingFolder(false);
      setNewFolder(null);
      setNewFolderName("");
    }
  }

  const totalFiles = tree ? countFiles(tree) : 0;
  const activeCount = Array.from(statuses.values()).filter(
    (s) => s.stage === "extracting" || s.stage === "embedding",
  ).length;
  const workLabel =
    uploading.length > 0
      ? "Uploading"
      : deletingIds.size > 0
        ? "Deleting"
        : "Syncing";
  const working = syncing || uploading.length > 0 || deletingIds.size > 0;

  return (
    <section
      className="panel animate-fade-up flex h-[640px] max-h-[80vh] flex-col overflow-hidden"
      style={{ animationDelay: "220ms" }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => onFilesSelected(e.target.files)}
      />

      <header className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-medium tracking-tight text-zinc-100">
            Box workspace
          </h2>
          <p className="mt-0.5 font-mono text-[11px] text-zinc-400">
            {boxConnected === false
              ? "not connected"
              : tree === null
                ? "loading folder…"
                : `${totalFiles} file${totalFiles === 1 ? "" : "s"} · auto-synced${
                    activeCount ? ` · ${activeCount} processing` : ""
                  }`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {ALLOW_MUTATIONS && (
            <IconButton title="Upload to Box" onClick={() => actions.requestUpload("0")}>
              {IconUpload}
            </IconButton>
          )}
          {ALLOW_MUTATIONS && (
            <IconButton title="New folder" onClick={() => actions.startNewFolder("0", "Box")}>
              {IconFolderPlus}
            </IconButton>
          )}
          <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-zinc-300">
            {working ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" className="size-3 animate-spin text-zinc-400" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {workLabel}
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
        </div>
      </header>

      <div className="no-scrollbar min-h-0 flex-1 overflow-auto px-3 py-4">
        {newFolder && (
          <form
            onSubmit={submitNewFolder}
            className="mb-3 flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-4 shrink-0 text-zinc-400" aria-hidden="true">
              <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
            </svg>
            <input
              autoFocus
              disabled={creatingFolder}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && !creatingFolder) {
                  setNewFolder(null);
                  setNewFolderName("");
                }
              }}
              placeholder={
                creatingFolder
                  ? `Creating “${newFolderName.trim()}”…`
                  : `New folder in ${newFolder.parentName}…`
              }
              className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600 disabled:opacity-70"
            />
            <button
              type="submit"
              disabled={!newFolderName.trim() || creatingFolder}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1 text-xs font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {creatingFolder && <Spinner className="size-3 text-black" />}
              {creatingFolder ? "Creating" : "Create"}
            </button>
            <button
              type="button"
              disabled={creatingFolder}
              onClick={() => {
                setNewFolder(null);
                setNewFolderName("");
              }}
              className="rounded-lg px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-zinc-300 disabled:opacity-40"
            >
              Cancel
            </button>
          </form>
        )}

        {uploading.length > 0 && (
          <div className="mb-3 space-y-2">
            <AnimatePresence>
              {uploading.map((name, i) => (
                <motion.div
                  key={`uploading-${i}-${name}`}
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  <UploadingCard name={name} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {boxConnected === false ? (
          <div className="flex flex-col items-center justify-center px-8 py-14 text-center">
            <div className="relative mb-5">
              <div className="absolute inset-0 -z-10 rounded-full bg-status-amber/20 blur-2xl" />
              <div className="flex size-14 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] text-status-amber">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-6"
                  aria-hidden="true"
                >
                  <path d="M18.36 6.64a9 9 0 11-12.73 0" />
                  <line x1="12" y1="2" x2="12" y2="12" />
                </svg>
              </div>
            </div>
            <p className="text-sm font-medium text-zinc-200">Box not connected</p>
            <p className="mt-1.5 max-w-xs text-sm text-zinc-400">
              Connect your Box account to browse your folders and let Interfaze
              index them automatically.
            </p>
            <a
              href="/api/box/oauth/start"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90"
            >
              Connect Box
            </a>
          </div>
        ) : tree === null ? (
          <p className="py-16 text-center font-mono text-xs text-zinc-600">
            Reading your Box folder…
          </p>
        ) : tree.length === 0 ? (
          !newFolder &&
          uploading.length === 0 && (
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
                Add a file to your Box folder and Interfaze indexes it here
                automatically.
              </p>
            </div>
          )
        ) : (
          <TreeCtx.Provider value={actions}>
            <TreeRows nodes={tree} depth={0} statuses={statuses} />
          </TreeCtx.Provider>
        )}
      </div>
    </section>
  );
}
