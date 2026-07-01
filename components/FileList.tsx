"use client";

import { useEffect, useState } from "react";
import type { FileStatus } from "@/lib/redis";
import FileCard from "@/components/FileCard";

type SnapshotEvent = { type: "snapshot"; files: FileStatus[] };
type UpdateEvent = { type: "update"; file: FileStatus };
type StreamEvent = SnapshotEvent | UpdateEvent;

export default function FileList() {
  const [files, setFiles] = useState<Map<string, FileStatus>>(new Map());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource("/api/stream");

    source.onopen = () => setConnected(true);

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as StreamEvent;

        if (payload.type === "snapshot") {
          const next = new Map<string, FileStatus>();
          for (const file of payload.files) {
            next.set(file.fileId, file);
          }
          setFiles(next);
        } else if (payload.type === "update") {
          setFiles((prev) => {
            const next = new Map(prev);
            next.set(payload.file.fileId, payload.file);
            return next;
          });
        }
      } catch {
        // Ignore malformed events; the next tick will self-correct.
      }
    };

    source.onerror = () => setConnected(false);

    return () => {
      source.close();
    };
  }, []);

  const sorted = Array.from(files.values()).sort(
    (a, b) => b.updatedAt - a.updatedAt
  );

  const activeCount = sorted.filter(
    (f) => f.stage === "extracting" || f.stage === "embedding"
  ).length;

  return (
    <section className="panel animate-fade-up flex h-full flex-col overflow-hidden" style={{ animationDelay: "220ms" }}>
      {/* header */}
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
        <div>
          <h2 className="text-[15px] font-medium tracking-tight text-white">
            Interfaze pipeline
          </h2>
          <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
            {sorted.length === 0
              ? "extract · embed · index"
              : `${sorted.length} file${sorted.length === 1 ? "" : "s"}${
                  activeCount ? ` · ${activeCount} in flight` : ""
                }`}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-zinc-300">
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
          {connected ? "Live" : "Connecting"}
        </span>
      </header>

      {/* body */}
      {sorted.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
          <div className="relative mb-5">
            <div className="absolute inset-0 -z-10 rounded-full bg-white/10 blur-2xl" />
            <div className="flex size-14 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] text-zinc-400">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="size-6"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 16.5V9.75m0 0l-3.75 3.75M12 9.75l3.75 3.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
          <p className="text-sm font-medium text-zinc-200">
            Waiting for documents
          </p>
          <p className="mt-1.5 max-w-xs text-sm text-zinc-500">
            Drop a file into your connected Box folder — Interfaze picks it up
            and streams it through the pipeline in real time.
          </p>
        </div>
      ) : (
        <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
          {sorted.map((status) => (
            <FileCard key={status.fileId} status={status} />
          ))}
        </div>
      )}
    </section>
  );
}
