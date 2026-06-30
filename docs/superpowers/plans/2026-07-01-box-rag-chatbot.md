# Box RAG Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js app where a user connects Box via OAuth, watches uploaded files get indexed in real time through an Interfaze → JigsawStack → Upstash Vector pipeline, and chats with a RAG bot grounded in those files.

**Architecture:** A FILE.UPLOADED Box webhook enqueues jobs to Upstash QStash; a processing route extracts (Interfaze), embeds (JigsawStack v2, 4096-dim), and upserts (Upstash Vector), writing per-file status to Upstash Redis. The browser receives live status via SSE backed by Redis pub/sub. A chat route does retrieval and streams answers from Interfaze.

**Tech Stack:** Next.js (App Router) + TypeScript, Tailwind + shadcn/ui, Box TypeScript SDK, Interfaze (OpenAI-compatible), JigsawStack SDK, Upstash Vector / QStash / Redis, Vercel AI SDK, Vitest.

## Global Constraints

- Runtime: Next.js App Router, TypeScript, Node.js server routes (not Edge — Box SDK + crypto needed).
- Upstash Vector index MUST be created at **dimension = 4096** (JigsawStack embedding v2).
- Vector ids MUST be deterministic: `{fileId}:{chunkIdx}` (idempotent re-processing).
- All transient state lives in **Upstash Redis** (no relational DB). Single connected Box account.
- Both `/api/box/webhook` and `/api/process` MUST verify request signatures before acting.
- Webhook handler MUST respond 200 within Box's timeout — enqueue then return, never process inline.
- Test runner: **Vitest**. Pure-logic modules are TDD; external-client wrappers get mocked unit tests.
- Commit after every task.

---

### Task 1: Project scaffold & configuration

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example`, `.gitignore`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx` (placeholder)

**Interfaces:**
- Produces: a runnable Next.js app, `npm test` wired to Vitest, env contract in `.env.example`.

- [ ] **Step 1: Initialize git and Next.js project files**

```bash
git init
```

Create `package.json`:

```json
{
  "name": "box-rag-demo",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "box-typescript-sdk-gen": "^3.3.0",
    "jigsawstack": "^0.0.40",
    "@upstash/vector": "^1.2.0",
    "@upstash/redis": "^1.34.0",
    "@upstash/qstash": "^2.7.0",
    "openai": "^4.77.0",
    "ai": "^4.0.0",
    "@ai-sdk/openai": "^1.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "vitest": "^2.1.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

- [ ] **Step 2: Add config files**

`tsconfig.json` (standard Next.js strict config with `"paths": { "@/*": ["./*"] }`), `next.config.ts` (empty config object), Tailwind (`tailwind.config.ts` scanning `./app/**/*.{ts,tsx}` and `./components/**/*.{ts,tsx}`, `postcss.config.js`), and `app/globals.css` with the three `@tailwind` directives.

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

- [ ] **Step 3: Create `.env.example`**

```bash
APP_URL=https://your-tunnel-or-vercel-url
BOX_CLIENT_ID=
BOX_CLIENT_SECRET=
BOX_REDIRECT_URI=${APP_URL}/api/box/oauth/callback
BOX_WEBHOOK_PRIMARY_KEY=
BOX_WEBHOOK_SECONDARY_KEY=
INTERFAZE_API_KEY=
INTERFAZE_BASE_URL=https://api.interfaze.ai/v1
JIGSAWSTACK_API_KEY=
UPSTASH_VECTOR_REST_URL=
UPSTASH_VECTOR_REST_TOKEN=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
```

Add `.gitignore` (`node_modules`, `.next`, `.env*` except `.env.example`). Create minimal `app/layout.tsx`, `app/globals.css`, and a placeholder `app/page.tsx` returning `<main>Box RAG Demo</main>`.

- [ ] **Step 4: Install and verify build**

Run: `npm install && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js + Tailwind + Vitest project"
```

---

### Task 2: Text chunking (`lib/chunk.ts`)

**Files:**
- Create: `lib/chunk.ts`, `lib/chunk.test.ts`

**Interfaces:**
- Produces: `chunkText(text: string, opts?: { size?: number; overlap?: number }): string[]`
  — splits on whitespace into ~`size` word windows (default 800) with `overlap` words
  (default 100). Returns `[]` for empty/whitespace-only input. A single sub-`size` input
  returns one chunk.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/chunk";

describe("chunkText", () => {
  it("returns [] for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n ")).toEqual([]);
  });

  it("returns one chunk when under size", () => {
    expect(chunkText("hello world foo")).toEqual(["hello world foo"]);
  });

  it("splits into overlapping windows", () => {
    const words = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
    const chunks = chunkText(words, { size: 10, overlap: 2 });
    expect(chunks.length).toBe(4); // windows starting at 0,8,16,24
    expect(chunks[0].split(" ").length).toBe(10);
    expect(chunks[1].startsWith("w8")).toBe(true); // overlap of 2
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/chunk.test.ts`
Expected: FAIL ("chunkText is not a function" / module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
export function chunkText(
  text: string,
  opts: { size?: number; overlap?: number } = {},
): string[] {
  const size = opts.size ?? 800;
  const overlap = opts.overlap ?? 100;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const step = Math.max(1, size - overlap);
  const chunks: string[] = [];
  for (let start = 0; start < words.length; start += step) {
    chunks.push(words.slice(start, start + size).join(" "));
    if (start + size >= words.length) break;
  }
  return chunks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/chunk.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/chunk.ts lib/chunk.test.ts && git commit -m "feat: add text chunking util"
```

---

### Task 3: Redis status store & pub/sub (`lib/redis.ts`)

**Files:**
- Create: `lib/redis.ts`, `lib/redis.test.ts`

**Interfaces:**
- Consumes: `@upstash/redis`.
- Produces:
  - `type FileStatus = { fileId: string; name: string; stage: "queued" | "extracting" | "embedding" | "indexed" | "error"; chunkCount?: number; error?: string; updatedAt: number }`
  - `setFileStatus(s: FileStatus): Promise<void>` — writes `file:{id}` hash, adds id to `files` set, publishes JSON to `file-updates`.
  - `getAllFileStatuses(): Promise<FileStatus[]>`
  - `getBoxTokens()/setBoxTokens(t)` and `getWebhookId()/setWebhookId(id)` thin helpers.
  - `redis` — shared `Redis` client. `nowMs(): number` — injectable clock (default `Date.now`).

- [ ] **Step 1: Write the failing test (status payload builder is pure & testable)**

```ts
import { describe, it, expect } from "vitest";
import { buildStatusEvent } from "@/lib/redis";

describe("buildStatusEvent", () => {
  it("serializes a status to a publishable event string", () => {
    const evt = buildStatusEvent({
      fileId: "1", name: "a.pdf", stage: "indexed", chunkCount: 5, updatedAt: 123,
    });
    expect(JSON.parse(evt)).toMatchObject({ fileId: "1", stage: "indexed", chunkCount: 5 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/redis.test.ts`
Expected: FAIL (module/function not found).

- [ ] **Step 3: Write implementation**

```ts
import { Redis } from "@upstash/redis";

export type Stage = "queued" | "extracting" | "embedding" | "indexed" | "error";
export type FileStatus = {
  fileId: string; name: string; stage: Stage;
  chunkCount?: number; error?: string; updatedAt: number;
};

export const redis = Redis.fromEnv();
export const CHANNEL = "file-updates";

export function buildStatusEvent(s: FileStatus): string {
  return JSON.stringify(s);
}

export async function setFileStatus(s: FileStatus): Promise<void> {
  await redis.set(`file:${s.fileId}`, s);
  await redis.sadd("files", s.fileId);
  await redis.publish(CHANNEL, buildStatusEvent(s));
}

export async function getAllFileStatuses(): Promise<FileStatus[]> {
  const ids = await redis.smembers("files");
  if (ids.length === 0) return [];
  const rows = await Promise.all(ids.map((id) => redis.get<FileStatus>(`file:${id}`)));
  return rows.filter((r): r is FileStatus => !!r).sort((a, b) => b.updatedAt - a.updatedAt);
}

export type BoxTokens = { accessToken: string; refreshToken: string; expiresAt: number };
export const getBoxTokens = () => redis.get<BoxTokens>("box:tokens");
export const setBoxTokens = (t: BoxTokens) => redis.set("box:tokens", t);
export const getWebhookId = () => redis.get<string>("box:webhook");
export const setWebhookId = (id: string) => redis.set("box:webhook", id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/redis.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/redis.ts lib/redis.test.ts && git commit -m "feat: add redis status store + pubsub helpers"
```

---

### Task 4: Box client — OAuth, tokens, download, webhook (`lib/box.ts`)

**Files:**
- Create: `lib/box.ts`, `lib/box.test.ts`

**Interfaces:**
- Consumes: `box-typescript-sdk-gen`, `node:crypto`, `lib/redis.ts` token helpers, env.
- Produces:
  - `getAuthorizeUrl(state: string): string`
  - `exchangeCodeForTokens(code: string): Promise<BoxTokens>`
  - `getValidAccessToken(): Promise<string>` — reads tokens from Redis, refreshes if `expiresAt` is past, persists refreshed tokens.
  - `downloadFile(fileId: string): Promise<{ name: string; buffer: Buffer }>`
  - `createWebhook(folderId: string): Promise<string>` — registers FILE.UPLOADED on a folder, returns webhook id.
  - `isValidWebhookSignature(body: string, headers: Record<string,string|null>): boolean` — validates Box `BOX-SIGNATURE-PRIMARY/SECONDARY` HMAC-SHA256 against primary/secondary keys.

- [ ] **Step 1: Write the failing test for signature validation (pure, no network)**

```ts
import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { isValidWebhookSignature } from "@/lib/box";

function sign(body: string, key: string, ts: string) {
  return crypto.createHmac("sha256", key).update(body + ts).digest("base64");
}

describe("isValidWebhookSignature", () => {
  const body = '{"trigger":"FILE.UPLOADED"}';
  const ts = "2026-07-01T00:00:00-00:00";

  it("accepts a valid primary signature", () => {
    process.env.BOX_WEBHOOK_PRIMARY_KEY = "primkey";
    process.env.BOX_WEBHOOK_SECONDARY_KEY = "seckey";
    const headers = {
      "box-signature-primary": sign(body, "primkey", ts),
      "box-signature-secondary": "x",
      "box-signature-version": "1",
      "box-signature-algorithm": "HmacSHA256",
      "box-delivery-timestamp": ts,
    };
    expect(isValidWebhookSignature(body, headers)).toBe(true);
  });

  it("rejects a bad signature", () => {
    const headers = {
      "box-signature-primary": "nope",
      "box-signature-secondary": "nope",
      "box-delivery-timestamp": ts,
    };
    expect(isValidWebhookSignature(body, headers)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/box.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/box.ts`**

Implement signature validation with `node:crypto` (HMAC-SHA256 of `body + timestamp`, base64, compared against primary then secondary key using `crypto.timingSafeEqual` guarded by length check). Implement OAuth via `BoxOAuth`/`OAuthConfig` from `box-typescript-sdk-gen`:

```ts
import crypto from "node:crypto";
import { BoxClient, BoxOAuth, OAuthConfig } from "box-typescript-sdk-gen";
import { getBoxTokens, setBoxTokens, type BoxTokens } from "@/lib/redis";

const config = new OAuthConfig({
  clientId: process.env.BOX_CLIENT_ID!,
  clientSecret: process.env.BOX_CLIENT_SECRET!,
});

export function getAuthorizeUrl(state: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.BOX_CLIENT_ID!,
    redirect_uri: process.env.BOX_REDIRECT_URI!,
    state,
  });
  return `https://account.box.com/api/oauth2/authorize?${p}`;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function isValidWebhookSignature(
  body: string,
  headers: Record<string, string | null>,
): boolean {
  const ts = headers["box-delivery-timestamp"] ?? "";
  const mk = (key?: string) =>
    key ? crypto.createHmac("sha256", key).update(body + ts).digest("base64") : "";
  const prim = mk(process.env.BOX_WEBHOOK_PRIMARY_KEY);
  const sec = mk(process.env.BOX_WEBHOOK_SECONDARY_KEY);
  const gotP = headers["box-signature-primary"] ?? "";
  const gotS = headers["box-signature-secondary"] ?? "";
  return (!!prim && safeEqual(prim, gotP)) || (!!sec && safeEqual(sec, gotS));
}
```

Implement `exchangeCodeForTokens`, `getValidAccessToken` (refresh when `Date.now() > expiresAt - 60_000`), `downloadFile` (Box `client.downloads.downloadFile`, collect stream to Buffer, plus `client.files.getFileById` for the name), and `createWebhook` (`client.webhooks.createWebhook` with `target={type:"folder",id}`, `triggers:["FILE.UPLOADED"]`, `address=${APP_URL}/api/box/webhook`). Build a `BoxClient` from a valid access token for each call.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/box.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/box.ts lib/box.test.ts && git commit -m "feat: add Box OAuth, download, webhook client"
```

---

### Task 5: OAuth routes & webhook registration

**Files:**
- Create: `app/api/box/oauth/start/route.ts`, `app/api/box/oauth/callback/route.ts`

**Interfaces:**
- Consumes: `getAuthorizeUrl`, `exchangeCodeForTokens`, `setBoxTokens`, `createWebhook`, `setWebhookId`.
- Produces: `GET /api/box/oauth/start` → 302 to Box; `GET /api/box/oauth/callback?code&state` → stores tokens, registers webhook on folder `0` (All Files), redirects to `/`.

- [ ] **Step 1: Implement `start` route**

```ts
import { NextResponse } from "next/server";
import { getAuthorizeUrl } from "@/lib/box";

export async function GET() {
  const state = crypto.randomUUID();
  return NextResponse.redirect(getAuthorizeUrl(state));
}
```

- [ ] **Step 2: Implement `callback` route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, createWebhook } from "@/lib/box";
import { setBoxTokens, setWebhookId, getWebhookId } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });
  const tokens = await exchangeCodeForTokens(code);
  await setBoxTokens(tokens);
  if (!(await getWebhookId())) {
    const id = await createWebhook("0"); // folder 0 = All Files
    await setWebhookId(id);
  }
  return NextResponse.redirect(new URL("/", process.env.APP_URL!));
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds, routes compiled.

- [ ] **Step 4: Commit**

```bash
git add app/api/box/oauth && git commit -m "feat: add Box OAuth start/callback routes + webhook registration"
```

---

### Task 6: QStash queue helpers (`lib/queue.ts`)

**Files:**
- Create: `lib/queue.ts`

**Interfaces:**
- Consumes: `@upstash/qstash`, env.
- Produces:
  - `enqueueProcess(fileId: string): Promise<void>` — publishes `{ fileId }` to `${APP_URL}/api/process` via QStash.
  - `verifyQstash(signature: string | null, body: string): Promise<boolean>` — verifies QStash `Upstash-Signature` using the `Receiver` with current/next signing keys.

- [ ] **Step 1: Implement `lib/queue.ts`**

```ts
import { Client, Receiver } from "@upstash/qstash";

const client = new Client({ token: process.env.QSTASH_TOKEN! });
const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function enqueueProcess(fileId: string): Promise<void> {
  await client.publishJSON({
    url: `${process.env.APP_URL}/api/process`,
    body: { fileId },
  });
}

export async function verifyQstash(signature: string | null, body: string): Promise<boolean> {
  if (!signature) return false;
  try {
    return await receiver.verify({ signature, body });
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/queue.ts && git commit -m "feat: add QStash enqueue + verify helpers"
```

---

### Task 7: Webhook receiver route

**Files:**
- Create: `app/api/box/webhook/route.ts`

**Interfaces:**
- Consumes: `isValidWebhookSignature`, `enqueueProcess`, `setFileStatus`, `nowMs`.
- Produces: `POST /api/box/webhook` → validates signature; for FILE.UPLOADED, sets status `queued` and enqueues; always returns 200 quickly on valid, 403 on invalid signature.

- [ ] **Step 1: Implement route (reads raw body for signature check)**

```ts
import { NextRequest, NextResponse } from "next/server";
import { isValidWebhookSignature } from "@/lib/box";
import { enqueueProcess } from "@/lib/queue";
import { setFileStatus } from "@/lib/redis";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headers: Record<string, string | null> = {};
  req.headers.forEach((v, k) => (headers[k] = v));
  if (!isValidWebhookSignature(body, headers)) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }
  const evt = JSON.parse(body);
  if (evt.trigger === "FILE.UPLOADED" && evt.source?.id) {
    const fileId = String(evt.source.id);
    await setFileStatus({
      fileId, name: evt.source.name ?? fileId, stage: "queued", updatedAt: Date.now(),
    });
    await enqueueProcess(fileId);
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/box/webhook && git commit -m "feat: add Box webhook receiver that enqueues uploads"
```

---

### Task 8: Interfaze extraction client (`lib/interfaze.ts`)

**Files:**
- Create: `lib/interfaze.ts`

**Interfaces:**
- Consumes: `openai` SDK (OpenAI-compatible) pointed at `INTERFAZE_BASE_URL`.
- Produces: `extractText(file: { name: string; buffer: Buffer }): Promise<string>` — sends the document to Interfaze for OCR/structured extraction and returns plain text.

- [ ] **Step 1: Implement client**

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.INTERFAZE_API_KEY!,
  baseURL: process.env.INTERFAZE_BASE_URL!,
});

export async function extractText(file: { name: string; buffer: Buffer }): Promise<string> {
  const dataUrl = `data:application/octet-stream;base64,${file.buffer.toString("base64")}`;
  const res = await client.chat.completions.create({
    model: "interfaze-ocr",
    messages: [
      { role: "system", content: "Extract all text content from the document accurately. Return only the extracted text." },
      {
        role: "user",
        content: [
          { type: "text", text: `Extract the full text from this file: ${file.name}` },
          { type: "image_url", image_url: { url: dataUrl } },
        ] as any,
      },
    ],
  });
  return res.choices[0]?.message?.content ?? "";
}
```

> Note for implementer: confirm the exact Interfaze model id and file-input field against current Interfaze docs (`https://interfaze.ai`); the OpenAI-compatible chat shape above is the documented integration path. Keep the function signature stable.

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/interfaze.ts && git commit -m "feat: add Interfaze extraction client"
```

---

### Task 9: JigsawStack embedding client (`lib/jigsawstack.ts`)

**Files:**
- Create: `lib/jigsawstack.ts`

**Interfaces:**
- Consumes: `jigsawstack` SDK.
- Produces: `embed(text: string): Promise<number[]>` — returns one 4096-dim vector via embedding v2 (`type: "text"`).

- [ ] **Step 1: Implement client**

```ts
import { JigsawStack } from "jigsawstack";

const jigsaw = JigsawStack({ apiKey: process.env.JIGSAWSTACK_API_KEY! });

export async function embed(text: string): Promise<number[]> {
  const res = await jigsaw.embedding_v2({ text, type: "text" });
  const vec = (res as any).embeddings?.[0] ?? (res as any).embedding;
  if (!Array.isArray(vec)) throw new Error("JigsawStack embedding: unexpected response shape");
  return vec;
}
```

> Note for implementer: verify the v2 response field name against `jigsawstack.com/docs` (embedding v2). Keep `embed(text): Promise<number[]>` stable regardless.

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/jigsawstack.ts && git commit -m "feat: add JigsawStack embedding client"
```

---

### Task 10: Upstash Vector wrapper (`lib/vector.ts`)

**Files:**
- Create: `lib/vector.ts`

**Interfaces:**
- Consumes: `@upstash/vector`.
- Produces:
  - `type ChunkMeta = { fileId: string; fileName: string; chunkIdx: number; text: string }`
  - `upsertChunks(fileId: string, items: { vector: number[]; meta: ChunkMeta }[]): Promise<void>` — deletes existing `{fileId}:*` ids first (idempotent), then upserts with id `{fileId}:{chunkIdx}`.
  - `queryTopK(vector: number[], k: number): Promise<ChunkMeta[]>` — returns metadata of topK matches.

- [ ] **Step 1: Implement wrapper**

```ts
import { Index } from "@upstash/vector";

export type ChunkMeta = { fileId: string; fileName: string; chunkIdx: number; text: string };

const index = Index.fromEnv();

export async function upsertChunks(
  fileId: string,
  items: { vector: number[]; meta: ChunkMeta }[],
): Promise<void> {
  // idempotent: remove any prior chunks for this file
  const priorIds = items.map((_, i) => `${fileId}:${i}`);
  await index.delete(priorIds).catch(() => {});
  await index.upsert(
    items.map((it) => ({
      id: `${it.meta.fileId}:${it.meta.chunkIdx}`,
      vector: it.vector,
      metadata: it.meta as unknown as Record<string, unknown>,
    })),
  );
}

export async function queryTopK(vector: number[], k: number): Promise<ChunkMeta[]> {
  const res = await index.query({ vector, topK: k, includeMetadata: true });
  return res.map((r) => r.metadata as unknown as ChunkMeta).filter(Boolean);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/vector.ts && git commit -m "feat: add Upstash Vector upsert/query wrapper"
```

---

### Task 11: Processing pipeline route (`app/api/process`)

**Files:**
- Create: `app/api/process/route.ts`

**Interfaces:**
- Consumes: `verifyQstash`, `getValidAccessToken`/`downloadFile`, `extractText`, `chunkText`, `embed`, `upsertChunks`, `setFileStatus`.
- Produces: `POST /api/process` — full pipeline with per-stage status writes; 403 on bad QStash signature; sets `error` stage on failure.

- [ ] **Step 1: Implement route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyQstash } from "@/lib/queue";
import { downloadFile } from "@/lib/box";
import { extractText } from "@/lib/interfaze";
import { chunkText } from "@/lib/chunk";
import { embed } from "@/lib/jigsawstack";
import { upsertChunks } from "@/lib/vector";
import { setFileStatus } from "@/lib/redis";

export async function POST(req: NextRequest) {
  const body = await req.text();
  if (!(await verifyQstash(req.headers.get("upstash-signature"), body))) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }
  const { fileId } = JSON.parse(body) as { fileId: string };
  let name = fileId;
  try {
    await setFileStatus({ fileId, name, stage: "extracting", updatedAt: Date.now() });
    const file = await downloadFile(fileId);
    name = file.name;
    const text = await extractText(file);
    const chunks = chunkText(text);

    await setFileStatus({ fileId, name, stage: "embedding", updatedAt: Date.now() });
    const items = [];
    for (let i = 0; i < chunks.length; i++) {
      const vector = await embed(chunks[i]);
      items.push({ vector, meta: { fileId, fileName: name, chunkIdx: i, text: chunks[i] } });
    }
    await upsertChunks(fileId, items);

    await setFileStatus({ fileId, name, stage: "indexed", chunkCount: chunks.length, updatedAt: Date.now() });
    return NextResponse.json({ ok: true, chunks: chunks.length });
  } catch (err) {
    await setFileStatus({
      fileId, name, stage: "error",
      error: err instanceof Error ? err.message : "unknown error",
      updatedAt: Date.now(),
    });
    // 500 lets QStash retry transient failures
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/process && git commit -m "feat: add processing pipeline route (extract→embed→upsert)"
```

---

### Task 12: SSE live status route (`app/api/stream`)

**Files:**
- Create: `app/api/stream/route.ts`

**Interfaces:**
- Consumes: `@upstash/redis` subscribe (via REST `subscribe`), `getAllFileStatuses`.
- Produces: `GET /api/stream` — SSE stream that first emits a snapshot of all statuses, then pushes each `file-updates` message.

- [ ] **Step 1: Implement SSE route**

```ts
import { getAllFileStatuses, redis, CHANNEL } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      const snapshot = await getAllFileStatuses();
      send(JSON.stringify({ type: "snapshot", files: snapshot }));
      const sub = redis.subscribe(CHANNEL);
      sub.on("message", ({ message }) => send(JSON.stringify({ type: "update", file: JSON.parse(message as string) })));
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
```

> Note for implementer: `@upstash/redis` REST subscribe support — if the installed version lacks `subscribe`, fall back to a 1.5s poll of `getAllFileStatuses()` inside the stream loop. Either way the SSE event contract (`snapshot` then `update`) stays the same.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/stream && git commit -m "feat: add SSE route for live file status"
```

---

### Task 13: RAG retrieval & prompt assembly (`lib/rag.ts`)

**Files:**
- Create: `lib/rag.ts`, `lib/rag.test.ts`

**Interfaces:**
- Consumes: `ChunkMeta`.
- Produces:
  - `buildContext(chunks: ChunkMeta[]): { context: string; sources: string[] }` — formats numbered context blocks and a deduped source-file list.
  - `buildSystemPrompt(context: string): string` — instruction + grounded context.

- [ ] **Step 1: Write failing tests (pure)**

```ts
import { describe, it, expect } from "vitest";
import { buildContext, buildSystemPrompt } from "@/lib/rag";

const chunks = [
  { fileId: "1", fileName: "a.pdf", chunkIdx: 0, text: "alpha" },
  { fileId: "1", fileName: "a.pdf", chunkIdx: 1, text: "beta" },
  { fileId: "2", fileName: "b.docx", chunkIdx: 0, text: "gamma" },
];

describe("rag", () => {
  it("builds numbered context and deduped sources", () => {
    const { context, sources } = buildContext(chunks);
    expect(context).toContain("[1]");
    expect(context).toContain("alpha");
    expect(sources).toEqual(["a.pdf", "b.docx"]);
  });

  it("embeds context into the system prompt", () => {
    expect(buildSystemPrompt("CTX")).toContain("CTX");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run lib/rag.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import type { ChunkMeta } from "@/lib/vector";

export function buildContext(chunks: ChunkMeta[]): { context: string; sources: string[] } {
  const context = chunks
    .map((c, i) => `[${i + 1}] (from ${c.fileName})\n${c.text}`)
    .join("\n\n");
  const sources = [...new Set(chunks.map((c) => c.fileName))];
  return { context, sources };
}

export function buildSystemPrompt(context: string): string {
  return [
    "You are a helpful assistant answering questions about the user's Box files.",
    "Answer ONLY using the context below. If the answer is not in the context, say you don't know.",
    "Cite sources using their [n] markers.",
    "",
    "Context:",
    context,
  ].join("\n");
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/rag.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/rag.ts lib/rag.test.ts && git commit -m "feat: add RAG context + prompt assembly"
```

---

### Task 14: Chat route (`app/api/chat`)

**Files:**
- Create: `app/api/chat/route.ts`

**Interfaces:**
- Consumes: `embed`, `queryTopK`, `buildContext`, `buildSystemPrompt`, Vercel AI SDK + `@ai-sdk/openai`.
- Produces: `POST /api/chat` — accepts `{ messages }` from `useChat`, retrieves context for the latest user message, streams an Interfaze answer.

- [ ] **Step 1: Implement route**

```ts
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { embed } from "@/lib/jigsawstack";
import { queryTopK } from "@/lib/vector";
import { buildContext, buildSystemPrompt } from "@/lib/rag";

export const dynamic = "force-dynamic";

const interfaze = createOpenAI({
  apiKey: process.env.INTERFAZE_API_KEY!,
  baseURL: process.env.INTERFAZE_BASE_URL!,
});

export async function POST(req: Request) {
  const { messages } = await req.json();
  const last = [...messages].reverse().find((m: any) => m.role === "user");
  const qVec = await embed(last?.content ?? "");
  const chunks = await queryTopK(qVec, 6);
  const { context } = buildContext(chunks);

  const result = streamText({
    model: interfaze("interfaze"),
    system: buildSystemPrompt(context),
    messages,
  });
  return result.toDataStreamResponse();
}
```

> Note for implementer: confirm the Interfaze chat model id for generation. Keep the route contract (`useChat`-compatible) stable.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/chat && git commit -m "feat: add RAG chat route streaming from Interfaze"
```

---

### Task 15: Dashboard UI (connect, file list, chat)

**Files:**
- Create: `components/ConnectBox.tsx`, `components/FileList.tsx`, `components/FileCard.tsx`, `components/ChatPanel.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `/api/box/oauth/start`, `/api/stream` (SSE), `/api/chat` (`useChat`).
- Produces: a clean two-panel dashboard — files with live stage badges on the left, chat on the right.

- [ ] **Step 1: Implement `FileCard` (stage badge)**

A presentational component taking a `FileStatus` and rendering name + a colored badge per stage (`queued` gray, `extracting`/`embedding` amber with spinner, `indexed` green with ✓ and chunk count, `error` red with message tooltip).

- [ ] **Step 2: Implement `FileList` (SSE subscriber)**

Client component: on mount, opens `new EventSource("/api/stream")`, applies `snapshot` to initialize a `Map<fileId, FileStatus>` and merges each `update`, rendering `FileCard`s sorted by `updatedAt` desc. Empty state: "Upload a file to your connected Box folder to see it indexed here."

- [ ] **Step 3: Implement `ConnectBox`**

Renders a "Connect Box" button linking to `/api/box/oauth/start`. (Connected state is implicit for the demo; show a subtle "Connected" pill once files exist.)

- [ ] **Step 4: Implement `ChatPanel`**

Client component using `useChat({ api: "/api/chat" })` from `ai/react`: message list (user/assistant bubbles), streaming assistant text, an input with send button, and a small "Sources" footer when present.

- [ ] **Step 5: Compose in `app/page.tsx`**

```tsx
import ConnectBox from "@/components/ConnectBox";
import FileList from "@/components/FileList";
import ChatPanel from "@/components/ChatPanel";

export default function Page() {
  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Box RAG Demo</h1>
        <ConnectBox />
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section><h2 className="text-sm font-medium mb-2 text-gray-500">Files</h2><FileList /></section>
        <section><h2 className="text-sm font-medium mb-2 text-gray-500">Chat</h2><ChatPanel /></section>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Verify build & manual smoke**

Run: `npm run build`
Expected: succeeds. (Live behavior verified during the integration pass in Task 16.)

- [ ] **Step 7: Commit**

```bash
git add components app/page.tsx && git commit -m "feat: add dashboard UI (connect, live file list, chat)"
```

---

### Task 16: README & end-to-end setup guide

**Files:**
- Create: `README.md`

**Interfaces:**
- Produces: setup/run instructions covering env vars, Upstash Vector dim=4096, Box app + OAuth redirect + webhook keys, tunnel for local dev, and the demo flow.

- [ ] **Step 1: Write `README.md`**

Document: (1) `cp .env.example .env` and fill values; (2) create an Upstash Vector index at **dimension 4096**, plus Redis + QStash; (3) create a Box app (OAuth 2.0 user auth), set redirect URI to `${APP_URL}/api/box/oauth/callback`, copy webhook signature keys; (4) run a tunnel (`ngrok http 3000`) and set `APP_URL`; (5) `npm run dev`; (6) demo flow: click Connect Box → upload a file in Box → watch it index live → ask a question in chat.

- [ ] **Step 2: Final full build + test**

Run: `npm run build && npm test`
Expected: build succeeds; all Vitest unit tests pass.

- [ ] **Step 3: Commit**

```bash
git add README.md && git commit -m "docs: add setup and demo guide"
```

---

## Self-Review Notes

- **Spec coverage:** OAuth (T4–5), webhook + signature (T4, T7), QStash decoupling (T6–7, T11), Interfaze extraction (T8, T11), JigsawStack v2 4096-dim (T9), Upstash Vector dim-4096 + idempotent upsert (T10), Redis status + pub/sub (T3), SSE live UI (T12, T15), RAG chat (T13–14), clean UI (T15), config/env + local-dev tunnel note (T1, T16). All spec sections map to tasks.
- **Idempotency** (deterministic ids + delete-then-upsert) is in T10/T11 per Global Constraints.
- **External-client tasks** (T6, T8, T9, T10, T14) carry typecheck/build gates rather than unit tests because they wrap live third-party APIs; pure logic (T2, T3, T13) and signature validation (T4) are full TDD, matching the spec's pragmatic testing section.
- **Implementer notes** flag the three SDK details to confirm against live docs (Interfaze model id/input field, JigsawStack v2 response field, `@upstash/redis` subscribe support) without changing any function signatures.
