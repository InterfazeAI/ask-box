import ConnectBox from "@/components/ConnectBox";
import SyncButton from "@/components/SyncButton";
import FileList from "@/components/FileList";
import ChatPanel from "@/components/ChatPanel";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50/50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              Box RAG Demo
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Chat with documents synced live from your Box folder.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SyncButton />
            <ConnectBox />
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm font-medium text-gray-500">Files</h2>
            <FileList />
          </section>
          <section>
            <h2 className="mb-3 text-sm font-medium text-gray-500">Chat</h2>
            <ChatPanel />
          </section>
        </div>
      </div>
    </main>
  );
}
