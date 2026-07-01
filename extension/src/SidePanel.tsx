import { useEffect, useState } from "react";
import { SettingsIcon } from "lucide-react";
import ChatPanel from "@/components/ChatPanel";
import { getBaseUrl } from "./storage";
import Settings from "./Settings";

export default function SidePanel() {
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    getBaseUrl().then(setBaseUrl);
  }, []);

  if (baseUrl === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
        <h1 className="text-[15px] font-medium tracking-tight text-zinc-100">Ask Box</h1>
        <button
          type="button"
          aria-label="Settings"
          onClick={() => setShowSettings((s) => !s)}
          className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
        >
          <SettingsIcon className="size-4" />
        </button>
      </header>

      {showSettings ? (
        <Settings
          onSaved={(url) => {
            setBaseUrl(url);
            setShowSettings(false);
          }}
        />
      ) : (
        // `key={baseUrl}` remounts the chat (and its transport) when the URL
        // changes, so a new backend takes effect immediately.
        <div className="min-h-0 flex-1">
          <ChatPanel
            key={baseUrl}
            api={`${baseUrl}/api/chat`}
            className="flex h-full flex-col overflow-hidden"
          />
        </div>
      )}
    </div>
  );
}
