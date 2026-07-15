# Host permission: `https://box-demo.interfaze.ai/*`

## Paste into dashboard

This is the extension's own backend API — the only host the extension communicates with. It is required for every core function: completing the Box OAuth token exchange, listing the user's Box folder tree and indexing status, and answering the user's chat questions from their Box file content. The extension makes fetch() requests to this origin from its own pages (side panel/popup) and needs the host permission for those cross-origin requests. No other website is accessed, read, or modified; there are no content scripts.

## Where it's used in code

- `extension/src/storage.ts` — `BASE_URL = "https://box-demo.interfaze.ai"`.
- `extension/src/api.ts` — all API calls (`/api/box/tree`, `/api/sync`, `/api/chat` via the chat panel) go through `authedFetch(BASE_URL + path)`.
- `extension/src/auth.ts` — OAuth start/finish calls to the same origin.
- The host permission exempts these extension-page fetches from CORS; the backend sets no cross-origin headers, so nothing else can call it from a browser context.
