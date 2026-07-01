# Per-Box-Account Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate every visitor's Box tokens, indexed files, and vector embeddings so no one can see another user's Box account.

**Architecture:** A signed, `httpOnly` `sid` cookie (minted by Next.js middleware) is a disposable browser handle. After OAuth we resolve the Box account id (`boxUserId`) via `/users/me` and key ALL durable data on it. A `session:{sid} → boxUserId` map ties the browser to its account, so losing the cookie only costs a re-auth click, not re-indexing. Redis keys and the Upstash Vector namespace are per-account; the background QStash worker carries `boxUserId` in its signed payload.

**Tech Stack:** Next.js 15 (App Router, edge middleware), TypeScript, Upstash Redis + Vector + QStash, Box TypeScript SDK, Vitest.

## Global Constraints

- Web Crypto (`crypto.subtle`, `crypto.randomUUID`) for signing — must run in BOTH edge (middleware) and node (routes). No `node:crypto`, no `Buffer` in `lib/session.ts` (edge-incompatible). Encode signatures as hex.
- Cookie flags: `httpOnly: true`, `sameSite: "lax"`, `path: "/"`, `maxAge: 31536000` (1 year), `secure: process.env.NODE_ENV === "production"` (localhost is http — `secure:true` would drop the cookie).
- New env var `SESSION_SECRET` is required; `lib/session.ts` throws if unset.
- `BOX_DEVELOPER_TOKEN` support is REMOVED entirely — every environment uses real OAuth.
- Webhooks are dropped — sync is poll-driven via `/api/box/tree`.
- Test command: `npm test` (vitest). Typecheck: `npx tsc --noEmit`. Build: `npm run build`.
- This codebase unit-tests only pure lib functions; route wiring is verified by typecheck + build (there is no route test harness — do not invent one).
- Commit after each task.

---

## File Structure

- **Create** `lib/session.ts` — sid signing/verification, `getSid`, `resolveBoxUserId`.
- **Create** `middleware.ts` — mint the `sid` cookie on every request.
- **Create** `lib/session.test.ts` — sign/verify unit tests.
- **Create** `scripts/flush-legacy.mjs` — one-time cleanup of leaked global data.
- **Modify** `lib/redis.ts` — per-account keys + `boxUserId`-parameterized helpers; drop webhook helpers + dead pub/sub.
- **Modify** `lib/redis.test.ts` — assert key format.
- **Modify** `lib/vector.ts` — per-account Upstash namespace.
- **Modify** `lib/box.ts` — `boxUserId` params, remove dev-token branch, add `getBoxUserId`, remove webhook + signature code, stop persisting in `exchangeCodeForTokens`.
- **Delete** `lib/box.test.ts` — it only covered `isValidWebhookSignature`, which is being removed.
- **Modify** `lib/queue.ts` — `enqueueProcess(boxUserId, fileId)`.
- **Modify** `lib/process.ts` — `processFile(boxUserId, fileId, initialName?)`.
- **Modify** routes: `oauth/start`, `oauth/callback`, `process`, `status`, `disconnect`, `tree`, `sync`, `folder`, `file/[id]`, `upload`, `chat`, `stream`, `webhook`.
- **Modify** `.env.example` — add `SESSION_SECRET`.

---

## Task 1: Session module (sign / verify)

**Files:**
- Create: `lib/session.ts`
- Test: `lib/session.test.ts`

**Interfaces:**
- Produces:
  - `signSid(sid: string): Promise<string>` — returns `"{sid}.{hexHmac}"`.
  - `verifySid(signed: string | undefined): Promise<string | null>` — returns the raw sid if the signature is valid, else `null`.
  - `getSid(req: NextRequest): Promise<string | null>` — verify the `sid` cookie only.
  - `resolveBoxUserId(req: NextRequest): Promise<string | null>` — sid → `session:{sid}` map (with sliding TTL refresh).
  - `SESSION_TTL_SECONDS: number`.

- [ ] **Step 1: Write the failing test** — `lib/session.test.ts`

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { signSid, verifySid } from "@/lib/session";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret";
});

describe("signSid / verifySid", () => {
  it("round-trips a valid signed sid", async () => {
    const signed = await signSid("abc-123");
    expect(signed.startsWith("abc-123.")).toBe(true);
    expect(await verifySid(signed)).toBe("abc-123");
  });

  it("rejects a tampered payload", async () => {
    const signed = await signSid("abc-123");
    const tampered = "evil-999." + signed.split(".")[1];
    expect(await verifySid(tampered)).toBeNull();
  });

  it("rejects a missing/garbage cookie", async () => {
    expect(await verifySid(undefined)).toBeNull();
    expect(await verifySid("no-dot")).toBeNull();
  });

  it("rejects a signature made with a different secret", async () => {
    const signed = await signSid("abc-123");
    process.env.SESSION_SECRET = "other-secret";
    const result = await verifySid(signed);
    process.env.SESSION_SECRET = "test-secret";
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- session`
Expected: FAIL — cannot find module `@/lib/session`.

- [ ] **Step 3: Write minimal implementation** — `lib/session.ts`

```ts
import type { NextRequest } from "next/server";
import { redis } from "@/lib/redis";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days, sliding

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacHex(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return toHex(sig);
}

// Constant-time-ish compare to avoid leaking signature bytes via timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSid(sid: string): Promise<string> {
  return `${sid}.${await hmacHex(sid)}`;
}

export async function verifySid(
  signed: string | undefined,
): Promise<string | null> {
  if (!signed) return null;
  const dot = signed.lastIndexOf(".");
  if (dot <= 0) return null;
  const sid = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const expected = await hmacHex(sid);
  return safeEqual(sig, expected) ? sid : null;
}

export async function getSid(req: NextRequest): Promise<string | null> {
  return verifySid(req.cookies.get("sid")?.value);
}

export async function resolveBoxUserId(
  req: NextRequest,
): Promise<string | null> {
  const sid = await getSid(req);
  if (!sid) return null;
  const boxUserId = await redis.get<string>(`session:${sid}`);
  if (boxUserId) await redis.expire(`session:${sid}`, SESSION_TTL_SECONDS);
  return boxUserId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- session`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/session.ts lib/session.test.ts
git commit -m "feat: signed session module for per-account identity"
```

---

## Task 2: Middleware mints the sid cookie

**Files:**
- Create: `middleware.ts` (repo root)

**Interfaces:**
- Consumes: `signSid`, `verifySid` from `lib/session.ts`.

> No unit test — middleware wiring is verified by build + manual check. The signing logic it relies on is already tested in Task 1.

- [ ] **Step 1: Write the implementation** — `middleware.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { signSid, verifySid } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const existing = req.cookies.get("sid")?.value;
  if (await verifySid(existing)) return NextResponse.next();

  const signed = await signSid(crypto.randomUUID());
  // Forward the new cookie to THIS request's handlers, and set it on the
  // response so the browser persists it for subsequent requests.
  req.cookies.set("sid", signed);
  const res = NextResponse.next({ request: { headers: req.headers } });
  res.cookies.set("sid", signed, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 31536000,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

// Run on pages + API, skip Next internals and static assets.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
};
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: no errors from `middleware.ts`. (Other files still reference old signatures — that's fixed in later tasks. If pre-existing errors appear elsewhere, note them and proceed; this step only guards `middleware.ts` syntax/types.)

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: middleware issues signed anonymous session cookie"
```

---

## Task 3: Per-account Redis keys

**Files:**
- Modify: `lib/redis.ts`
- Test: `lib/redis.test.ts`

**Interfaces:**
- Produces:
  - `tokensKey(id)`, `filesKey(id)`, `fileKey(id, fileId)` — exported key builders.
  - `getBoxTokens(id)`, `setBoxTokens(id, t)`, `clearBoxTokens(id)`.
  - `setFileStatus(id, s)`, `removeFileStatus(id, fileId)`, `getAllFileStatuses(id)`.
  - `buildStatusEvent(s)` (unchanged), `BoxTokens`, `FileStatus`, `Stage` types.
- Removed: `getWebhookId`/`setWebhookId`/`clearWebhookId`, `CHANNEL`, the `redis.publish` call.

- [ ] **Step 1: Write the failing test** — replace `lib/redis.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildStatusEvent, tokensKey, filesKey, fileKey } from "@/lib/redis";

describe("buildStatusEvent", () => {
  it("serializes a status to a publishable event string", () => {
    const evt = buildStatusEvent({
      fileId: "1", name: "a.pdf", stage: "indexed", chunkCount: 5, updatedAt: 123,
    });
    expect(JSON.parse(evt)).toMatchObject({ fileId: "1", stage: "indexed", chunkCount: 5 });
  });
});

describe("per-account key builders", () => {
  it("namespaces every key by the account id", () => {
    expect(tokensKey("user42")).toBe("box:tokens:user42");
    expect(filesKey("user42")).toBe("files:user42");
    expect(fileKey("user42", "9")).toBe("file:user42:9");
  });

  it("keeps different accounts' file keys disjoint", () => {
    expect(fileKey("a", "1")).not.toBe(fileKey("b", "1"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- redis`
Expected: FAIL — `tokensKey` is not exported.

- [ ] **Step 3: Rewrite `lib/redis.ts`**

```ts
import { Redis } from "@upstash/redis";

export type Stage = "queued" | "extracting" | "embedding" | "indexed" | "error";
export type FileStatus = {
  fileId: string; name: string; stage: Stage;
  chunkCount?: number; error?: string; updatedAt: number;
};

export const redis = Redis.fromEnv();

// All state is keyed by the Box account id so accounts never see each other.
export const tokensKey = (id: string) => `box:tokens:${id}`;
export const filesKey = (id: string) => `files:${id}`;
export const fileKey = (id: string, fileId: string) => `file:${id}:${fileId}`;

export function buildStatusEvent(s: FileStatus): string {
  return JSON.stringify(s);
}

export async function setFileStatus(id: string, s: FileStatus): Promise<void> {
  await redis.set(fileKey(id, s.fileId), s);
  await redis.sadd(filesKey(id), s.fileId);
}

export async function removeFileStatus(id: string, fileId: string): Promise<void> {
  await redis.del(fileKey(id, fileId));
  await redis.srem(filesKey(id), fileId);
}

export async function getAllFileStatuses(id: string): Promise<FileStatus[]> {
  const ids = await redis.smembers(filesKey(id));
  if (ids.length === 0) return [];
  const rows = await Promise.all(ids.map((fid) => redis.get<FileStatus>(fileKey(id, fid))));
  return rows.filter((r): r is FileStatus => !!r).sort((a, b) => b.updatedAt - a.updatedAt);
}

export type BoxTokens = { accessToken: string; refreshToken: string; expiresAt: number };
export const getBoxTokens = (id: string) => redis.get<BoxTokens>(tokensKey(id));
export const setBoxTokens = (id: string, t: BoxTokens) => redis.set(tokensKey(id), t);
export const clearBoxTokens = (id: string) => redis.del(tokensKey(id));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- redis`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/redis.ts lib/redis.test.ts
git commit -m "feat: key Redis state per Box account; drop webhook + pub/sub"
```

---

## Task 4: Per-account vector namespace

**Files:**
- Modify: `lib/vector.ts`

**Interfaces:**
- Produces:
  - `upsertChunks(userId, fileId, items)`
  - `deleteFileChunks(userId, fileId)`
  - `queryTopK(userId, vector, k)`

> No unit test (network-backed; codebase has no vector test). Verified by typecheck + downstream tasks.

- [ ] **Step 1: Rewrite `lib/vector.ts`**

```ts
import { Index } from "@upstash/vector";

export type ChunkMeta = { fileId: string; fileName: string; chunkIdx: number; text: string };

const index = Index.fromEnv();
// One Upstash namespace per Box account isolates every account's vectors.
const ns = (userId: string) => index.namespace(userId);

export async function upsertChunks(
  userId: string,
  fileId: string,
  items: { vector: number[]; meta: ChunkMeta }[],
): Promise<void> {
  // Trailing ":" so file "1" doesn't also match "10", "11", ...
  await ns(userId).delete({ prefix: `${fileId}:` }).catch(() => {});
  if (items.length) {
    await ns(userId).upsert(
      items.map((it) => ({
        id: `${it.meta.fileId}:${it.meta.chunkIdx}`,
        vector: it.vector,
        metadata: it.meta as unknown as Record<string, unknown>,
      })),
    );
  }
}

export async function deleteFileChunks(userId: string, fileId: string): Promise<void> {
  await ns(userId).delete({ prefix: `${fileId}:` }).catch(() => {});
}

export type ScoredChunk = ChunkMeta & { score: number };

export async function queryTopK(
  userId: string,
  vector: number[],
  k: number,
): Promise<ScoredChunk[]> {
  const res = await ns(userId).query({ vector, topK: k, includeMetadata: true });
  return res
    .filter((r) => r.metadata)
    .map((r) => ({ ...(r.metadata as unknown as ChunkMeta), score: r.score }));
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/vector.ts
git commit -m "feat: scope vector store to a per-account namespace"
```

---

## Task 5: Box client keyed by account; remove dev-token & webhooks

**Files:**
- Modify: `lib/box.ts`
- Delete: `lib/box.test.ts`

**Interfaces:**
- Produces (all token-using fns now take `boxUserId` first):
  - `exchangeCodeForTokens(code): Promise<BoxTokens>` — NO LONGER persists.
  - `getBoxUserId(accessToken): Promise<string>` — calls `/users/me`.
  - `getValidAccessToken(boxUserId): Promise<string>`
  - `downloadFile(boxUserId, fileId)`, `listFolderFilesRecursive(boxUserId, root)`, `getFolderTree(boxUserId, root)`, `uploadFileToBox(boxUserId, parentId, name, bytes)`, `deleteBoxFile(boxUserId, fileId)`, `createBoxFolder(boxUserId, parentId, name)`.
  - `getAuthorizeUrl(state)` (unchanged).
- Removed: `createWebhook`, `deleteWebhook`, `isValidWebhookSignature`, `safeEqual`, the `BOX_DEVELOPER_TOKEN` branch.

- [ ] **Step 1: Delete the obsolete test**

```bash
git rm lib/box.test.ts
```

(It only tested `isValidWebhookSignature`, which is removed with the webhook feature.)

- [ ] **Step 2: Edit `lib/box.ts` — imports & remove webhook/sig helpers**

Replace the top imports (lines 1–6) with:

```ts
import { BoxClient, BoxDeveloperTokenAuth } from "box-typescript-sdk-gen";
import { AuthorizationManager } from "box-typescript-sdk-gen/managers";
import { readByteStream } from "box-typescript-sdk-gen/internal";
import { getBoxTokens, setBoxTokens, type BoxTokens } from "@/lib/redis";
import { collectFiles, type BoxFile, type BoxItem } from "@/lib/sync";
```

Delete `getAuthorizeUrl`'s neighbors `safeEqual` (lines 18–22) and `isValidWebhookSignature` (lines 24–36). Keep `getAuthorizeUrl` as-is.

- [ ] **Step 3: Stop persisting in `exchangeCodeForTokens`; add `getBoxUserId`**

Replace the `exchangeCodeForTokens` body's trailing `await setBoxTokens(tokens); return tokens;` so it just returns:

```ts
export async function exchangeCodeForTokens(code: string): Promise<BoxTokens> {
  const token = await authorizationManager.requestAccessToken({
    grantType: "authorization_code",
    clientId: process.env.BOX_CLIENT_ID!,
    clientSecret: process.env.BOX_CLIENT_SECRET!,
    code,
  });
  return {
    accessToken: token.accessToken!,
    refreshToken: token.refreshToken!,
    expiresAt: Date.now() + (token.expiresIn ?? 0) * 1000,
  };
}

/** Resolve the Box account id for an access token — the identity we key on. */
export async function getBoxUserId(accessToken: string): Promise<string> {
  const client = clientFromAccessToken(accessToken);
  const me = await client.users.getUserMe();
  if (!me.id) throw new Error("Box /users/me returned no id");
  return me.id;
}
```

- [ ] **Step 4: Rewrite `getValidAccessToken` — take `boxUserId`, drop dev token**

```ts
export async function getValidAccessToken(boxUserId: string): Promise<string> {
  const tokens = await getBoxTokens(boxUserId);
  if (!tokens) {
    throw new Error("No Box tokens found. Complete the OAuth flow first.");
  }
  if (Date.now() <= tokens.expiresAt - 60_000) {
    return tokens.accessToken;
  }
  const refreshed = await authorizationManager.refreshAccessToken({
    grantType: "refresh_token",
    clientId: process.env.BOX_CLIENT_ID!,
    clientSecret: process.env.BOX_CLIENT_SECRET!,
    refreshToken: tokens.refreshToken,
  });
  const newTokens: BoxTokens = {
    accessToken: refreshed.accessToken!,
    refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
    expiresAt: Date.now() + (refreshed.expiresIn ?? 0) * 1000,
  };
  await setBoxTokens(boxUserId, newTokens);
  return newTokens.accessToken;
}
```

- [ ] **Step 5: Thread `boxUserId` into every file operation**

For each function below, add `boxUserId: string` as the FIRST parameter and change its internal `getValidAccessToken()` call to `getValidAccessToken(boxUserId)`. Signatures become:

```ts
export async function downloadFile(boxUserId: string, fileId: string): Promise<{ name: string; buffer: Buffer }>
export async function listFolderFilesRecursive(boxUserId: string, rootFolderId: string): Promise<BoxFile[]>
export async function getFolderTree(boxUserId: string, rootFolderId: string): Promise<TreeNode[]>
export async function uploadFileToBox(boxUserId: string, parentId: string, name: string, bytes: ArrayBuffer): Promise<{ id: string; name: string }>
export async function deleteBoxFile(boxUserId: string, fileId: string): Promise<void>
export async function createBoxFolder(boxUserId: string, parentId: string, name: string): Promise<{ id: string; name: string }>
```

(The bodies are unchanged except the single `getValidAccessToken` / `getValidAccessToken(boxUserId)` line — the `const accessToken = await getValidAccessToken();` / `const token = await getValidAccessToken();` calls each gain the `boxUserId` argument.)

- [ ] **Step 6: Delete `createWebhook` and `deleteWebhook`**

Remove both functions (lines ~279–299 in the original) entirely.

- [ ] **Step 7: Verify remaining tests + typecheck**

Run: `npm test`
Expected: PASS (session + redis + chunk + sync + jigsawstack + prompt). No `box.test.ts` anymore.

Run: `npx tsc --noEmit`
Expected: errors ONLY in the not-yet-updated callers (`lib/process.ts`, `lib/queue.ts`, and the route files) — those are fixed in Tasks 6–8. `lib/box.ts` itself must be error-free.

- [ ] **Step 8: Commit**

```bash
git add lib/box.ts
git commit -m "feat: key Box client on account id; remove dev-token & webhooks"
```

---

## Task 6: Thread account id through the processing pipeline

**Files:**
- Modify: `lib/queue.ts`
- Modify: `lib/process.ts`
- Modify: `app/api/process/route.ts`

**Interfaces:**
- Consumes: `downloadFile(boxUserId, ...)`, `upsertChunks(userId, fileId, items)`, `setFileStatus(id, s)` from Tasks 3–5.
- Produces:
  - `enqueueProcess(boxUserId: string, fileId: string): Promise<void>`
  - `processFile(boxUserId: string, fileId: string, initialName?: string): Promise<number>`

- [ ] **Step 1: `lib/queue.ts` — carry `boxUserId` in the payload**

Replace `enqueueProcess`:

```ts
export async function enqueueProcess(boxUserId: string, fileId: string): Promise<void> {
  await client.publishJSON({
    url: `${process.env.APP_URL}/api/process`,
    body: { boxUserId, fileId },
  });
}
```

(Leave `verifyQstash` unchanged.)

- [ ] **Step 2: `lib/process.ts` — take `boxUserId`**

Change the signature and the three scoped calls:

```ts
export async function processFile(
  boxUserId: string,
  fileId: string,
  initialName?: string,
): Promise<number> {
  let name = initialName ?? fileId;
  try {
    await setFileStatus(boxUserId, { fileId, name, stage: "extracting", updatedAt: Date.now() });
    const file = await downloadFile(boxUserId, fileId);
    // ... unchanged extract/chunk/embed ...
    await upsertChunks(boxUserId, fileId, items);
    await setFileStatus(boxUserId, {
      fileId, name, stage: "indexed", chunkCount: items.length, updatedAt: Date.now(),
    });
    return items.length;
  } catch (err) {
    await setFileStatus(boxUserId, {
      fileId, name, stage: "error",
      error: err instanceof Error ? err.message : "unknown error",
      updatedAt: Date.now(),
    });
    throw err;
  }
}
```

(The `embedding`-stage `setFileStatus` call in the middle also gains `boxUserId` as its first argument. Everything else in the body is unchanged.)

- [ ] **Step 3: `app/api/process/route.ts` — read `boxUserId` from the verified body**

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyQstash } from "@/lib/queue";
import { processFile } from "@/lib/process";

export async function POST(req: NextRequest) {
  const body = await req.text();
  if (!(await verifyQstash(req.headers.get("upstash-signature"), body))) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }
  let boxUserId: string;
  let fileId: string;
  try {
    const parsed = JSON.parse(body) as { boxUserId?: string; fileId?: string };
    if (!parsed.boxUserId || !parsed.fileId) throw new Error("missing fields");
    boxUserId = parsed.boxUserId;
    fileId = parsed.fileId;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    const chunks = await processFile(boxUserId, fileId);
    return NextResponse.json({ ok: true, chunks });
  } catch {
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: `lib/queue.ts`, `lib/process.ts`, `app/api/process/route.ts` error-free. Remaining errors only in route files fixed in Tasks 7–8.

- [ ] **Step 5: Commit**

```bash
git add lib/queue.ts lib/process.ts app/api/process/route.ts
git commit -m "feat: carry Box account id through the QStash processing pipeline"
```

---

## Task 7: OAuth flow — bind state to session, resolve account

**Files:**
- Modify: `app/api/box/oauth/start/route.ts`
- Modify: `app/api/box/oauth/callback/route.ts`

**Interfaces:**
- Consumes: `getSid`, `SESSION_TTL_SECONDS` (Task 1); `exchangeCodeForTokens`, `getBoxUserId`, `getAuthorizeUrl` (Task 5); `setBoxTokens` (Task 3); `redis` (Task 3).

- [ ] **Step 1: Rewrite `oauth/start`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthorizeUrl } from "@/lib/box";
import { getSid } from "@/lib/session";
import { redis } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const sid = await getSid(req);
  if (!sid) return NextResponse.json({ error: "no session" }, { status: 400 });
  const state = crypto.randomUUID();
  // Bind the OAuth state to this browser session (CSRF protection).
  await redis.set(`oauthstate:${sid}`, state, { ex: 600 });
  return NextResponse.redirect(getAuthorizeUrl(state));
}
```

- [ ] **Step 2: Rewrite `oauth/callback`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getBoxUserId } from "@/lib/box";
import { setBoxTokens } from "@/lib/redis";
import { getSid, SESSION_TTL_SECONDS } from "@/lib/session";
import { redis } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const sid = await getSid(req);
  if (!sid) return NextResponse.json({ error: "no session" }, { status: 400 });

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });

  // Validate the state we bound to this session in oauth/start.
  const expected = await redis.get<string>(`oauthstate:${sid}`);
  if (!state || !expected || state !== expected) {
    return NextResponse.json({ error: "invalid state" }, { status: 400 });
  }
  await redis.del(`oauthstate:${sid}`);

  const tokens = await exchangeCodeForTokens(code);
  const boxUserId = await getBoxUserId(tokens.accessToken);
  await setBoxTokens(boxUserId, tokens);
  // Map this browser to its Box account. Losing the cookie only forces a
  // re-auth click — the same boxUserId (and all its data) is restored.
  await redis.set(`session:${sid}`, boxUserId, { ex: SESSION_TTL_SECONDS });

  return NextResponse.redirect(new URL("/", process.env.APP_URL!));
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: both oauth routes error-free.

- [ ] **Step 4: Commit**

```bash
git add app/api/box/oauth/start/route.ts app/api/box/oauth/callback/route.ts
git commit -m "feat: bind OAuth state to session, key tokens on Box account"
```

---

## Task 8: Request routes resolve the account (401 if absent)

**Files:**
- Modify: `app/api/box/status/route.ts`
- Modify: `app/api/box/disconnect/route.ts`
- Modify: `app/api/box/tree/route.ts`
- Modify: `app/api/sync/route.ts`
- Modify: `app/api/box/folder/route.ts`
- Modify: `app/api/box/file/[id]/route.ts`
- Modify: `app/api/box/upload/route.ts`
- Modify: `app/api/chat/route.ts`
- Modify: `app/api/stream/route.ts`
- Modify: `app/api/box/webhook/route.ts`

**Interfaces:**
- Consumes: `resolveBoxUserId`, `getSid` (Task 1); the `boxUserId`-first lib fns from Tasks 3–6.

- [ ] **Step 1: `status` — connected only if this account has tokens**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getBoxTokens } from "@/lib/redis";
import { resolveBoxUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const boxUserId = await resolveBoxUserId(req);
  const connected = !!boxUserId && !!(await getBoxTokens(boxUserId));
  return NextResponse.json({ connected });
}
```

- [ ] **Step 2: `disconnect` — clear this account's tokens + forget the session**

```ts
import { NextRequest, NextResponse } from "next/server";
import { clearBoxTokens, redis } from "@/lib/redis";
import { resolveBoxUserId, getSid } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const boxUserId = await resolveBoxUserId(req);
  const sid = await getSid(req);
  if (boxUserId) await clearBoxTokens(boxUserId);
  if (sid) await redis.del(`session:${sid}`);
  return NextResponse.json({ connected: false });
}
```

(Indexed files/vectors persist under `boxUserId`; reconnecting the same account restores the view. No webhook teardown.)

- [ ] **Step 3: `tree` — 401 if not connected; scope every call**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getFolderTree, type TreeNode } from "@/lib/box";
import { getAllFileStatuses, setFileStatus, removeFileStatus } from "@/lib/redis";
import { deleteFileChunks } from "@/lib/vector";
import { enqueueProcess } from "@/lib/queue";
import { resolveBoxUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

function collectFiles(
  nodes: TreeNode[],
  acc: { id: string; name: string }[] = [],
): { id: string; name: string }[] {
  for (const n of nodes) {
    if (n.type === "file") acc.push({ id: n.id, name: n.name });
    else collectFiles(n.children, acc);
  }
  return acc;
}

export async function GET(req: NextRequest) {
  const boxUserId = await resolveBoxUserId(req);
  if (!boxUserId) return NextResponse.json({ error: "not connected" }, { status: 401 });

  let tree: TreeNode[];
  try {
    tree = await getFolderTree(boxUserId, "0");
  } catch (err) {
    console.error("[tree] failed to list Box folder", err);
    return NextResponse.json(
      { error: "Failed to list Box folder. Check your Box connection." },
      { status: 502 },
    );
  }

  const files = collectFiles(tree);
  const present = new Set(files.map((f) => f.id));
  const statuses = await getAllFileStatuses(boxUserId);
  const known = new Map(statuses.map((s) => [s.fileId, s]));

  const ghosts = statuses.filter((s) => !present.has(s.fileId));
  await Promise.all(
    ghosts.map(async (g) => {
      await deleteFileChunks(boxUserId, g.fileId);
      await removeFileStatus(boxUserId, g.fileId);
    }),
  );

  const fresh = files.filter((f) => !known.has(f.id));
  await Promise.all(
    fresh.map(async (f) => {
      await setFileStatus(boxUserId, {
        fileId: f.id, name: f.name, stage: "queued", updatedAt: Date.now(),
      });
      await enqueueProcess(boxUserId, f.id);
    }),
  );

  const merged = await getAllFileStatuses(boxUserId);
  return NextResponse.json({ tree, statuses: merged });
}
```

- [ ] **Step 4: `sync` — 401 if not connected; scope every call**

```ts
import { NextRequest, NextResponse } from "next/server";
import { listFolderFilesRecursive } from "@/lib/box";
import { selectFilesToSync, selectFilesToRemove } from "@/lib/sync";
import { processFile } from "@/lib/process";
import { setFileStatus, getAllFileStatuses, removeFileStatus } from "@/lib/redis";
import { deleteFileChunks } from "@/lib/vector";
import { resolveBoxUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

export async function POST(req: NextRequest) {
  const boxUserId = await resolveBoxUserId(req);
  if (!boxUserId) return NextResponse.json({ error: "not connected" }, { status: 401 });

  let files;
  try {
    files = await listFolderFilesRecursive(boxUserId, "0");
  } catch (err) {
    console.error("[sync] failed to list Box files", err);
    return NextResponse.json(
      { error: "Failed to list Box files. Check your Box token/connection." },
      { status: 502 },
    );
  }

  const statuses = await getAllFileStatuses(boxUserId);

  const toRemove = selectFilesToRemove(files, statuses);
  await Promise.all(
    toRemove.map(async (id) => {
      await deleteFileChunks(boxUserId, id);
      await removeFileStatus(boxUserId, id);
    }),
  );

  const toSync = selectFilesToSync(files, statuses);
  await Promise.all(
    toSync.map((f) =>
      setFileStatus(boxUserId, { fileId: f.id, name: f.name, stage: "queued", updatedAt: Date.now() }),
    ),
  );

  let indexed = 0;
  for (const f of toSync) {
    try {
      await processFile(boxUserId, f.id, f.name);
      indexed++;
    } catch (err) {
      console.error(`[sync] failed to process ${f.id}`, err);
    }
  }

  return NextResponse.json({
    total: files.length,
    indexed,
    skipped: files.length - toSync.length,
    failed: toSync.length - indexed,
    removed: toRemove.length,
  });
}
```

- [ ] **Step 5: `folder` — resolve + scope**

Add the import `import { resolveBoxUserId } from "@/lib/session";`, then at the top of `POST(req)`:

```ts
  const boxUserId = await resolveBoxUserId(req);
  if (!boxUserId) return NextResponse.json({ error: "not connected" }, { status: 401 });
```

and change the create call to `const folder = await createBoxFolder(boxUserId, parentId, name);`.

- [ ] **Step 6: `file/[id]` — resolve + scope**

```ts
import { NextRequest, NextResponse } from "next/server";
import { deleteBoxFile } from "@/lib/box";
import { removeFileStatus } from "@/lib/redis";
import { deleteFileChunks } from "@/lib/vector";
import { resolveBoxUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const boxUserId = await resolveBoxUserId(req);
  if (!boxUserId) return NextResponse.json({ error: "not connected" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "missing file id" }, { status: 400 });

  try {
    await deleteBoxFile(boxUserId, id);
    await deleteFileChunks(boxUserId, id);
    await removeFileStatus(boxUserId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[file] delete failed for ${id}`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "delete failed" },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 7: `upload` — resolve + scope**

Add `import { resolveBoxUserId } from "@/lib/session";`. At the top of `POST(req)`:

```ts
  const boxUserId = await resolveBoxUserId(req);
  if (!boxUserId) return NextResponse.json({ error: "not connected" }, { status: 401 });
```

Change the loop body calls to:

```ts
      const created = await uploadFileToBox(boxUserId, parentId, file.name, bytes);
      uploaded.push(created);
      await setFileStatus(boxUserId, {
        fileId: created.id, name: created.name, stage: "queued", updatedAt: Date.now(),
      });
      await enqueueProcess(boxUserId, created.id);
```

- [ ] **Step 8: `chat` — require connection; query this account's namespace**

Change the handler signature to `POST(req: Request)` → `POST(req: NextRequest)` and add resolution at the top; scope `queryTopK` and `getAllFileStatuses`:

```ts
import { NextRequest } from "next/server";
import { resolveBoxUserId } from "@/lib/session";
// ... existing imports ...

export async function POST(req: NextRequest) {
  const boxUserId = await resolveBoxUserId(req);
  if (!boxUserId) {
    return new Response(JSON.stringify({ error: "not connected" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  const { messages }: { messages: UIMessage[] } = await req.json();
  // ... unchanged question extraction ...
  if (question) {
    const qVec = await embed(question);
    const scored = await queryTopK(boxUserId, qVec, 8);
    const relevant = scored.filter((c) => c.score >= MIN_SCORE);
    ({ context, sources } = buildContext(relevant));
  }

  const statuses = await getAllFileStatuses(boxUserId);
  // ... unchanged manifest + streamText ...
}
```

- [ ] **Step 9: `stream` — resolve; empty snapshot + close if not connected**

Change `GET()` to `GET(req: NextRequest)` and resolve before opening the stream:

```ts
import { getAllFileStatuses, type FileStatus } from "@/lib/redis";
import { resolveBoxUserId } from "@/lib/session";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
const POLL_INTERVAL_MS = 1500;
// ... statusKey unchanged ...

export async function GET(req: NextRequest) {
  const boxUserId = await resolveBoxUserId(req);
  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      if (!boxUserId) {
        send({ type: "snapshot", files: [] });
        controller.close();
        return;
      }

      const lastSeen = new Map<string, string>();
      const recordSeen = (files: FileStatus[]) => {
        for (const file of files) lastSeen.set(file.fileId, statusKey(file));
      };

      try {
        const snapshot = await getAllFileStatuses(boxUserId);
        recordSeen(snapshot);
        send({ type: "snapshot", files: snapshot });
      } catch (err) {
        controller.error(err);
        return;
      }

      intervalId = setInterval(async () => {
        try {
          const files = await getAllFileStatuses(boxUserId);
          for (const file of files) {
            const key = statusKey(file);
            if (lastSeen.get(file.fileId) !== key) {
              lastSeen.set(file.fileId, key);
              send({ type: "update", file });
            }
          }
        } catch { /* transient — skip tick */ }
      }, POLL_INTERVAL_MS);
    },
    cancel() {
      if (intervalId !== undefined) clearInterval(intervalId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 10: `webhook` — reduce to a no-op**

Replace the whole file:

```ts
import { NextResponse } from "next/server";

// Webhooks are not used in the per-account model (an incoming webhook can't be
// attributed to a session/account). Sync is poll-driven via /api/box/tree.
// Kept as a 200 no-op so Box doesn't see delivery failures.
export async function POST() {
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 11: Full typecheck + tests + build**

Run: `npx tsc --noEmit`
Expected: NO errors anywhere.

Run: `npm test`
Expected: PASS (session, redis, chunk, sync, jigsawstack, prompt).

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 12: Commit**

```bash
git add app/api
git commit -m "feat: resolve Box account per request; 401 when not connected"
```

---

## Task 9: Legacy cleanup script + env

**Files:**
- Create: `scripts/flush-legacy.mjs`
- Modify: `.env.example`

**Interfaces:** none (operational script).

- [ ] **Step 1: Add `SESSION_SECRET` to `.env.example`**

Append:

```
# Secret used to sign the anonymous session cookie (any long random string).
SESSION_SECRET=
```

- [ ] **Step 2: Write `scripts/flush-legacy.mjs`**

```js
// One-time cleanup of the pre-isolation GLOBAL data that leaked across users.
// Run ONCE during migration, before new per-account data exists:
//   node scripts/flush-legacy.mjs
// Requires the same env as the app (UPSTASH_* / vector env).
import { Redis } from "@upstash/redis";
import { Index } from "@upstash/vector";

const redis = Redis.fromEnv();
const index = Index.fromEnv();

async function main() {
  // Legacy global Redis keys.
  await redis.del("box:tokens", "box:webhook", "files");

  // Legacy per-file status keys: `file:<id>` (new format is `file:<user>:<id>`).
  let cursor = "0";
  let removed = 0;
  do {
    const [next, keys] = await redis.scan(cursor, { match: "file:*", count: 200 });
    cursor = next;
    if (keys.length) {
      await redis.del(...keys);
      removed += keys.length;
    }
  } while (cursor !== "0");

  // Legacy global vector data lives in the default namespace.
  await index.reset();

  console.log(`Flushed legacy globals. Removed ${removed} file:* keys + default vector namespace.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Verify the script parses**

Run: `node --check scripts/flush-legacy.mjs`
Expected: no output (syntax OK). Do NOT run it against prod until the new code is deployed.

- [ ] **Step 4: Commit**

```bash
git add scripts/flush-legacy.mjs .env.example
git commit -m "chore: legacy-data flush script + SESSION_SECRET env"
```

---

## Task 10: Final verification & frontend cookie check

**Files:** none (verification only).

- [ ] **Step 1: Confirm the frontend sends cookies**

Run: `grep -rn "credentials" components app` 
Expected: no `credentials: "omit"` on any `fetch`/`EventSource`. Same-origin requests send the `sid` cookie by default. If any `credentials: "omit"` exists on a call to `/api/*`, change it to `"same-origin"`.

- [ ] **Step 2: Full gate**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all pass.

- [ ] **Step 3: Manual isolation smoke test (documented for the operator)**

1. Set `SESSION_SECRET` locally, run `npm run dev`.
2. Browser A: connect Box, confirm tree + chat work.
3. Browser B (or incognito): open the app → status shows **Not connected**, tree 401/empty, chat returns 401. ✅ isolation.
4. Browser A: clear the `sid` cookie, reload → Not connected → click Connect → same account's files/chat return **without re-indexing**. ✅ durability.

- [ ] **Step 4: Commit (if any grep fix was needed)**

```bash
git add -A
git commit -m "fix: ensure same-origin fetches include the session cookie"
```

---

## Self-Review Notes

- **Spec coverage:** identity resolution (T1/T2); OAuth state + `/users/me` keying (T7); per-account Redis (T3); vector namespace (T4); dev-token & webhook removal (T5, T8 step 10); pipeline identity (T6); all request routes incl. chat-401 & stream (T8); legacy flush + `SESSION_SECRET` (T9); frontend cookie check (T10). All spec sections mapped.
- **Types:** `boxUserId: string` is the first param on every Box/vector/process/enqueue fn; Redis key builders return the exact strings asserted in tests; `processFile(boxUserId, fileId, initialName?)` matches its callers in `sync` and `process`.
