# Standalone Box-authenticated Chrome extension — Design

**Date:** 2026-07-03
**Status:** Approved (pending spec review)

## Summary

Turn the Ask Box browser extension into a standalone app that authenticates to
Box on its own — its own OAuth login and its own session token — while relying
on the deployed web app's endpoints for all secret-bearing work (token
exchange, retrieval, refresh). The extension never holds the Box client secret.

Scope: **Connect Box → Chat → view indexed Files → Disconnect.** File
indexing, browsing, sync, and upload remain in the web app.

## Background / current state

- **Auth model:** `middleware.ts` drops an anonymous, HMAC-signed `sid` cookie
  (`HttpOnly`, `SameSite=Lax`, `Secure` in prod). Box OAuth
  (`/api/box/oauth/*`) maps `session:<sid>` → Box user id in Redis.
  `resolveBoxUserId(req)` reads the `sid` cookie, looks up the Box user, and is
  used by `/api/chat`, `/api/box/status`, `/api/box/disconnect`, `/api/stream`.
- **Why the extension can't reuse the cookie:** the popup runs at
  `chrome-extension://<id>` — a different site. `SameSite=Lax` means the browser
  won't attach the `sid` cookie to the extension's cross-site requests, and
  `HttpOnly` means page JS can't read it to forward it. So the extension needs
  its own explicit session token sent as a header.
- **Box OAuth constraint:** the authorization-code→token exchange requires the
  Box **client secret**, which must never ship in an extension. Therefore the
  exchange happens on the backend; the extension only initiates the flow and
  stores the resulting session token.
- **Extension distribution:** private/unpacked (not in the Web Store). A
  manifest `"key"` pins the extension ID deterministically, giving a stable
  `https://<ext-id>.chromiumapp.org/` redirect URI without publishing.

## Auth architecture

The extension gets its own Box login and its own signed `sid`, obtained via a
backend-mediated OAuth exchange, then sends that `sid` as an `x-askbox-sid`
header on every request.

### Connect flow

```
Extension                          Deployed backend                 Box
   │ redirectUri = chrome.identity.getRedirectURL()
   │              = https://<ext-id>.chromiumapp.org/
   │ state = crypto.randomUUID()
   │ GET /api/box/oauth/ext-start?redirect_uri=…&state=…  ─────►
   │                                   validate redirect_uri allowlist
   │                                   store extoauthstate:<state> (ex 600)
   │ ◄── { url: <Box authorize URL, with redirect_uri + state> }
   │ chrome.identity.launchWebAuthFlow({ url, interactive:true }) ──►  login
   │ ◄──────────  redirect …chromiumapp.org/?code=…&state=…  ────────
   │ verify returned state === state (local CSRF check)
   │ POST /api/box/oauth/ext-finish { code, state }  ───────►
   │                                   verify + consume extoauthstate:<state>
   │                                   exchangeCodeForTokens(code)  [client_secret]
   │                                   getBoxUserId(access)
   │                                   setBoxTokens(boxUserId, tokens)
   │                                   sid = signSid(uuid)
   │                                   session:<sid> → boxUserId (ex TTL)
   │ ◄── { sid }
   │ store sid in chrome.storage.local
```

### Authenticated calls

Every extension→backend request carries `x-askbox-sid: <sid>`. The backend's
`getSid()` verifies the header's HMAC as a **fallback to the cookie**, so the
web app is unchanged and every endpoint using `resolveBoxUserId`/`getSid`
accepts the extension automatically. Box access-token refresh continues to
happen server-side via `getValidAccessToken`.

### CSRF / integrity notes

- `state` is bound server-side (`extoauthstate:<state>`) and consumed once in
  `ext-finish`, and also verified locally by the extension.
- `ext-start` allowlists `redirect_uri` to `https://*.chromiumapp.org/` so the
  authorize-URL builder can't be abused as an open redirect.
- The `sid` is a bearer credential (same power as the cookie). Stored in
  `chrome.storage.local`, HMAC-signed, server-validated, and revocable via
  Disconnect (which deletes `session:<sid>`).

## Backend changes (deployed app)

1. **`lib/session.ts`** — `getSid(req)` also reads and verifies the
   `x-askbox-sid` header, falling back to the `sid` cookie. Backwards
   compatible; web unchanged.
2. **`lib/box.ts`** — add an authorize-URL builder that accepts the extension's
   `redirect_uri` (the existing web builder uses the fixed `BOX_REDIRECT_URI`
   env). Box's token exchange does not require `redirect_uri`, so
   `exchangeCodeForTokens` is reused as-is.
3. **New `GET /api/box/oauth/ext-start`** — query `redirect_uri`, `state`;
   validate `redirect_uri` host is `*.chromiumapp.org`; store
   `extoauthstate:<state>` (ex 600); return `{ url }` (Box authorize URL).
4. **New `POST /api/box/oauth/ext-finish`** — body `{ code, state }`; require
   and consume `extoauthstate:<state>`; `exchangeCodeForTokens`; `getBoxUserId`;
   `setBoxTokens`; create `sid = signSid(uuid)`; set `session:<sid>` → boxUserId
   (ex `SESSION_TTL_SECONDS`); return `{ sid }`.
5. **New `GET /api/box/files`** — `resolveBoxUserId`; return
   `{ files: getAllFileStatuses(boxUserId) }` (or a trimmed shape:
   `name`, `stage`). A plain-JSON endpoint is required because `/api/stream`
   is SSE and `EventSource` cannot send the `x-askbox-sid` header.
6. **`components/ChatPanel.tsx`** — add optional
   `headers?: Record<string,string>` prop, forwarded to
   `DefaultChatTransport({ api, headers })`. No change for web callers.

## Extension changes

1. **`public/manifest.json`** — add `"identity"` permission; add a `"key"`
   (base64 public key) to pin the extension ID; default the base URL to the
   deployed domain. (`storage` and host permissions already present.)
2. **`src/storage.ts`** — add `sid` token storage in `chrome.storage.local`
   (`getSid`/`setSid`/`clearSid`) alongside the existing base-URL helpers.
3. **New `src/auth.ts`** — `connectBox()` (runs the connect flow above) and
   `disconnect()` (POST `/api/box/disconnect` with header, then clear sid).
4. **New `src/api.ts`** — fetch wrapper that attaches `x-askbox-sid` and the
   base URL; `getFiles()`; a shared `on401` that clears the sid.
5. **`src/SidePanel.tsx`** — auth gate:
   - No sid → **Connect Box** screen (single button → `connectBox()`).
   - Connected → three tabs:
     - **Chat** — `ChatPanel` with `api={base}/api/chat` and
       `headers={{ "x-askbox-sid": sid }}`.
     - **Files** — read-only indexed-file list via `getFiles()`.
     - **Settings** — backend URL editor + **Disconnect**.
   - Any `401` clears the sid and returns to the Connect screen.

## Error handling

- User cancels OAuth (`launchWebAuthFlow` rejects) → "Connection cancelled."
- `state` mismatch (local or server) → abort, show error, no sid stored.
- `ext-finish` non-200 → surface error, do not store sid.
- `401` on chat/files/disconnect → clear sid, show Connect screen.
- Restricted pages / network errors → surfaced inline in the popup.

## Testing

- **Unit:**
  - `getSid` returns the verified user for a valid `x-askbox-sid` header and
    falls back to the cookie; rejects a tampered header.
  - `ext-start` rejects a `redirect_uri` that is not `*.chromiumapp.org`.
  - Extension `storage.ts` sid round-trip (set/get/clear).
- **Manual:** full Connect → Chat → Files → Disconnect in Arc against the
  deployed backend.

## Setup step (external, on the user)

After the manifest `"key"` is generated and the extension ID is known, register
`https://<ext-id>.chromiumapp.org/` as a redirect URI on the existing Box OAuth
app (reusing the current client ID/secret).

## Out of scope (YAGNI)

- File browsing / sync / upload / indexing from the extension.
- PKCE (Box is a confidential client; the secret stays server-side and `state`
  provides CSRF protection).
- Publishing to the Chrome Web Store.
