"use client";

import { useState } from "react";

export default function SyncButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function sync() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setResult(data.error ?? "Sync failed");
      } else {
        const parts = [`Indexed ${data.indexed}`, `skipped ${data.skipped}`];
        if (data.removed) parts.push(`removed ${data.removed}`);
        if (data.failed) parts.push(`failed ${data.failed}`);
        setResult(parts.join(", "));
      }
    } catch {
      setResult("Sync failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2.5">
      {result && (
        <span className="hidden font-mono text-[11px] text-zinc-500 md:inline">
          {result}
        </span>
      )}
      <button
        onClick={sync}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-zinc-200 backdrop-blur transition-colors duration-150 hover:border-white/20 hover:bg-white/[0.06] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        {loading ? "Syncing…" : "Sync"}
      </button>
    </div>
  );
}
