import { useCallback, useEffect, useState } from "react";
import { FolderIcon, MessageSquareIcon, SettingsIcon } from "lucide-react";
import ChatPanel from "@/components/ChatPanel";
import BoxLogo from "@/components/BoxLogo";
import { BASE_URL, getStoredSid } from "./storage";
import { connectBox, disconnect } from "./auth";
import Settings from "./Settings";
import Files from "./Files";

type Tab = "chat" | "files" | "settings";

export default function SidePanel() {
  const [ready, setReady] = useState(false);
  const [sid, setSid] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setSid(await getStoredSid());
    setReady(true);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      await connectBox();
      await refresh();
      setTab("chat");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    await disconnect();
    setSid(null);
  }

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!sid) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="flex h-11 items-center justify-center rounded-lg bg-white px-3 text-black">
          <BoxLogo className="h-5 w-auto" />
        </span>
        <h1 className="text-[15px] font-semibold tracking-tight text-zinc-100">Ask Box</h1>
        <p className="text-sm text-muted-foreground">
          Connect your Box account to chat with your knowledge base.
        </p>
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {connecting ? "Connecting…" : "Connect Box"}
        </button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-1.5 border-b border-white/8 px-2.5 py-1.5">
        <div className="mr-auto flex items-center gap-2">
          <span className="flex h-6 items-center justify-center rounded bg-white px-1.5 text-black">
            <BoxLogo className="h-3 w-auto" />
          </span>
          <span className="text-[14px] font-semibold tracking-tight text-white">Ask Box</span>
        </div>
        <TabButton active={tab === "chat"} onClick={() => setTab("chat")} icon={<MessageSquareIcon className="size-3.5" />} label="Chat" />
        <TabButton active={tab === "files"} onClick={() => setTab("files")} icon={<FolderIcon className="size-3.5" />} label="Files" />
        <TabButton active={tab === "settings"} onClick={() => setTab("settings")} icon={<SettingsIcon className="size-3.5" />} label="Settings" />
      </header>

      {/* Chat stays mounted across tab switches so the conversation persists;
          it is hidden (not unmounted) when another tab is active. The `key`
          remounts it when the account changes so a new session takes effect. */}
      <div className={tab === "chat" ? "min-h-0 flex-1" : "hidden"}>
        <ChatPanel
          key={sid}
          api={`${BASE_URL}/api/chat`}
          headers={{ "x-askbox-sid": sid }}
          className="flex h-full flex-col overflow-hidden"
        />
      </div>
      {tab === "files" && <Files onUnauthorized={() => setSid(null)} />}
      {tab === "settings" && <Settings onDisconnect={handleDisconnect} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-white/10 text-zinc-100" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
