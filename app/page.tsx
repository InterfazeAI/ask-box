import ConnectBox from "@/components/ConnectBox";
import FolderTree from "@/components/FolderTree";
import ChatPanel from "@/components/ChatPanel";
import BoxLogo from "@/components/BoxLogo";
import InterfazeWordmark from "@/components/InterfazeWordmark";

export default function Home() {
  return (
    <main className="relative z-10 min-h-screen">
      {/* ── Sticky glass nav ─────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 border-b border-white/8 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 items-center justify-center rounded-md bg-white px-2.5 text-black">
              <BoxLogo className="h-4 w-auto" />
            </span>
            <span className="text-sm font-semibold tracking-tight text-white">
              Company Brain
            </span>
            <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
            <span className="hidden text-sm text-zinc-500 sm:inline">Powered by</span>
            <a
              href="https://interfaze.ai"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Interfaze"
              className="transition-opacity hover:opacity-80"
            >
              <InterfazeWordmark className="h-5 w-auto" />
            </a>
          </div>
          <div className="flex items-center gap-3">
            <ConnectBox />
          </div>
        </div>
      </nav>
      {/* ── Workspace ────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 items-stretch gap-6 px-6 pb-24 pt-10 lg:grid-cols-[1.05fr_0.95fr]">
        <FolderTree />
        <ChatPanel />
      </section>
    </main>
  );
}
