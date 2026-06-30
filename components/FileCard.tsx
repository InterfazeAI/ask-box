import type { FileStatus, Stage } from "@/lib/redis";

const STAGE_CONFIG: Record<
  Stage,
  { label: string; badge: string; dot: string; pulse?: boolean }
> = {
  queued: {
    label: "Queued",
    badge: "bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-200",
    dot: "bg-gray-400",
  },
  extracting: {
    label: "Extracting",
    badge: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
    dot: "bg-amber-500",
    pulse: true,
  },
  embedding: {
    label: "Embedding",
    badge: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
    dot: "bg-amber-500",
    pulse: true,
  },
  indexed: {
    label: "Indexed",
    badge: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
    dot: "bg-emerald-500",
  },
  error: {
    label: "Error",
    badge: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
    dot: "bg-red-500",
  },
};

function StatusBadge({ status }: { status: FileStatus }) {
  const config = STAGE_CONFIG[status.stage];

  return (
    <span
      title={status.stage === "error" ? status.error : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-300 ${config.badge}`}
    >
      {config.pulse ? (
        <span className="relative flex h-2 w-2">
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${config.dot}`}
          />
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${config.dot}`}
          />
        </span>
      ) : status.stage === "indexed" ? (
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3.5 w-3.5 shrink-0"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <span className={`h-2 w-2 shrink-0 rounded-full ${config.dot}`} />
      )}
      <span>{config.label}</span>
      {status.stage === "indexed" && typeof status.chunkCount === "number" && (
        <span className="text-emerald-600/70">
          &middot; {status.chunkCount} chunk{status.chunkCount === 1 ? "" : "s"}
        </span>
      )}
    </span>
  );
}

export default function FileCard({ status }: { status: FileStatus }) {
  return (
    <div
      title={status.stage === "error" ? status.error : undefined}
      className="group flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-400 ring-1 ring-inset ring-gray-200 transition-colors group-hover:bg-gray-100">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4.5 w-4.5"
            aria-hidden="true"
          >
            <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">
            {status.name}
          </p>
          {status.stage === "error" && status.error && (
            <p className="truncate text-xs text-red-500">{status.error}</p>
          )}
        </div>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}
