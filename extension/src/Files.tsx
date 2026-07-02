import { useEffect, useState } from "react";
import { getFiles, UnauthorizedError } from "./api";

type FileRow = { name: string; stage: string; updatedAt: number };

export default function Files({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [files, setFiles] = useState<FileRow[] | null>(null);
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
  if (files === null) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (files.length === 0)
    return <p className="p-4 text-sm text-muted-foreground">No files indexed yet.</p>;

  const indexed = files.filter((f) => f.stage === "indexed");
  return (
    <div className="flex-1 overflow-y-auto p-2">
      <p className="px-2 py-1 text-xs text-muted-foreground">
        {indexed.length} of {files.length} indexed
      </p>
      <ul className="flex flex-col">
        {files.map((f) => (
          <li
            key={f.name}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-200 hover:bg-white/5"
          >
            <span className="truncate">{f.name}</span>
            <span className="shrink-0 text-[11px] text-zinc-500">{f.stage}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
