# Ask Box — Chrome Side Panel Extension (Design)

**Date:** 2026-07-01
**Status:** Approved for planning

## Summary

An "ask-anywhere" Chrome extension that lets the user chat with their Box RAG
knowledge base from any browser tab. It reuses the existing Next.js chat backend
(`POST /api/chat`) and, as much as possible, the existing React chat components.
The chat lives in a **Chrome Side Panel** (persistent, docked to the right) so a
conversation survives tab switches and scrolling.

## Goals

- Chat with the indexed Box documents from any tab, without opening the dashboard.
- Reuse `POST /api/chat` unchanged (embed → vector search → grounded streamed answer).
- Reuse the existing chat UI components (`useChat`, message scroller, bubbles,
  Markdown, `InterfazeLogo`) rather than reimplementing them.
- Point at any environment (localhost during dev, deployed URL for demos) via a
  one-time configurable base URL.

## Non-Goals

- No authentication flow. `/api/chat` has no per-user auth; it queries the shared
  vector index. The extension only needs network reach to the base URL.
- No file upload / capture-to-Box from the extension (that is a possible future
  feature, explicitly out of scope here).
- No changes to the RAG pipeline logic.

## Backend contract (existing, unchanged)

`POST {baseUrl}/api/chat`
- Request body: `{ messages: UIMessage[] }` (AI SDK v6 format).
- Response: a streamed UIMessage stream (`result.toUIMessageStreamResponse()`).
- The AI SDK's `useChat` + `DefaultChatTransport` handle request shaping and
  stream parsing. The only change from the app is the `api` URL.

## Architecture & layout

A self-contained `extension/` folder in this repo with its own Vite build and its
own `package.json` (so the extension's Vite tooling does not pollute the Next.js
app's dependencies). Vite's `@` path alias points at the repo root so the
extension imports the *same* chat component code, not copies.

```
extension/
  manifest.json          # MV3: side_panel + storage + broad host permissions
  vite.config.ts         # React + Tailwind v4 plugins, alias @ -> repo root
  index.html             # side panel document
  src/
    main.tsx             # mounts <SidePanel/>
    SidePanel.tsx        # chat UI (adapted from ChatPanel.tsx) + settings toggle
    Settings.tsx         # base-URL input, persisted to chrome.storage.sync
    storage.ts           # get/set base URL helpers (with default)
    background.ts        # service worker: open side panel on toolbar click
    styles.css           # imports the app's globals.css design tokens
  package.json           # extension-local deps (vite, @vitejs/plugin-react, tailwind)
```

Build output: `extension/dist/`, loaded unpacked in Chrome.

## Components

### SidePanel.tsx
A lightly adapted copy of `components/ChatPanel.tsx`. Differences from the app version:
- `transport: new DefaultChatTransport({ api: `${baseUrl}/api/chat` })`, where
  `baseUrl` is read from `chrome.storage.sync` on mount.
- Header gains a small gear icon that toggles the Settings view.
- If no base URL is configured, the empty state prompts the user to open Settings
  and set one before chatting.
- Fixed to fill the side panel viewport (side panel width is narrow, ~360–420px),
  so the fixed `h-[640px]` panel sizing is replaced with a full-height flex layout.

All sub-components (`MessageScroller*`, `Message`, `Bubble`, `Marker`, `Markdown`,
`InterfazeLogo`, `InputGroup*`, `Empty*`) are imported directly from
`@/components/...` via the alias.

### Settings.tsx
- Single text input for the base URL. "Save" writes to `chrome.storage.sync`.
- Default value: `http://localhost:3000`.
- Basic validation: trims trailing slash; must start with `http://` or `https://`.

### storage.ts
- `getBaseUrl(): Promise<string>` — returns stored value or the default.
- `setBaseUrl(url: string): Promise<void>` — normalizes and persists.

### background.ts
- Service worker. On toolbar icon click, opens the side panel for the current
  window via `chrome.sidePanel.open()` (and sets `openPanelOnActionClick` behavior).

## Data flow

1. User opens the side panel (toolbar click).
2. `SidePanel` reads `baseUrl` from storage.
3. User types → `useChat.sendMessage({ text })`.
4. `DefaultChatTransport` POSTs `{ messages }` to `${baseUrl}/api/chat`.
5. Existing RAG pipeline runs server-side; response streams back.
6. Tokens render live via the same bubbles/Markdown/auto-scroll as the app.

## Permissions & CORS

The side panel is a `chrome-extension://` page, so calls to the app are
cross-origin. MV3 extensions bypass CORS for hosts listed in `host_permissions`.
Because the base URL is user-configurable, the manifest declares broad host access:

```json
{
  "manifest_version": 3,
  "name": "Ask Box",
  "version": "0.1.0",
  "permissions": ["storage", "sidePanel"],
  "host_permissions": ["http://*/*", "https://*/*"],
  "side_panel": { "default_path": "index.html" },
  "background": { "service_worker": "background.js", "type": "module" },
  "action": { "default_title": "Ask Box" }
}
```

This means **no changes to the `/api/chat` route** are required. Tradeoff:
broad host permissions. Accepted for this demo (decision confirmed with user).

## Build & load workflow

- `cd extension && npm install`
- `npm run build` → `extension/dist/`
- Chrome → `chrome://extensions` → enable Developer mode → **Load unpacked** →
  select `extension/dist/`.
- `npm run dev` for watch-mode rebuilds during development.
- Run the Next app (`npm run dev` at repo root) so `http://localhost:3000/api/chat`
  is reachable.

The Vite build must emit the MV3 layout Chrome expects: `manifest.json`,
`index.html`, and the background service worker at a stable path (`background.js`).
This is handled either by a manifest-aware plugin (e.g. `@crxjs/vite-plugin`) or
by a small manual copy step in `vite.config.ts`. The plan will choose one; the
manual approach is preferred if it avoids an extra heavy dependency.

## Error handling

- **No base URL set:** empty state directs the user to Settings; send is disabled.
- **Network/stream error:** the existing `error` branch in the chat UI renders
  "Something went wrong: {message}" (already present in `ChatPanel`).
- **Unreachable backend:** surfaced as a fetch error through the same `error` path;
  Settings remains accessible so the user can correct the URL.

## Testing

- **Unit (Vitest):** `storage.ts` — default fallback when unset, normalization
  (trailing slash, scheme validation), round-trip get/set. `chrome.storage` is
  mocked. Uses the repo's existing Vitest setup.
- **Manual checklist:**
  1. Build + load unpacked; toolbar click opens the side panel.
  2. Set base URL to `http://localhost:3000`, save.
  3. Ask a question about an indexed doc → answer streams in with Markdown.
  4. Switch tabs mid-conversation → panel and history persist.
  5. Set a bad URL → error surfaces; correct it → recovers.

## Open questions

None. Decisions confirmed: Side Panel; configurable base URL; Vite + React +
`useChat`; broad host permissions; maximum component reuse via the `@` alias.
