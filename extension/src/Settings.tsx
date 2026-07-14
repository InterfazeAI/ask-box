import { useEffect, useState } from "react";
import { BASE_URL, getDisplayMode, setDisplayMode, type DisplayMode } from "./storage";

export default function Settings({ onDisconnect }: { onDisconnect: () => void }) {
  const [mode, setMode] = useState<DisplayMode | null>(null);

  useEffect(() => {
    getDisplayMode().then(setMode);
  }, []);

  async function handleMode(next: DisplayMode) {
    setMode(next);
    await setDisplayMode(next);
  }

  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <div>
        <p className="text-sm font-medium text-zinc-100">Backend</p>
        <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
          {BASE_URL.replace(/^https?:\/\//, "")}
        </p>
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-100">Open as</p>
        <div className="mt-1.5 flex gap-1 rounded-md border border-white/10 p-0.5">
          <ModeButton active={mode === "popup"} onClick={() => handleMode("popup")} label="Popup" />
          <ModeButton
            active={mode === "sidepanel"}
            onClick={() => handleMode("sidepanel")}
            label="Side panel"
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Side panel works in Chrome and Edge; use Popup in Arc.
        </p>
      </div>
      <button
        type="button"
        onClick={onDisconnect}
        className="mt-1 rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
      >
        Disconnect Box
      </button>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-white/10 text-zinc-100" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
      }`}
    >
      {label}
    </button>
  );
}
