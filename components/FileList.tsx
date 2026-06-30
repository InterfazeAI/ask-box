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

  if (sorted.length === 0) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50/50 px-6 py-12 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-300 shadow-sm ring-1 ring-gray-200">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="h-6 w-6"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 16.5V9.75m0 0l-3.75 3.75M12 9.75l3.75 3.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <p className="max-w-xs text-sm text-gray-500">
          Upload a file to your connected Box folder to see it indexed here.
        </p>
        <span
          className={`mt-4 inline-flex items-center gap-1.5 text-xs ${
            connected ? "text-gray-400" : "text-amber-500"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connected ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
            }`}
          />
          {connected ? "Listening for updates" : "Connecting..."}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((status) => (
        <FileCard key={status.fileId} status={status} />
      ))}
    </div>
  );
}
