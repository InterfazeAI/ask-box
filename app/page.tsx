import ConnectBox from "@/components/ConnectBox";
import FolderTree from "@/components/FolderTree";
import ChatPanel from "@/components/ChatPanel";
import BoxLogo from "@/components/BoxLogo";
import InterfazeLogo from "@/components/InterfazeLogo";

export default function Home() {
  return (
    <main className="relative z-10 min-h-screen">
      {/* ── Sticky glass nav ─────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 border-b border-white/8 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 items-center justify-center rounded-md bg-white px-2.5 text-black">
              <BoxLogo className="h-4 w-auto" />
            </span>
            <span className="text-sm text-zinc-600">×</span>
            <span className="flex h-9 items-center justify-center rounded-md bg-white px-2.5">
              <InterfazeLogo className="h-4 w-auto" />
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ConnectBox />
          </div>
        </div>
      </nav>

      {/* ── Keynote hero ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-14 pt-20 text-center sm:pt-28">
        <span
          className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400"
          style={{ animationDelay: "0ms" }}
        >
           Box × Interfaze
        </span>

        <h1
          className="animate-fade-up text-gradient mx-auto mt-7 max-w-3xl text-5xl font-semibold leading-[1.02] sm:text-7xl"
          style={{ animationDelay: "80ms" }}
        >
          Every Box document,
          <br className="hidden sm:block" /> understood by Interfaze.
        </h1>

        <p
          className="animate-fade-up mx-auto mt-6 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg"
          style={{ animationDelay: "160ms" }}
        >
          The moment a file lands in Box, Interfaze extracts, OCRs, embeds, and
          indexes it in real time — turning your content into answers.
        </p>
      </section>

      {/* ── Workspace ────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 items-stretch gap-6 px-6 pb-24 lg:grid-cols-[1.05fr_0.95fr]">
        <FolderTree />
        <ChatPanel />
      </section>
    </main>
  );
}
