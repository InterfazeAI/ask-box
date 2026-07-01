"use client";

import { useEffect, useState } from "react";
import BoxLogo from "@/components/BoxLogo";

export default function ConnectBox() {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/box/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => active && setConnected(!!d.connected))
      .catch(() => active && setConnected(false));
    return () => {
      active = false;
    };
  }, []);

  // While we're checking connection status, show a loader.
  if (connected === null) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-zinc-400">
        <svg viewBox="0 0 24 24" fill="none" className="size-3.5 animate-spin text-zinc-400" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Checking Box…
      </span>
    );
  }

  if (connected) {
    return (
      <span
        title="Box is connected"
        className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-zinc-200"
      >
        <span className="size-2 rounded-full bg-status-green shadow-[0_0_8px_0_var(--color-status-green)]" />
        Box connected
      </span>
    );
  }

  return (
    <a
      href="/api/box/oauth/start"
      className="group inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90 focus:outline-none"
    >
      <BoxLogo className="h-3 w-auto transition-transform duration-200 group-hover:scale-110" />
      Connect Box
    </a>
  );
}
