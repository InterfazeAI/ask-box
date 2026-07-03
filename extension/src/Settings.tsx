import { BASE_URL } from "./storage";

export default function Settings({ onDisconnect }: { onDisconnect: () => void }) {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <div>
        <p className="text-sm font-medium text-zinc-100">Backend</p>
        <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
          {BASE_URL.replace(/^https?:\/\//, "")}
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
