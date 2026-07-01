# Per-Box-Account Isolation — Design

**Date:** 2026-07-02
**Status:** Approved (pending spec review)

## Problem

The deployed app leaks one user's entire Box workspace to every visitor. All state
is stored under single, global keys with no notion of user identity:

- **Box OAuth tokens** — one Redis key `box:tokens`.
- **Webhook id** — `box:webhook`.
- **Indexed file list + statuses** — the `files` set and `file:{id}` keys;
  `getAllFileStatuses()` returns everyone's files.
- **Vector embeddings** — a single global Upstash Vector index; `/api/chat` runs
  `queryTopK` across all documents, so chat answers over everyone's content.
- **OAuth `state`** — generated in `oauth/start` but never validated in the
  callback (a CSRF hole on top of the leak).

Result: the first person to connect Box binds the whole app to their account.
Every subsequent visitor sees that account's files, tree, and chat answers without
connecting anything.

## Goals

- Each visitor sees **only their own** Box account's tokens, files, and vectors.
- Isolation survives loss of the browser session cookie **without re-indexing**.
- Close the OAuth CSRF hole.
- Remove the shared-credential backdoor (`BOX_DEVELOPER_TOKEN`) from production.

## Non-goals

- No login provider / password / email auth (out of scope; anonymous cookie is
  sufficient for a "connect your Box" demo).
- No webhook-driven sync (dropped; polling already covers it).
- Browser extension behavior (explicitly out of scope for this work).

## Key decisions

| Decision | Choice |
|---|---|
| Identity mechanism | Anonymous signed session cookie (`sid`), no login |
| What durable data is keyed on | **Box account id** (`boxUserId` from `/users/me`), not the raw `sid` |
| `BOX_DEVELOPER_TOKEN` fallback | **Removed entirely** (all environments use real OAuth) |
| Webhooks | **Dropped**; rely on existing poll-based sync in `/api/box/tree` |
| Chat without a Box connection | **Not allowed** (401) — there is no shared corpus anymore |

### Why key on `boxUserId` and not `sid`

If durable data were keyed on the raw `sid`, losing the cookie (cleared cookies,
different browser/device, incognito, expiry, eviction) would orphan all indexed
data permanently and force a full re-index.

Keying on `boxUserId` makes the `sid` cookie a disposable **browser handle**:
losing it costs one re-auth click, after which the same `boxUserId` resolves and
all previously-indexed files and vectors are immediately available again. The same
account on multiple devices also gets a consistent view. Different accounts remain
fully isolated.

## Architecture

### 1. Identity resolution

**`middleware.ts`** (new): on every request ensure a signed `sid` cookie exists.
If missing or signature-invalid, mint a new random id and set the cookie.

- Cookie attributes: `httpOnly`, `secure`, `sameSite=lax`, long `maxAge`
  (e.g. 1 year), `path=/`.
- Runs on the edge runtime → use Web Crypto (`crypto.subtle`) HMAC for signing.
- Sets the cookie on both the forwarded request and the response so the current
  request's route handlers already see it.

**`lib/session.ts`** (new):

- `signSid(sid): string` / `verifySid(signed): string | null` — HMAC-SHA256 over
  the raw id using `SESSION_SECRET`. Cookie value = `${sid}.${hmac}`.
- `resolveBoxUserId(req): Promise<string | null>` — read `sid` cookie → verify
  signature → `redis.get(session:{sid})` → `boxUserId` or `null`. Refreshes the
  mapping TTL on each successful resolve (sliding expiry).

Requires new env var `SESSION_SECRET` (add to `.env.example`).

### 2. OAuth flow (also fixes CSRF)

**`oauth/start`**:
1. Read `sid` from the cookie (guaranteed present by middleware).
2. Generate `state = crypto.randomUUID()`.
3. `redis.set(oauthstate:{sid}, state, { ex: 600 })`.
4. Redirect to Box authorize URL with `state`.

**`oauth/callback`**:
1. Read `sid` and `state`; compare `state` to `oauthstate:{sid}`. On mismatch or
   missing → 400, do not proceed. Delete the stored state after use.
2. `exchangeCodeForTokens(code)` → tokens.
3. Build a Box client from the access token, call `/users/me` → `boxUserId`.
4. `setBoxTokens(boxUserId, tokens)`.
5. `redis.set(session:{sid}, boxUserId, { ex: <90d> })` — the browser→account map.
6. Redirect to `/`. **No webhook creation.**

### 3. Data scoping — everything keyed by `boxUserId`

**`lib/redis.ts`**:
- Tokens: `box:tokens:{boxUserId}`.
- File statuses: `files:{boxUserId}` (set) + `file:{boxUserId}:{fileId}`.
- Session map: `session:{sid}` → `boxUserId`; OAuth state: `oauthstate:{sid}`.
- All functions take `boxUserId`:
  `getBoxTokens(id)`, `setBoxTokens(id, t)`, `clearBoxTokens(id)`,
  `setFileStatus(id, s)`, `removeFileStatus(id, fileId)`, `getAllFileStatuses(id)`.
- Remove webhook helpers (`getWebhookId` / `setWebhookId` / `clearWebhookId`).
- The pub/sub `CHANNEL` constant is unused by the SSE route (which polls) — remove
  the now-dead `publish` in `setFileStatus` or scope it; it is not relied upon.

**`lib/vector.ts`**: use Upstash Vector **namespaces** (`index.namespace(boxUserId)`).
- `upsertChunks(boxUserId, fileId, items)`
- `deleteFileChunks(boxUserId, fileId)`
- `queryTopK(boxUserId, vector, k)`

**`lib/box.ts`**: every function that needs a token takes `boxUserId`.
- `getValidAccessToken(boxUserId)` — reads/refreshes `box:tokens:{boxUserId}`.
  **Remove the `BOX_DEVELOPER_TOKEN` branch entirely.**
- `downloadFile(boxUserId, fileId)`, `listFolderFilesRecursive(boxUserId, root)`,
  `getFolderTree(boxUserId, root)`, `uploadFileToBox(boxUserId, ...)`,
  `deleteBoxFile(boxUserId, fileId)`, `createBoxFolder(boxUserId, ...)`.
- Add `getBoxUserId(accessToken)` helper (calls `/users/me`).
- Remove `createWebhook` / `deleteWebhook`.

### 4. Background processing carries identity

The QStash worker runs outside any browser request, so identity must travel in the
(signed) job payload, not a cookie.

- **`lib/queue.ts`**: `enqueueProcess(boxUserId, fileId)` → body `{ boxUserId, fileId }`.
- **`/api/process`**: after `verifyQstash` passes, read `boxUserId` + `fileId` from
  the verified body → `processFile(boxUserId, fileId)`.
- **`lib/process.ts`**: `processFile(boxUserId, fileId, initialName?)` threads
  `boxUserId` into `downloadFile`, `upsertChunks`, and `setFileStatus`.

### 5. Request-facing routes resolve `boxUserId` first

- **`status`**: `connected = !!boxUserId && !!(await getBoxTokens(boxUserId))`.
- **`tree`, `sync`, `folder`, `file/[id]`, `upload`, `disconnect`, `chat`**:
  resolve `boxUserId`; **return 401 if absent**. Pass `boxUserId` to all lib calls.
  `tree`/`sync` enqueue with `enqueueProcess(boxUserId, fileId)`.
- **`chat`**: `queryTopK(boxUserId, ...)` and `getAllFileStatuses(boxUserId)` only.
- **`stream`** (SSE): resolve `boxUserId` at connection start; if absent, send an
  empty snapshot and close. Otherwise poll `getAllFileStatuses(boxUserId)`.
- **`disconnect`**: `clearBoxTokens(boxUserId)` + delete `session:{sid}`. Indexed
  files/vectors persist under `boxUserId` (reconnecting the same account restores
  the view). No webhook teardown.
- **`/api/box/webhook`**: reduce to a 200 no-op.

### 6. Clean up already-leaked data

One-time **`scripts/flush-legacy.ts`**: delete the old global keys (`box:tokens`,
`box:webhook`, `files`, `file:*`) and reset the default (global) vector namespace.

Manual operational steps (outside code):
- **Revoke the leaked Box tokens** (Box console / re-auth) — the exposed
  access/refresh tokens must be invalidated.
- **Unset `BOX_DEVELOPER_TOKEN`** in the deployment.

### 7. Frontend

No structural change expected: same-origin `fetch` and `EventSource` send the
`sid` cookie automatically. Verify during implementation that no client call sets
`credentials: 'omit'`. The "Not connected" empty state already exists and now
correctly applies to every fresh browser.

## Data model summary

| Key / namespace | Scope | Lifetime |
|---|---|---|
| Cookie `sid` (signed) | browser | ~1 year |
| `session:{sid}` → `boxUserId` | browser→account map | ~90d sliding |
| `oauthstate:{sid}` | in-flight OAuth | 600s |
| `box:tokens:{boxUserId}` | account | until disconnect |
| `files:{boxUserId}` + `file:{boxUserId}:{fileId}` | account | until pruned |
| Vector namespace `{boxUserId}` | account | until pruned |

## Testing

- `lib/session.ts`: `signSid`/`verifySid` — valid, tampered, missing, wrong-secret.
- OAuth `state` validation — match succeeds, mismatch/missing rejects.
- Redis helpers embed `boxUserId` in every key; vector helpers use the namespace.
- `enqueueProcess` includes `boxUserId`; `/api/process` reads it from the verified body.
- Update existing `lib/box.test.ts` / `lib/redis.test.ts` for new signatures.
  `lib/sync.ts` selectors are pure and unaffected.
- `.env.example`: add `SESSION_SECRET`.

## Risks / follow-ups

- Anonymous cookie means no cross-device continuity *until* Box is connected; this
  is acceptable and expected for the demo.
- Orphaned data for accounts that disconnect and never return persists under
  `boxUserId`. Acceptable for a demo; a future TTL/GC sweep could reclaim it.
- `SESSION_SECRET` must be set in every environment; middleware should fail closed
  (mint no usable session) if it is absent.
