import { useEffect, useState } from "react";
import type { FileStatus } from "@/lib/redis";
import FileCard from "@/components/FileCard";
import { getFiles, UnauthorizedError } from "./api";

export default function Files({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [files, setFiles] = useState<FileStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFiles()
      .then(setFiles)
      .catch((e) => {
        if (e instanceof UnauthorizedError) onUnauthorized();
        else setError((e as Error).message);
      });
  }, [onUnauthorized]);

  if (error) return <p className="p-4 text-xs text-destructive">{error}</p>;

  if (files === null) {
    return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
        <div className="relative mb-5">
          <div className="absolute inset-0 -z-10 rounded-full bg-white/10 blur-2xl" />
          <div className="flex size-14 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] text-zinc-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="size-6" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l-3.75 3.75M12 9.75l3.75 3.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <p className="text-sm font-medium text-zinc-200">No documents yet</p>
        <p className="mt-1.5 max-w-xs text-sm text-zinc-500">
          Add files to your connected Box folder and index them from the web app —
          they’ll show up here.
        </p>
      </div>
    );
  }

  const activeCount = files.filter(
    (f) => f.stage === "extracting" || f.stage === "embedding",
  ).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <p className="font-mono text-[11px] text-zinc-500">
          {files.length} file{files.length === 1 ? "" : "s"}
          {activeCount ? ` · ${activeCount} in flight` : ""}
        </p>
      </div>
      <div className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
        {files.map((status) => (
          <FileCard key={status.fileId} status={status} />
        ))}
      </div>
    </div>
  );
}
