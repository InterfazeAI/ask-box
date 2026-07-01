# Ask Box — Chrome Side Panel Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome MV3 side-panel extension that lets the user chat with their Box RAG knowledge base from any tab, reusing the existing `POST /api/chat` backend and the existing React chat components.

**Architecture:** A self-contained `extension/` folder with its own Vite build. Vite's `@` alias points at the repo root so the extension imports the *same* chat components (`ChatPanel`, message scroller, bubbles, Markdown, `InterfazeLogo`). The panel reads a user-configurable backend base URL from `chrome.storage.sync` and points `useChat`'s transport at `${baseUrl}/api/chat`. The extension's `package.json` carries only build tooling; runtime libraries (react, ai, @ai-sdk/react, etc.) resolve from the repo-root `node_modules` via Node's upward module resolution.

**Tech Stack:** Chrome MV3 (Side Panel API), Vite 6, React 19, `@ai-sdk/react` v3 `useChat`, `ai` v6, Tailwind CSS v4 (`@tailwindcss/vite`), Vitest.

## Global Constraints

- Manifest V3 only; Side Panel API requires Chrome 114+.
- Do NOT modify the logic of `app/api/chat/route.ts`. It stays as-is.
- Broad host permissions: `host_permissions: ["http://*/*", "https://*/*"]` (avoids CORS without touching the API).
- Reuse existing components via the `@` alias; do not copy component JSX.
- Runtime deps resolve from repo-root `node_modules`; `extension/package.json` lists build tooling only.
- Do NOT wrap `useChat` in React `StrictMode` (documented double-request issue).
- Default backend base URL: `http://localhost:3000`. Stored under key `askbox_base_url` in `chrome.storage.sync`.
- Tailwind v4 version must match root (`^4.3.2`). React must be deduped to a single copy.
- Extension icon assets are out of scope (Chrome shows a default toolbar icon).

## File Structure

```
extension/
  package.json           # build tooling only (vite, plugins, @types/chrome)
  tsconfig.json          # TS config, @ alias -> repo root
  vite.config.ts         # react + tailwind plugins, multi-entry MV3 build
  index.html             # side panel document (class="dark")
  src/
    main.tsx             # mounts <SidePanel/> (no StrictMode)
    SidePanel.tsx        # base-URL state, settings toggle, renders <ChatPanel/>
    Settings.tsx         # base-URL input, persists to storage
    storage.ts           # getBaseUrl / setBaseUrl / normalizeBaseUrl
    storage.test.ts      # unit tests (Vitest, chrome mocked)
    background.ts        # service worker: open side panel on toolbar click
    styles.css           # imports app globals.css, font fallbacks, @source globs
  public/
    manifest.json        # MV3 manifest (copied to dist root by Vite)
    interfaze_icon.svg   # asset InterfazeLogo references at /interfaze_icon.svg
```

Modified existing file:
- `components/ChatPanel.tsx` — add optional `api` and `className` props (defaults preserve current behavior).

---

### Task 1: Extension build scaffold

Produces a loadable MV3 extension whose toolbar icon opens an (empty) side panel. No automated test — verified by building and loading in Chrome.

**Files:**
- Create: `extension/package.json`
- Create: `extension/tsconfig.json`
- Create: `extension/vite.config.ts`
- Create: `extension/index.html`
- Create: `extension/src/main.tsx`
- Create: `extension/src/styles.css`
- Create: `extension/src/background.ts`
- Create: `extension/public/manifest.json`
- Create: `extension/public/interfaze_icon.svg` (copied from repo `public/interfaze_icon.svg`)

**Interfaces:**
- Consumes: repo-root `node_modules` (react, react-dom, tailwindcss) via upward resolution.
- Produces: `extension/dist/` containing `index.html`, `background.js`, `manifest.json`, `interfaze_icon.svg`, `assets/*`. Later tasks add `SidePanel`, `Settings`, `storage`.

- [ ] **Step 1: Create `extension/package.json`**

```json
{
  "name": "ask-box-extension",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite build --watch --mode development",
    "build": "vite build"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.2",
    "@types/chrome": "^0.0.287",
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create `extension/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["chrome"],
    "baseUrl": ".",
    "paths": { "@/*": ["../*"] }
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 3: Create `extension/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// The @ alias points at the repo root so the extension imports the SAME
// components as the Next app (e.g. `@/components/ChatPanel`).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "..") },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: path.resolve(__dirname, "index.html"),
        background: path.resolve(__dirname, "src/background.ts"),
      },
      output: {
        // Keep the service worker at a stable path the manifest references.
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
```

- [ ] **Step 4: Create `extension/index.html`**

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ask Box</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `extension/src/styles.css`**

```css
@import "../../app/globals.css";

/* Tailwind v4 auto-detects co-located sources; the shared components live
   outside this folder, so declare them explicitly. */
@source "../../components";
@source "../../app";
@source "../../lib";

/* next/font isn't available in a Vite build; map the CSS variables the shared
   components expect to a system fallback stack so layout still looks right. */
:root {
  --font-geist-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-geist-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}

html,
body,
#root {
  height: 100%;
  margin: 0;
}

body {
  background: var(--background);
  color: var(--foreground);
}
```

Note: the `@import` path is `../../app/globals.css` because `styles.css` lives in `extension/src/` (two levels below the repo root).

- [ ] **Step 6: Create `extension/src/main.tsx` (placeholder for now)**

```tsx
import { createRoot } from "react-dom/client";
import "./styles.css";

// NOTE: intentionally NOT wrapped in <React.StrictMode> — useChat has a
// documented double-request issue under Strict Mode. SidePanel arrives in a
// later task; this placeholder proves the build + panel load.
createRoot(document.getElementById("root")!).render(
  <div style={{ padding: 16, fontFamily: "var(--font-geist-sans)" }}>
    Ask Box — side panel loaded.
  </div>,
);
```

- [ ] **Step 7: Create `extension/src/background.ts`**

```ts
// Open the side panel when the user clicks the toolbar icon.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("setPanelBehavior failed", err));
});
```

- [ ] **Step 8: Create `extension/public/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Ask Box",
  "version": "0.1.0",
  "description": "Chat with your Box RAG knowledge base from any tab.",
  "permissions": ["storage", "sidePanel"],
  "host_permissions": ["http://*/*", "https://*/*"],
  "action": { "default_title": "Ask Box" },
  "side_panel": { "default_path": "index.html" },
  "background": { "service_worker": "background.js", "type": "module" }
}
```

- [ ] **Step 9: Copy the logo asset into the extension**

Run:
```bash
cp public/interfaze_icon.svg extension/public/interfaze_icon.svg
```
Expected: file exists at `extension/public/interfaze_icon.svg`.

- [ ] **Step 10: Install and build**

Run:
```bash
npm install                       # repo root — ensures runtime deps exist
cd extension && npm install && npm run build
```
Expected: `extension/dist/` contains `index.html`, `background.js`, `manifest.json`, `interfaze_icon.svg`, and an `assets/` folder. No build errors.

- [ ] **Step 11: Manual load verification**

1. Open `chrome://extensions`, enable Developer mode.
2. Click **Load unpacked**, select `extension/dist/`.
3. Click the "Ask Box" toolbar icon.
Expected: a side panel opens on the right showing "Ask Box — side panel loaded."

- [ ] **Step 12: Commit**

```bash
git add extension/ && git commit -m "feat(extension): MV3 side-panel build scaffold"
```

---

### Task 2: Base-URL storage helper (TDD)

**Files:**
- Create: `extension/src/storage.ts`
- Test: `extension/src/storage.test.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_BASE_URL: string` (= `"http://localhost:3000"`)
  - `normalizeBaseUrl(url: string): string` — trims, strips trailing slashes, throws if no `http(s)://` scheme.
  - `getBaseUrl(): Promise<string>` — stored value or `DEFAULT_BASE_URL`.
  - `setBaseUrl(url: string): Promise<void>` — normalizes then persists to `chrome.storage.sync` under key `askbox_base_url`.

- [ ] **Step 1: Write the failing test — `extension/src/storage.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getBaseUrl, setBaseUrl, normalizeBaseUrl, DEFAULT_BASE_URL } from "./storage";

function mockChromeStorage() {
  let store: Record<string, unknown> = {};
  return {
    sync: {
      get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
      set: vi.fn(async (items: Record<string, unknown>) => {
        store = { ...store, ...items };
      }),
    },
  };
}

describe("storage", () => {
  beforeEach(() => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: mockChromeStorage(),
    };
  });

  it("returns the default when nothing is stored", async () => {
    expect(await getBaseUrl()).toBe(DEFAULT_BASE_URL);
  });

  it("round-trips a saved URL", async () => {
    await setBaseUrl("https://example.com");
    expect(await getBaseUrl()).toBe("https://example.com");
  });

  it("strips trailing slashes when normalizing", () => {
    expect(normalizeBaseUrl("https://example.com/")).toBe("https://example.com");
  });

  it("trims whitespace when normalizing", () => {
    expect(normalizeBaseUrl("  http://localhost:3000  ")).toBe("http://localhost:3000");
  });

  it("throws for a URL without an http(s) scheme", () => {
    expect(() => normalizeBaseUrl("example.com")).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- storage`
Expected: FAIL — cannot resolve `./storage` (module not found).

- [ ] **Step 3: Write minimal implementation — `extension/src/storage.ts`**

```ts
const KEY = "askbox_base_url";
export const DEFAULT_BASE_URL = "http://localhost:3000";

export function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(trimmed)) {
    throw new Error("Base URL must start with http:// or https://");
  }
  return trimmed;
}

export async function getBaseUrl(): Promise<string> {
  const result = await chrome.storage.sync.get(KEY);
  return (result[KEY] as string) || DEFAULT_BASE_URL;
}

export async function setBaseUrl(url: string): Promise<void> {
  await chrome.storage.sync.set({ [KEY]: normalizeBaseUrl(url) });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- storage`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/src/storage.ts extension/src/storage.test.ts
git commit -m "feat(extension): base-URL storage helper with tests"
```

---

### Task 3: Make ChatPanel reusable (app change)

Add optional props to the existing `ChatPanel` so the extension can point it at a different API URL and control its layout. Defaults preserve current app behavior.

**Files:**
- Modify: `components/ChatPanel.tsx:49-74`

**Interfaces:**
- Produces: `ChatPanel` accepts `{ api?: string; className?: string }`.
  - `api` defaults to `"/api/chat"`.
  - `className` overrides the root `<section>` class (defaults to the current panel classes).
- Consumes: nothing new. `app/page.tsx` calls `<ChatPanel />` with no props and is unaffected.

- [ ] **Step 1: Edit the component signature and `useChat` transport**

Change `components/ChatPanel.tsx` lines 49-52 from:

```tsx
export default function ChatPanel() {
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
```

to:

```tsx
export default function ChatPanel({
  api = "/api/chat",
  className,
}: { api?: string; className?: string } = {}) {
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api }),
  });
```

- [ ] **Step 2: Apply `className` override on the root section**

Change lines 71-74 from:

```tsx
    <section
      className="panel animate-fade-up flex h-[640px] max-h-[80vh] flex-col overflow-hidden"
      style={{ animationDelay: "320ms" }}
    >
```

to:

```tsx
    <section
      className={
        className ??
        "panel animate-fade-up flex h-[640px] max-h-[80vh] flex-col overflow-hidden"
      }
      style={{ animationDelay: "320ms" }}
    >
```

- [ ] **Step 3: Verify the app still builds**

Run: `npm run build`
Expected: build succeeds. `app/page.tsx`'s `<ChatPanel />` compiles unchanged (props are optional).

- [ ] **Step 4: Commit**

```bash
git add components/ChatPanel.tsx
git commit -m "refactor(chat): accept optional api and className props on ChatPanel"
```

---

### Task 4: Settings view

**Files:**
- Create: `extension/src/Settings.tsx`

**Interfaces:**
- Consumes: `getBaseUrl`, `setBaseUrl` from `./storage` (Task 2).
- Produces: default export `Settings`, props `{ onSaved: (url: string) => void }`. Calls `onSaved(normalizedUrl)` after a successful save.

- [ ] **Step 1: Create `extension/src/Settings.tsx`**

```tsx
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
```

- [ ] **Step 2: Build to verify it compiles**

Run: `cd extension && npm run build`
Expected: build succeeds (Settings not yet rendered, but must type-check/compile).

- [ ] **Step 3: Commit**

```bash
git add extension/src/Settings.tsx
git commit -m "feat(extension): settings view for backend base URL"
```

---

### Task 5: SidePanel — wire chat + settings end-to-end

**Files:**
- Create: `extension/src/SidePanel.tsx`
- Modify: `extension/src/main.tsx`

**Interfaces:**
- Consumes: `getBaseUrl` from `./storage` (Task 2); `Settings` (Task 4); `ChatPanel` from `@/components/ChatPanel` (Task 3, props `{ api, className }`).
- Produces: default export `SidePanel` (no props).

- [ ] **Step 1: Create `extension/src/SidePanel.tsx`**

```tsx
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
```

- [ ] **Step 2: Update `extension/src/main.tsx` to render SidePanel**

Replace the placeholder body with:

```tsx
import { createRoot } from "react-dom/client";
import SidePanel from "./SidePanel";
import "./styles.css";

// NOT wrapped in <React.StrictMode> — useChat has a documented double-request
// issue under Strict Mode.
createRoot(document.getElementById("root")!).render(<SidePanel />);
```

- [ ] **Step 3: Rebuild**

Run: `cd extension && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual end-to-end verification**

Pre-req: run the Next app at repo root (`npm run dev`) so `http://localhost:3000/api/chat` is reachable and some Box docs are indexed.

1. Reload the unpacked extension at `chrome://extensions` (click the refresh icon on the Ask Box card).
2. Open the side panel via the toolbar icon.
3. Click the gear → confirm the field shows `http://localhost:3000` → Save.
4. Ask a question about an indexed document.
   Expected: a "Thinking…" bubble, then a streamed answer rendered as Markdown, with the Interfaze avatar showing.
5. Switch to another tab mid-conversation.
   Expected: the panel and chat history persist.
6. Open the gear, set a bad URL (e.g. `notaurl`), Save.
   Expected: inline error "Base URL must start with http:// or https://"; nothing saved.
7. Set it back to `http://localhost:3000`, Save, ask again.
   Expected: chat works (fresh chat, since the panel remounts on URL change).

- [ ] **Step 5: Commit**

```bash
git add extension/src/SidePanel.tsx extension/src/main.tsx
git commit -m "feat(extension): wire side-panel chat and settings end-to-end"
```

---

### Task 6: Documentation

**Files:**
- Modify: `README.md` (append a new section)

**Interfaces:** none.

- [ ] **Step 1: Append a "Chrome Extension (Ask Box)" section to `README.md`**

Add at the end of `README.md`:

```markdown
## Chrome Extension — Ask Box

A Chrome side-panel extension to chat with your indexed Box documents from any
tab. It reuses this app's `/api/chat` backend and chat UI.

### Build & load

```bash
# from the repo root (ensures runtime deps are installed)
npm install

cd extension
npm install
npm run build        # outputs extension/dist/
# or: npm run dev    # watch mode, rebuilds on change
```

1. Open `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked** and select `extension/dist/`.
3. Click the **Ask Box** toolbar icon to open the side panel.
4. Click the gear icon and set the **Backend URL** (default `http://localhost:3000`),
   then Save.
5. Ask questions about your indexed Box documents.

Requires Chrome 114+ (Side Panel API). The backend URL is stored in
`chrome.storage.sync`; switch it any time to point at a deployed instance.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: how to build and load the Ask Box extension"
```

---

## Self-Review

**Spec coverage:**
- Side panel UI → Tasks 1, 5. ✅
- Configurable base URL (storage, default, settings) → Tasks 2, 4. ✅
- Reuse `useChat` + components via alias → Tasks 3, 5. ✅
- Broad host_permissions, no `/api/chat` changes → Task 1 (manifest). ✅
- Own package.json / build tooling, runtime deps from root → Task 1. ✅
- Error handling (no URL / bad URL / network error) → Settings validation (Task 4), remount on change and existing `error` branch in ChatPanel (Task 5 verification step 6-7). ✅
- Testing: storage unit tests → Task 2; manual checklist → Task 5. ✅
- Docs → Task 6. ✅
- Asset handling for `InterfazeLogo` → Task 1 step 9. ✅
- Dark class + font fallback → Task 1 steps 4, 5. ✅

**Placeholder scan:** No TBD/TODO; every code step contains full code. ✅

**Type consistency:** `getBaseUrl`/`setBaseUrl`/`normalizeBaseUrl`/`DEFAULT_BASE_URL` defined in Task 2 are used with matching signatures in Tasks 4 and 5. `ChatPanel` props `{ api, className }` defined in Task 3 match usage in Task 5. `Settings` prop `onSaved` defined in Task 4 matches usage in Task 5. ✅

**Note on empty-state-without-URL:** `getBaseUrl` always returns a non-empty value (falls back to `DEFAULT_BASE_URL`), so there is no "unset URL" dead-end; the panel is always chattable and the user changes the URL via the gear. This intentionally simplifies the spec's "prompt to set URL" empty state.
```
