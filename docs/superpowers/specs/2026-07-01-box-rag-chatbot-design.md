# Box RAG Chatbot — Design Spec

**Date:** 2026-07-01
**Status:** Approved (design); pending spec review
**Author:** Vineet (vineet@jigsawstack.com) with Claude Code

## 1. Summary

A Next.js demo application that lets a user connect their Box account, watch files
they upload to Box get indexed in real time through an Interfaze → JigsawStack →
Upstash Vector pipeline, and then ask questions over those files via a streaming RAG
chatbot.

The headline experience: a clean dashboard where uploaded files visibly move through
the indexing stages (**Queued → Extracting → Embedding → Indexed**), alongside a chat
panel that answers questions grounded in the indexed content with source citations.

## 2. Goals & non-goals

### Goals
- Connect a Box account via **OAuth 2.0** (user auth).
- Receive **FILE.UPLOADED** webhooks and ingest files automatically.
- Extract content with **Interfaze** (OCR + structured extraction).
- Generate **JigsawStack embedding v2** vectors (4096-dim).
- Store/query vectors in **Upstash Vector**.
- Decouple ingestion with **Upstash QStash** (queue) so webhook responses stay fast and
  long extractions never hit serverless timeouts.
- Show **real-time** per-file pipeline status via SSE backed by **Upstash Redis** pub/sub.
- Answer questions via a streaming **RAG chat** using Interfaze as the chat LLM.

### Non-goals (YAGNI for this demo)
- Multi-tenant auth / multiple simultaneous Box accounts. Scope is a **single connected
  account** at a time.
- A relational database. All transient state lives in Redis.
- Fine-grained per-user vector namespaces (single namespace is sufficient for the demo).
- Full end-to-end test automation against live third-party services.

## 3. Architecture

### Stack
- **Next.js (App Router) + TypeScript**, Tailwind CSS, shadcn/ui for UI polish.
- **Box TypeScript SDK** (`box-typescript-sdk-gen`) — OAuth, file download, webhook
  create/validate.
- **Interfaze** — OpenAI-compatible client for extraction/OCR.
- **JigsawStack SDK** — `embedding_v2` (4096-dim, multimodal).
- **Upstash Vector** — index created at **dimension = 4096** (must match JigsawStack v2).
- **Upstash QStash** — HTTP-based job queue.
- **Upstash Redis** — file status store + pub/sub channel for live updates.
- **Vercel AI SDK** (`useChat`) — streaming chat UI.

### Module boundaries
| Module | Responsibility | Depends on |
|---|---|---|
| `lib/box.ts` | OAuth flow, token storage/refresh, file download, webhook create + signature validation | Box SDK, Redis |
| `lib/interfaze.ts` | File → extracted text + structured data | Interfaze API |
| `lib/jigsawstack.ts` | Text → 4096-dim embedding | JigsawStack SDK |
| `lib/vector.ts` | Upsert / topK query on Upstash Vector | Upstash Vector |
| `lib/redis.ts` | File status read/write + pub/sub publish/subscribe | Upstash Redis |
| `lib/queue.ts` | QStash publish + callback signature verification | QStash |
| `lib/chunk.ts` | Pure text chunking (~800 tokens, 100 overlap) | — |
| `lib/rag.ts` | Retrieval + prompt/context assembly with citations | vector, jigsawstack |

| Route | Responsibility |
|---|---|
| `app/api/box/oauth/start` | Redirect to Box authorize URL |
| `app/api/box/oauth/callback` | Exchange code, store tokens, register webhook |
| `app/api/box/webhook` | Validate signature, enqueue `{ fileId }` to QStash, 200 fast |
| `app/api/process` | QStash target: run the extract → embed → upsert pipeline |
| `app/api/stream` | SSE: subscribe to Redis pub/sub, push status updates |
| `app/api/chat` | RAG: embed question → query → stream Interfaze answer |

| Component | Responsibility |
|---|---|
| `app/page.tsx` | Dashboard layout |
| `ConnectBox` | Connect / connected state, OAuth entry |
| `FileList` / `FileCard` | Render files + live pipeline status badges |
| `ChatPanel` | `useChat` chat with streamed answers + source citations |

## 4. Data flow

### Ingestion (write path)
1. User connects Box via OAuth; on callback we store access + refresh tokens in Redis
   and register a **FILE.UPLOADED** webhook on the chosen folder.
2. On upload, Box calls `POST /api/box/webhook`. We **validate the signature**, enqueue
   `{ fileId }` to QStash, and return **200 immediately**.
3. QStash calls `POST /api/process` (we **verify the QStash signature**), which:
   1. status `queued → extracting` (write Redis + publish).
   2. Download the file via Box SDK (refresh token on 401).
   3. Interfaze: extract text + structured data.
   4. Chunk text (`lib/chunk.ts`).
   5. status `embedding`.
   6. JigsawStack v2: embed each chunk (4096-dim).
   7. Upstash Vector upsert with deterministic id `{fileId}:{chunkIdx}` and metadata
      `{ fileId, fileName, chunkIdx, text }`.
   8. status `indexed` (with `chunkCount`) → publish.

### Query (read path)
1. `POST /api/chat` embeds the question (JigsawStack v2).
2. Query Upstash Vector `topK = 6` with `includeMetadata`.
3. Assemble context + source list (`lib/rag.ts`).
4. Stream answer from Interfaze chat completion.
5. `useChat` renders the answer and the source files used.

### Live UI
`/api/stream` (SSE) subscribes to the Redis pub/sub channel; each status change is
pushed to the browser so file cards animate through the stages in real time.

## 5. State model (Redis)
- `box:tokens` — `{ accessToken, refreshToken, expiresAt }` for the connected account.
- `box:webhook` — registered webhook id (for cleanup/re-registration).
- `file:{fileId}` — hash `{ name, status, stage, chunkCount, error, updatedAt }`.
- `files` — set of known file ids (to render the dashboard on load).
- pub/sub channel `file-updates` — JSON status events for SSE fan-out.

## 6. Error handling & correctness
- **Signature validation** on both the Box webhook and the QStash callback; reject
  invalid requests.
- **Idempotency:** deterministic vector ids + delete-then-upsert per file, so QStash
  retries never duplicate vectors.
- **Per-stage try/catch** → set file status to `error` with a message; surfaced as a red
  badge in the UI.
- **Token refresh** on Box 401. **QStash auto-retries** non-2xx processing responses.

## 7. Testing
Pragmatic and focused on pure logic:
- Unit tests for `lib/chunk.ts` (boundaries, overlap, empty/oversized input).
- Unit tests for `lib/rag.ts` prompt/context assembly and citation formatting.
- Unit tests for the Redis status reducer logic with a stubbed client.
- No full e2e against live Box/Interfaze/JigsawStack/Upstash services.

## 8. Configuration (env vars)
- Box: `BOX_CLIENT_ID`, `BOX_CLIENT_SECRET`, `BOX_REDIRECT_URI`,
  `BOX_WEBHOOK_PRIMARY_KEY`, `BOX_WEBHOOK_SECONDARY_KEY`.
- Interfaze: `INTERFAZE_API_KEY` (+ base URL).
- JigsawStack: `JIGSAWSTACK_API_KEY`.
- Upstash Vector: `UPSTASH_VECTOR_REST_URL`, `UPSTASH_VECTOR_REST_TOKEN`.
- Upstash Redis: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- QStash: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`.
- App: `APP_URL` (public base URL for webhook + QStash callbacks).

## 9. Local development note
Box webhooks and QStash callbacks both require a **public URL**. For local dev, run a
tunnel (ngrok/cloudflared) and set `APP_URL` to the tunnel URL, or develop against a
Vercel preview deployment. The Upstash Vector index must be pre-created at dimension
4096. The README will document both.

## 10. Open questions (deferred, non-blocking)
- Chunking parameters (800/100) are a starting point; may tune after seeing real docs.
- Whether to support FILE.TRASHED for vector cleanup (out of scope for v1; easy to add).
