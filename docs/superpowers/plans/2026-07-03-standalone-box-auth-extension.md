# Standalone Box-authenticated Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Ask Box browser extension authenticate to Box on its own (its own OAuth login + session token) and chat / view indexed files against the deployed backend, without ever holding the Box client secret.

**Architecture:** The extension runs Box OAuth via `chrome.identity.launchWebAuthFlow`; the secret-bearing code→token exchange happens on the deployed backend, which returns an HMAC-signed `sid`. The extension stores that `sid` and sends it as an `x-askbox-sid` header on every request. The backend's `getSid` accepts that header as a fallback to the existing cookie, so all existing endpoints work unchanged.

**Tech Stack:** Next.js (App Router) API routes, Upstash Redis, `box-typescript-sdk-gen`, Vitest, Vite + React 19 (extension), `@ai-sdk/react`.

## Global Constraints

- Session token is the existing HMAC-signed `sid` (`signSid`/`verifySid` in `lib/session.ts`), verified with `SESSION_SECRET`.
- Extension→backend auth header name is exactly `x-askbox-sid`.
- Extension OAuth redirect URI is exactly `chrome.identity.getRedirectURL()` → `https://<ext-id>.chromiumapp.org/`; the backend allowlists host suffix `.chromiumapp.org`.
- All backend changes must be backwards-compatible: the web app keeps using the cookie, no behavior change for existing callers.
- Box remains a confidential client: `BOX_CLIENT_SECRET` stays server-side only. No PKCE.
- Tests run with `npx vitest run <file>` from the repo root. Extension typecheck/build run with `npm --prefix extension run typecheck` / `... run build`.
- Redis session key format: `session:<sid>` → Box user id, TTL `SESSION_TTL_SECONDS`. OAuth state key for the extension: `extoauthstate:<state>`, TTL 600s.

---

## File Structure

**Backend (deployed app):**
- `lib/session.ts` — modify `getSid` to also read `x-askbox-sid` header.
- `lib/box.ts` — add `getExtensionAuthorizeUrl(state, redirectUri)` and `isValidExtensionRedirectUri(uri)`.
- `app/api/box/oauth/ext-start/route.ts` — new GET: build authorize URL, bind state.
- `app/api/box/oauth/ext-finish/route.ts` — new POST: exchange code, create session, return `sid`.
- `app/api/box/files/route.ts` — new GET: return indexed file list as JSON.
- `components/ChatPanel.tsx` — add optional `headers` prop.

**Extension (`extension/`):**
- `public/manifest.json` — add `identity` permission, `key`, default base URL note.
- `src/storage.ts` — add `sid` helpers (`chrome.storage.local`).
- `src/api.ts` — new: authed fetch wrapper + `getFiles`.
- `src/auth.ts` — new: `connectBox` / `disconnect`.
- `src/SidePanel.tsx` — auth gate + Connect / Chat / Files / Settings.
- `src/Files.tsx` — new: indexed-file list view.
- `src/Settings.tsx` — add Disconnect button.

---

## Task 1: Backend — `getSid` accepts `x-askbox-sid` header

**Files:**
- Modify: `lib/session.ts` (function `getSid`, lines 58-60)
- Test: `lib/session.test.ts`

**Interfaces:**
- Consumes: `verifySid(signed?: string): Promise<string | null>` (existing).
- Produces: `getSid(req)` returns the verified sid from the `x-askbox-sid` header if present and valid, otherwise from the `sid` cookie.

- [ ] **Step 1: Write the failing test**

Add to `lib/session.test.ts`:

```ts
import { signSid, verifySid, getSid } from "@/lib/session";

// Minimal stand-in for the parts of NextRequest that getSid touches.
function fakeReq(opts: { header?: string; cookie?: string }) {
  return {
    headers: { get: (k: string) => (k === "x-askbox-sid" ? opts.header ?? null : null) },
    cookies: { get: (k: string) => (k === "sid" && opts.cookie ? { value: opts.cookie } : undefined) },
  } as unknown as import("next/server").NextRequest;
}

describe("getSid", () => {
  it("reads a valid x-askbox-sid header", async () => {
    const signed = await signSid("hdr-user");
    expect(await getSid(fakeReq({ header: signed }))).toBe("hdr-user");
  });

  it("falls back to the sid cookie when no header", async () => {
    const signed = await signSid("cookie-user");
    expect(await getSid(fakeReq({ cookie: signed }))).toBe("cookie-user");
  });

  it("ignores a tampered header and falls back to the cookie", async () => {
    const good = await signSid("cookie-user");
    expect(await getSid(fakeReq({ header: "evil.deadbeef", cookie: good }))).toBe("cookie-user");
  });

  it("returns null when neither is present", async () => {
    expect(await getSid(fakeReq({}))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/session.test.ts`
Expected: FAIL — the header cases return null because `getSid` only reads the cookie.

- [ ] **Step 3: Implement**

In `lib/session.ts` replace the `getSid` function:

```ts
export async function getSid(req: NextRequest): Promise<string | null> {
  const header = req.headers.get("x-askbox-sid");
  if (header) {
    const fromHeader = await verifySid(header);
    if (fromHeader) return fromHeader;
  }
  return verifySid(req.cookies.get("sid")?.value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/session.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/session.ts lib/session.test.ts
git commit -m "feat: accept x-askbox-sid header in getSid"
```

---

## Task 2: Backend — extension authorize URL builder + redirect allowlist

**Files:**
- Modify: `lib/box.ts` (add functions near `getAuthorizeUrl`, ~line 7)
- Test: `lib/box-authorize.test.ts` (create)

**Interfaces:**
- Consumes: `process.env.BOX_CLIENT_ID`.
- Produces:
  - `isValidExtensionRedirectUri(uri: string): boolean` — true only for `https://<something>.chromiumapp.org/` URLs.
  - `getExtensionAuthorizeUrl(state: string, redirectUri: string): string` — Box authorize URL using the given redirect URI.

- [ ] **Step 1: Write the failing test**

Create `lib/box-authorize.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { isValidExtensionRedirectUri, getExtensionAuthorizeUrl } from "@/lib/box";

beforeAll(() => {
  process.env.BOX_CLIENT_ID = "test-client";
});

describe("isValidExtensionRedirectUri", () => {
  it("accepts a chromiumapp.org https URL", () => {
    expect(isValidExtensionRedirectUri("https://abcdefghijklmnop.chromiumapp.org/")).toBe(true);
  });
  it("rejects other hosts", () => {
    expect(isValidExtensionRedirectUri("https://evil.com/")).toBe(false);
  });
  it("rejects http scheme", () => {
    expect(isValidExtensionRedirectUri("http://abc.chromiumapp.org/")).toBe(false);
  });
  it("rejects a lookalike host", () => {
    expect(isValidExtensionRedirectUri("https://chromiumapp.org.evil.com/")).toBe(false);
  });
  it("rejects garbage", () => {
    expect(isValidExtensionRedirectUri("not-a-url")).toBe(false);
  });
});

describe("getExtensionAuthorizeUrl", () => {
  it("includes client_id, redirect_uri, state, response_type", () => {
    const url = new URL(getExtensionAuthorizeUrl("st8", "https://abc.chromiumapp.org/"));
    expect(url.origin + url.pathname).toBe("https://account.box.com/api/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-client");
    expect(url.searchParams.get("redirect_uri")).toBe("https://abc.chromiumapp.org/");
    expect(url.searchParams.get("state")).toBe("st8");
    expect(url.searchParams.get("response_type")).toBe("code");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/box-authorize.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement**

In `lib/box.ts`, add after `getAuthorizeUrl` (after line ~16):

```ts
/** Chrome extension OAuth redirect URIs are always https://<id>.chromiumapp.org/. */
export function isValidExtensionRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    return u.protocol === "https:" && u.hostname.endsWith(".chromiumapp.org");
  } catch {
    return false;
  }
}

/** Authorize URL for the extension flow — same as getAuthorizeUrl but with a
 *  caller-supplied redirect URI (the extension's chromiumapp.org callback). */
export function getExtensionAuthorizeUrl(state: string, redirectUri: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.BOX_CLIENT_ID!,
    redirect_uri: redirectUri,
    state,
  });
  return `https://account.box.com/api/oauth2/authorize?${p}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/box-authorize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/box.ts lib/box-authorize.test.ts
git commit -m "feat: extension authorize URL builder + redirect allowlist"
```

---

## Task 3: Backend — `GET /api/box/oauth/ext-start`

**Files:**
- Create: `app/api/box/oauth/ext-start/route.ts`

**Interfaces:**
- Consumes: `isValidExtensionRedirectUri`, `getExtensionAuthorizeUrl` (Task 2); `redis` from `@/lib/redis`.
- Produces: `GET` returning `{ url }` (200) or `{ error }` (400). Side effect: `extoauthstate:<state>` set with TTL 600.

- [ ] **Step 1: Implement the route**

Create `app/api/box/oauth/ext-start/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getExtensionAuthorizeUrl, isValidExtensionRedirectUri } from "@/lib/box";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const redirectUri = req.nextUrl.searchParams.get("redirect_uri");
  const state = req.nextUrl.searchParams.get("state");
  if (!redirectUri || !isValidExtensionRedirectUri(redirectUri)) {
    return NextResponse.json({ error: "invalid redirect_uri" }, { status: 400 });
  }
  if (!state) {
    return NextResponse.json({ error: "missing state" }, { status: 400 });
  }
  // Bind the state so ext-finish can verify this flow originated here (CSRF).
  await redis.set(`extoauthstate:${state}`, "1", { ex: 600 });
  return NextResponse.json({ url: getExtensionAuthorizeUrl(state, redirectUri) });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke (dev server running)**

Run:
```bash
curl -s "http://localhost:3000/api/box/oauth/ext-start?redirect_uri=https://abc.chromiumapp.org/&state=xyz"
```
Expected: JSON `{"url":"https://account.box.com/api/oauth2/authorize?...redirect_uri=https%3A%2F%2Fabc.chromiumapp.org%2F...state=xyz..."}`.
Then: `curl -s "http://localhost:3000/api/box/oauth/ext-start?redirect_uri=https://evil.com/&state=xyz"` → `{"error":"invalid redirect_uri"}` with 400.

- [ ] **Step 4: Commit**

```bash
git add app/api/box/oauth/ext-start/route.ts
git commit -m "feat: ext-start OAuth endpoint for extension"
```

---

## Task 4: Backend — `POST /api/box/oauth/ext-finish`

**Files:**
- Create: `app/api/box/oauth/ext-finish/route.ts`

**Interfaces:**
- Consumes: `exchangeCodeForTokens`, `getBoxUserId` from `@/lib/box`; `setBoxTokens` from `@/lib/redis`; `signSid`, `SESSION_TTL_SECONDS` from `@/lib/session`; `redis`.
- Produces: `POST` accepting `{ code, state }`, returning `{ sid }` (200) or `{ error }` (400). Side effects: consumes `extoauthstate:<state>`, stores Box tokens, sets `session:<sid>` → boxUserId.

- [ ] **Step 1: Implement the route**

Create `app/api/box/oauth/ext-finish/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getBoxUserId } from "@/lib/box";
import { setBoxTokens, redis } from "@/lib/redis";
import { signSid, SESSION_TTL_SECONDS } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { code, state } = (await req.json()) as { code?: string; state?: string };
  if (!code || !state) {
    return NextResponse.json({ error: "missing code or state" }, { status: 400 });
  }

  // Verify + consume the state bound in ext-start.
  const bound = await redis.get<string>(`extoauthstate:${state}`);
  if (!bound) {
    return NextResponse.json({ error: "invalid state" }, { status: 400 });
  }
  await redis.del(`extoauthstate:${state}`);

  const tokens = await exchangeCodeForTokens(code);
  const boxUserId = await getBoxUserId(tokens.accessToken);
  await setBoxTokens(boxUserId, tokens);

  // Mint a standalone session for the extension (no cookie involved).
  const sid = await signSid(crypto.randomUUID());
  const bareSid = sid.slice(0, sid.lastIndexOf("."));
  await redis.set(`session:${bareSid}`, boxUserId, { ex: SESSION_TTL_SECONDS });

  return NextResponse.json({ sid });
}
```

Note: `session:<sid>` stores the **bare** sid (unsigned), matching `resolveBoxUserId`, which looks up `session:${sid}` where `sid` is the verified bare value returned by `verifySid`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify the sid round-trips through resolveBoxUserId (reasoning check)**

Confirm by reading `lib/session.ts`: `verifySid("<bare>.<sig>")` returns `<bare>`; `resolveBoxUserId` then reads `session:<bare>`. `ext-finish` writes `session:<bare>` and returns the signed `<bare>.<sig>`. The extension sends the signed value in `x-askbox-sid`; `getSid` verifies → `<bare>`; lookup hits. ✓

- [ ] **Step 4: Commit**

```bash
git add app/api/box/oauth/ext-finish/route.ts
git commit -m "feat: ext-finish OAuth endpoint mints extension session"
```

---

## Task 5: Backend — `GET /api/box/files`

**Files:**
- Create: `app/api/box/files/route.ts`

**Interfaces:**
- Consumes: `resolveBoxUserId` from `@/lib/session`; `getAllFileStatuses` from `@/lib/redis` returning `FileStatus[]` where `FileStatus = { fileId, name, stage, chunkCount?, error?, updatedAt }`.
- Produces: `GET` returning `{ files: Array<{ name: string; stage: Stage; updatedAt: number }> }` (200), or 401 `{ error: "not connected" }`.

- [ ] **Step 1: Implement the route**

Create `app/api/box/files/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAllFileStatuses } from "@/lib/redis";
import { resolveBoxUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const boxUserId = await resolveBoxUserId(req);
  if (!boxUserId) {
    return NextResponse.json({ error: "not connected" }, { status: 401 });
  }
  const statuses = await getAllFileStatuses(boxUserId);
  const files = statuses.map((s) => ({ name: s.name, stage: s.stage, updatedAt: s.updatedAt }));
  return NextResponse.json({ files });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke (with a valid extension sid from ext-finish, dev server running)**

Run:
```bash
curl -s http://localhost:3000/api/box/files -H "x-askbox-sid: <PASTE_SID>"
```
Expected: `{"files":[...]}` for a connected sid; `{"error":"not connected"}` (401) without the header.

- [ ] **Step 4: Commit**

```bash
git add app/api/box/files/route.ts
git commit -m "feat: box/files JSON endpoint for extension file list"
```

---

## Task 6: Backend — `ChatPanel` accepts `headers`

**Files:**
- Modify: `components/ChatPanel.tsx` (props + `DefaultChatTransport`, lines ~50-55)

**Interfaces:**
- Consumes: `DefaultChatTransport` from `ai` (supports `{ api, headers }`).
- Produces: `ChatPanel({ api?, className?, headers? })` where `headers?: Record<string, string>` is forwarded to the transport.

- [ ] **Step 1: Modify the component signature and transport**

In `components/ChatPanel.tsx`, replace the component header:

```tsx
export default function ChatPanel({
  api = "/api/chat",
  className,
  headers,
}: { api?: string; className?: string; headers?: Record<string, string> } = {}) {
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api, headers }),
  });
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (web callers pass no `headers`, which is fine).

- [ ] **Step 3: Commit**

```bash
git add components/ChatPanel.tsx
git commit -m "feat: ChatPanel forwards custom headers to transport"
```

---

## Task 7: Extension — manifest identity permission + pinned key

**Files:**
- Modify: `extension/public/manifest.json`

**Interfaces:**
- Produces: manifest with `identity` permission and a fixed `key` → deterministic extension ID and stable `https://<ext-id>.chromiumapp.org/` redirect URI.

- [ ] **Step 1: Generate a keypair and compute the extension ID**

Run (from repo root):

```bash
mkdir -p extension/.keys
openssl genrsa 2048 2>/dev/null | openssl pkcs8 -topk8 -nocrypt -out extension/.keys/ext-key.pem
# The value for manifest "key" (base64 DER of the public key):
openssl rsa -in extension/.keys/ext-key.pem -pubout -outform DER 2>/dev/null | openssl base64 -A; echo
# The resulting extension ID:
openssl rsa -in extension/.keys/ext-key.pem -pubout -outform DER 2>/dev/null | shasum -a 256 | head -c 32 | tr 0-9a-f a-p; echo
```

Record both outputs. Add `extension/.keys/` to `.gitignore` (private key must not be committed):

```bash
echo "extension/.keys/" >> .gitignore
```

- [ ] **Step 2: Add `key` + `identity` to the manifest**

Edit `extension/public/manifest.json`: add `"identity"` to `permissions`, and add a top-level `"key"` with the base64 value from Step 1:

```json
{
  "manifest_version": 3,
  "name": "Ask Box",
  "version": "0.1.0",
  "description": "Chat with your Box knowledge base from any tab.",
  "key": "<BASE64_PUBLIC_KEY_FROM_STEP_1>",
  "permissions": ["storage", "identity"],
  "host_permissions": ["http://*/*", "https://*/*"],
  "action": {
    "default_title": "Ask Box",
    "default_popup": "index.html",
    "default_icon": { "16": "icon16.png", "32": "icon32.png", "48": "icon48.png", "128": "icon128.png" }
  },
  "icons": { "16": "icon16.png", "32": "icon32.png", "48": "icon48.png", "128": "icon128.png" }
}
```

- [ ] **Step 3: Build and confirm the ID in Arc**

Run: `npm --prefix extension run build`
Then reload the unpacked `extension/dist` in `arc://extensions` and confirm the extension ID matches Step 1's computed ID.

- [ ] **Step 4: Register the redirect URI in Box**

In the Box developer console, add `https://<ext-id>.chromiumapp.org/` to the OAuth app's redirect URIs. (External setup — confirm done before Task 10 testing.)

- [ ] **Step 5: Commit**

```bash
git add extension/public/manifest.json .gitignore
git commit -m "feat: pin extension ID and add identity permission"
```

---

## Task 8: Extension — `sid` storage helpers

**Files:**
- Modify: `extension/src/storage.ts`
- Test: `extension/src/storage.test.ts`

**Interfaces:**
- Consumes: `chrome.storage.local`.
- Produces:
  - `getStoredSid(): Promise<string | null>`
  - `setStoredSid(sid: string): Promise<void>`
  - `clearStoredSid(): Promise<void>`

- [ ] **Step 1: Write the failing test**

Add to `extension/src/storage.test.ts` — first extend the chrome mock to include `local`, then add tests:

Replace `mockChromeStorage` with:

```ts
function mockChromeStorage() {
  const make = () => {
    let store: Record<string, unknown> = {};
    return {
      get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
      set: vi.fn(async (items: Record<string, unknown>) => { store = { ...store, ...items }; }),
      remove: vi.fn(async (key: string) => { const { [key]: _, ...rest } = store; store = rest; }),
    };
  };
  return { sync: make(), local: make() };
}
```

Add tests:

```ts
import { getStoredSid, setStoredSid, clearStoredSid } from "./storage";

describe("sid storage", () => {
  it("returns null when no sid stored", async () => {
    expect(await getStoredSid()).toBeNull();
  });
  it("round-trips a sid", async () => {
    await setStoredSid("bare.sig");
    expect(await getStoredSid()).toBe("bare.sig");
  });
  it("clears a sid", async () => {
    await setStoredSid("bare.sig");
    await clearStoredSid();
    expect(await getStoredSid()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run extension/src/storage.test.ts`
Expected: FAIL — sid helpers not exported.

- [ ] **Step 3: Implement**

Append to `extension/src/storage.ts`:

```ts
const SID_KEY = "askbox_sid";

export async function getStoredSid(): Promise<string | null> {
  const result = await chrome.storage.local.get(SID_KEY);
  return (result[SID_KEY] as string) || null;
}

export async function setStoredSid(sid: string): Promise<void> {
  await chrome.storage.local.set({ [SID_KEY]: sid });
}

export async function clearStoredSid(): Promise<void> {
  await chrome.storage.local.remove(SID_KEY);
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run extension/src/storage.test.ts`
Expected: PASS.
Run: `npm --prefix extension run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add extension/src/storage.ts extension/src/storage.test.ts
git commit -m "feat: extension sid storage helpers"
```

---

## Task 9: Extension — authed API wrapper + `getFiles`

**Files:**
- Create: `extension/src/api.ts`

**Interfaces:**
- Consumes: `getBaseUrl`, `getStoredSid`, `clearStoredSid` from `./storage`.
- Produces:
  - `class UnauthorizedError extends Error` — thrown on 401.
  - `authedFetch(path: string, init?: RequestInit): Promise<Response>` — prepends base URL, adds `x-askbox-sid`; throws `UnauthorizedError` on 401 (after clearing the stored sid).
  - `getFiles(): Promise<Array<{ name: string; stage: string; updatedAt: number }>>`.

- [ ] **Step 1: Implement**

Create `extension/src/api.ts`:

```ts
import { getBaseUrl, getStoredSid, clearStoredSid } from "./storage";

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = await getBaseUrl();
  const sid = await getStoredSid();
  const headers = new Headers(init.headers);
  if (sid) headers.set("x-askbox-sid", sid);
  const res = await fetch(`${base}${path}`, { ...init, headers });
  if (res.status === 401) {
    await clearStoredSid();
    throw new UnauthorizedError();
  }
  return res;
}

export async function getFiles(): Promise<Array<{ name: string; stage: string; updatedAt: number }>> {
  const res = await authedFetch("/api/box/files");
  if (!res.ok) throw new Error(`files request failed: ${res.status}`);
  const data = (await res.json()) as { files: Array<{ name: string; stage: string; updatedAt: number }> };
  return data.files;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm --prefix extension run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add extension/src/api.ts
git commit -m "feat: extension authed fetch wrapper + getFiles"
```

---

## Task 10: Extension — Box connect / disconnect

**Files:**
- Create: `extension/src/auth.ts`

**Interfaces:**
- Consumes: `chrome.identity`, `getBaseUrl`, `setStoredSid`, `clearStoredSid` from `./storage`, `authedFetch` from `./api`.
- Produces:
  - `connectBox(): Promise<void>` — runs the full OAuth flow and stores the `sid`. Throws `Error("Connection cancelled")` if the user closes the window.
  - `disconnect(): Promise<void>` — POSTs `/api/box/disconnect` (best-effort) then clears the stored sid.

- [ ] **Step 1: Implement**

Create `extension/src/auth.ts`:

```ts
import { getBaseUrl, setStoredSid, clearStoredSid } from "./storage";
import { authedFetch } from "./api";

/** Runs Box OAuth in a chrome.identity window and stores the resulting sid. */
export async function connectBox(): Promise<void> {
  const base = await getBaseUrl();
  const redirectUri = chrome.identity.getRedirectURL(); // https://<id>.chromiumapp.org/
  const state = crypto.randomUUID();

  // 1. Ask the backend for the Box authorize URL (binds state server-side).
  const startRes = await fetch(
    `${base}/api/box/oauth/ext-start?redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`,
  );
  if (!startRes.ok) throw new Error("Could not start Box login");
  const { url } = (await startRes.json()) as { url: string };

  // 2. Open the Box login window; Chrome resolves with the final redirect URL.
  const redirect = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (responseUrl) => {
      if (chrome.runtime.lastError || !responseUrl) {
        reject(new Error("Connection cancelled"));
        return;
      }
      resolve(responseUrl);
    });
  });

  // 3. Extract code + state; verify state matches locally (CSRF).
  const returned = new URL(redirect);
  const code = returned.searchParams.get("code");
  const returnedState = returned.searchParams.get("state");
  if (!code || returnedState !== state) throw new Error("Box login failed");

  // 4. Exchange the code on the backend and store the returned sid.
  const finishRes = await fetch(`${base}/api/box/oauth/ext-finish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, state }),
  });
  if (!finishRes.ok) throw new Error("Box login failed");
  const { sid } = (await finishRes.json()) as { sid: string };
  await setStoredSid(sid);
}

export async function disconnect(): Promise<void> {
  try {
    await authedFetch("/api/box/disconnect", { method: "POST" });
  } catch {
    // Even if the server call fails, drop the local session.
  }
  await clearStoredSid();
}
```

- [ ] **Step 2: Typecheck**

Run: `npm --prefix extension run typecheck`
Expected: no errors (`@types/chrome` provides `chrome.identity`).

- [ ] **Step 3: Commit**

```bash
git add extension/src/auth.ts
git commit -m "feat: extension Box connect/disconnect flow"
```

---

## Task 11: Extension — Files view

**Files:**
- Create: `extension/src/Files.tsx`

**Interfaces:**
- Consumes: `getFiles`, `UnauthorizedError` from `./api`.
- Produces: `Files({ onUnauthorized })` — a component listing indexed files; calls `onUnauthorized()` if a request 401s.

- [ ] **Step 1: Implement**

Create `extension/src/Files.tsx`:

```tsx
import { useEffect, useState } from "react";
import { getFiles, UnauthorizedError } from "./api";

type FileRow = { name: string; stage: string; updatedAt: number };

export default function Files({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFiles()
      .then(setFiles)
      .catch((e) => {
        if (e instanceof UnauthorizedError) onUnauthorized();
        else setError((e as Error).message);
      });
  }, [onUnauthorized]);

  if (error) return <p className="p-4 text-xs text-destructive">{error}</p>;
  if (files === null) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (files.length === 0)
    return <p className="p-4 text-sm text-muted-foreground">No files indexed yet.</p>;

  const indexed = files.filter((f) => f.stage === "indexed");
  return (
    <div className="flex-1 overflow-y-auto p-2">
      <p className="px-2 py-1 text-xs text-muted-foreground">
        {indexed.length} of {files.length} indexed
      </p>
      <ul className="flex flex-col">
        {files.map((f) => (
          <li
            key={f.name}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-200 hover:bg-white/5"
          >
            <span className="truncate">{f.name}</span>
            <span className="shrink-0 text-[11px] text-zinc-500">{f.stage}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm --prefix extension run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add extension/src/Files.tsx
git commit -m "feat: extension indexed-files view"
```

---

## Task 12: Extension — Settings disconnect + SidePanel auth gate & tabs

**Files:**
- Modify: `extension/src/Settings.tsx`
- Modify: `extension/src/SidePanel.tsx`

**Interfaces:**
- Consumes: `getStoredSid` from `./storage`; `connectBox`, `disconnect` from `./auth`; `Files` from `./Files`; existing `ChatPanel`, `Settings`.
- Produces: SidePanel renders a Connect screen when there is no sid, else Chat/Files/Settings tabs; Settings gains a Disconnect button.

- [ ] **Step 1: Add Disconnect to Settings**

In `extension/src/Settings.tsx`, change the props and add a Disconnect button. Replace the component signature line:

```tsx
export default function Settings({
  onSaved,
  onDisconnect,
}: {
  onSaved: (url: string) => void;
  onDisconnect: () => void;
}) {
```

Then add, immediately before the closing `</div>` of the returned markup (after the Save button):

```tsx
      <button
        type="button"
        onClick={onDisconnect}
        className="mt-2 rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
      >
        Disconnect Box
      </button>
```

- [ ] **Step 2: Rewrite SidePanel with auth gate + tabs**

Replace the entire contents of `extension/src/SidePanel.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { FolderIcon, MessageSquareIcon, SettingsIcon } from "lucide-react";
import ChatPanel from "@/components/ChatPanel";
import { getBaseUrl, getStoredSid } from "./storage";
import { connectBox, disconnect } from "./auth";
import Settings from "./Settings";
import Files from "./Files";

type Tab = "chat" | "files" | "settings";

export default function SidePanel() {
  const [ready, setReady] = useState(false);
  const [sid, setSid] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [tab, setTab] = useState<Tab>("chat");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBaseUrl(await getBaseUrl());
    setSid(await getStoredSid());
    setReady(true);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      await connectBox();
      await refresh();
      setTab("chat");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    await disconnect();
    setSid(null);
  }

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!sid) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-[15px] font-medium tracking-tight text-zinc-100">Ask Box</h1>
        <p className="text-sm text-muted-foreground">
          Connect your Box account to chat with your knowledge base.
        </p>
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {connecting ? "Connecting…" : "Connect Box"}
        </button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-1 border-b border-white/8 px-2 py-1.5">
        <h1 className="mr-auto px-2 text-[15px] font-medium tracking-tight text-zinc-100">Ask Box</h1>
        <TabButton active={tab === "chat"} onClick={() => setTab("chat")} icon={<MessageSquareIcon className="size-3.5" />} label="Chat" />
        <TabButton active={tab === "files"} onClick={() => setTab("files")} icon={<FolderIcon className="size-3.5" />} label="Files" />
        <TabButton active={tab === "settings"} onClick={() => setTab("settings")} icon={<SettingsIcon className="size-3.5" />} label="Settings" />
      </header>

      {tab === "settings" ? (
        <Settings
          onSaved={(url) => {
            setBaseUrl(url);
            setTab("chat");
          }}
          onDisconnect={handleDisconnect}
        />
      ) : tab === "files" ? (
        <Files onUnauthorized={() => setSid(null)} />
      ) : (
        <div className="min-h-0 flex-1">
          <ChatPanel
            key={`${baseUrl}:${sid}`}
            api={`${baseUrl}/api/chat`}
            headers={{ "x-askbox-sid": sid }}
            className="flex h-full flex-col overflow-hidden"
          />
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-white/10 text-zinc-100" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npm --prefix extension run typecheck`
Expected: no errors.
Run: `npm --prefix extension run build`
Expected: build succeeds, `dist/` produced.

- [ ] **Step 4: Commit**

```bash
git add extension/src/Settings.tsx extension/src/SidePanel.tsx
git commit -m "feat: extension auth gate + Chat/Files/Settings tabs"
```

---

## Task 13: Set default backend URL + full manual E2E

**Files:**
- Modify: `extension/src/storage.ts` (`DEFAULT_BASE_URL`)

**Interfaces:**
- Produces: `DEFAULT_BASE_URL` pointing at the deployed backend.

- [ ] **Step 1: Set the deployed default**

In `extension/src/storage.ts`, set `DEFAULT_BASE_URL` to the production domain the user provides (fall back to `http://localhost:3000` only for local dev). Example:

```ts
export const DEFAULT_BASE_URL = "https://<your-deployed-domain>";
```

Confirm the exact domain with the user before committing.

- [ ] **Step 2: Build + reload**

Run: `npm --prefix extension run build`
Reload `extension/dist` in `arc://extensions`.

- [ ] **Step 3: Manual E2E in Arc**

Verify, against the deployed backend (with the redirect URI registered in Box — Task 7 Step 4):
1. Click the icon → popup shows **Connect Box**.
2. Click **Connect Box** → Box login window opens → after login, popup returns and shows the **Chat** tab.
3. **Chat**: ask a question → streamed answer scoped to your Box files.
4. **Files**: shows your indexed files with stages.
5. **Settings**: change backend URL persists; **Disconnect Box** returns to the Connect screen.
6. Reopen popup → still connected (sid persisted in `chrome.storage.local`).

- [ ] **Step 4: Commit**

```bash
git add extension/src/storage.ts
git commit -m "feat: default extension to deployed backend"
```

---

## Self-Review notes (author)

- **Spec coverage:** header auth (T1), authorize builder + allowlist (T2), ext-start (T3), ext-finish (T4), files endpoint (T5), ChatPanel headers (T6), manifest identity+key (T7), sid storage (T8), api wrapper (T9), connect/disconnect (T10), Files view (T11), auth gate + tabs + disconnect (T12), default URL + E2E (T13). All spec sections mapped.
- **Type consistency:** `x-askbox-sid` header, `session:<bare-sid>` key, `{ url }` / `{ sid }` / `{ files }` payloads, `getStoredSid/setStoredSid/clearStoredSid`, `authedFetch`, `UnauthorizedError`, `connectBox/disconnect`, `getFiles` used consistently across tasks.
- **Known external dependency:** Box redirect URI registration (T7 S4) must be done before T10/T13 testing.
