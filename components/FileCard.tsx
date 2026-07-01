import type { FileStatus, Stage } from "@/lib/redis";

/* Ordered pipeline the rail renders left → right */
const PIPELINE: { key: Exclude<Stage, "error">; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "extracting", label: "Extracting" },
  { key: "embedding", label: "Embedding" },
  { key: "indexed", label: "Indexed" },
];

/* Status colors live only as small dots (design.md) */
const STAGE_META: Record<Stage, { label: string; dot: string; pulse?: boolean }> = {
  queued: { label: "Queued", dot: "bg-status-gray" },
  extracting: { label: "Extracting", dot: "bg-status-amber", pulse: true },
  embedding: { label: "Embedding", dot: "bg-status-amber", pulse: true },
  indexed: { label: "Indexed", dot: "bg-status-green" },
  error: { label: "Failed", dot: "bg-status-red" },
};

function Dot({ className = "", pulse = false }: { className?: string; pulse?: boolean }) {
  if (pulse) {
    return (
      <span className="relative flex size-2.5">
        <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-70 ${className}`} />
        <span className={`relative inline-flex size-2.5 rounded-full ${className}`} />
      </span>
    );
  }
  return <span className={`size-2.5 shrink-0 rounded-full ${className}`} />;
}

function Node({
  state,
  dot,
  pulse,
}: {
  state: "done" | "active" | "pending" | "failed";
  dot: string;
  pulse?: boolean;
}) {
  const base = "relative z-10 flex size-3.5 items-center justify-center rounded-full";

  if (state === "failed") {
    return <span className={base}><Dot className="bg-status-red" /></span>;
  }
  if (state === "active") {
    return <span className={base}><Dot className={dot} pulse={pulse} /></span>;
  }
  if (state === "done") {
    // Completed steps are achromatic; only the terminal state carries a status color.
    return <span className={`${base}`}><span className={`size-2.5 rounded-full ${dot}`} /></span>;
  }
  // pending
  return <span className={`${base} rounded-full border border-white/15 bg-[#0c0c0f]`} />;
}

function Rail({ status }: { status: FileStatus }) {
  const isError = status.stage === "error";
  const current = isError ? -1 : PIPELINE.findIndex((s) => s.key === status.stage);
  const isDone = status.stage === "indexed";

  const frac = current <= 0 ? 0 : current / (PIPELINE.length - 1);

  return (
    <div className="relative mt-3.5">
      {/* base track */}
      <div className="absolute inset-x-[7px] top-[7px] h-px -translate-y-1/2 bg-white/10" />
      {/* achromatic fill */}
      <div
        className="absolute left-[7px] top-[7px] h-px -translate-y-1/2 overflow-hidden rounded-full bg-gradient-to-r from-white/25 to-white/65 transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ width: `calc((100% - 14px) * ${frac})` }}
      >
        {(status.stage === "extracting" || status.stage === "embedding") && (
          <span className="rail-sweep absolute inset-0" />
        )}
      </div>

      {/* nodes */}
      <div className="relative flex items-center justify-between">
        {PIPELINE.map((stage, i) => {
          const isFinal = i === PIPELINE.length - 1;
          let state: "done" | "active" | "pending" | "failed" = "pending";
          if (isError) state = i === 0 ? "failed" : "pending";
          else if (isDone) state = "done";
          else if (i < current) state = "done";
          else if (i === current) state = "active";

          // done steps are neutral (white); terminal "indexed" node uses green
          const doneDot = isFinal ? "bg-status-green" : "bg-white/70";
          const activeMeta = STAGE_META[status.stage];
          return (
            <Node
              key={stage.key}
              state={state}
              dot={state === "active" ? activeMeta.dot : doneDot}
              pulse={state === "active" ? activeMeta.pulse : false}
            />
          );
        })}
      </div>

      {/* labels */}
      <div className="mt-2 flex items-center justify-between">
        {PIPELINE.map((stage, i) => {
          const active = !isError && i === current;
          const complete = !isError && (isDone || i < current);
          return (
            <span
              key={stage.key}
              className={`font-mono text-[10px] uppercase tracking-[0.08em] tabular-nums transition-colors duration-500 ${
                active ? "text-zinc-200" : complete ? "text-zinc-400" : "text-zinc-600"
              }`}
            >
              {stage.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function FileCard({ status }: { status: FileStatus }) {
  const isError = status.stage === "error";
  const meta = STAGE_META[status.stage];

  return (
    <div
      title={isError ? status.error : undefined}
      className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.015] px-4 py-3.5 transition-all duration-300 hover:border-white/12 hover:bg-white/[0.03]"
    >
      {/* header row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-zinc-400 transition-colors group-hover:text-zinc-200">
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4.5" aria-hidden="true">
              <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-100">{status.name}</p>
            {isError && status.error ? (
              <p className="truncate text-xs text-destructive">{status.error}</p>
            ) : (
              <p className="truncate font-mono text-[11px] text-zinc-500">
                {status.stage === "indexed" && typeof status.chunkCount === "number"
                  ? `${status.chunkCount} chunk${status.chunkCount === 1 ? "" : "s"} · vectorized`
                  : "document"}
              </p>
            )}
          </div>
        </div>

        {/* status: small dot + label, no fill (design.md) */}
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-zinc-300">
          <Dot className={meta.dot} pulse={meta.pulse} />
          {meta.label}
        </span>
      </div>

      {/* the animated pipeline rail */}
      <Rail status={status} />
    </div>
  );
}
