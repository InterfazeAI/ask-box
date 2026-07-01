import { useEffect, useState } from "react";
import { getBaseUrl, setBaseUrl, normalizeBaseUrl } from "./storage";

export default function Settings({ onSaved }: { onSaved: (url: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBaseUrl().then(setValue);
  }, []);

  async function handleSave() {
    try {
      await setBaseUrl(value);
      setError(null);
      onSaved(normalizeBaseUrl(value));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <label className="text-sm font-medium text-zinc-100" htmlFor="base-url">
        Backend URL
      </label>
      <p className="text-xs text-muted-foreground">
        The base URL of your Box RAG app. Example: http://localhost:3000
      </p>
      <input
        id="base-url"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="http://localhost:3000"
        className="rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-zinc-100 outline-none focus:border-white/25"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        type="button"
        onClick={handleSave}
        className="mt-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Save
      </button>
    </div>
  );
}
