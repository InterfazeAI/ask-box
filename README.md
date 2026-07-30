# 📦 Ask Box

A chatbot that syncs documents from [Box](https://box.com) and gives you grounded, cited Q&A over them, powered by [Interfaze](https://interfaze.ai).

[Interfaze](https://interfaze.ai) · [Docs](https://docs.interfaze.ai) · [Box](https://box.com) · [Chrome Extension](#-chrome-extension-ask-box)

<!-- Add a screenshot or demo GIF at ./public/screenshot.png (the extension store frames in
     extension/store/screenshot-*.png are good candidates, or capture the main app UI). -->
![Ask Box](./public/screenshot.png)

Drop a file into your Box account and watch it flow automatically through OCR, chunking, embedding, and indexing, with the UI updating live at every step. Then ask questions and get answers grounded in your own documents, streamed to your browser in real time.

Most "chat with your docs" demos make you manually upload files. This one wires directly into Box: the moment a file lands in your account, a webhook kicks off the pipeline and the document becomes searchable, with no manual import step.

## ✨ Key Features

- 📤 **Zero-touch sync**: a Box `FILE.UPLOADED` webhook starts indexing automatically, with no manual upload
- 🔍 **OCR extraction**: Interfaze pulls text from PDFs, scans, and images
- 🧠 **Semantic search**: Interfaze embeddings power top-k retrieval over your documents
- 💬 **Grounded chat**: answers cited to your documents, streamed to your browser in real time
- ⚡ **Live status**: `Queued`, `Extracting`, `Embedding`, `Indexed`, pushed to the UI as it happens
- 🧩 **Chrome extension**: chat with your indexed Box docs from any tab (side panel)
- 🔒 **Per-account isolation**: anonymous sessions keep each user's documents separate
- 🚀 **Production-ready**: one-command deploy included

Built on [Box](https://box.com) and [Interfaze](https://interfaze.ai).

## 🏗️ Architecture

```
Box File Upload
    ↓
[FILE.UPLOADED webhook] → Queue
    ↓
[POST /api/process] (async job)
    ├─ Interfaze: OCR extract text
    ├─ Chunk text into segments
    ├─ Interfaze: embed each chunk
    └─ Vector index: upsert indexed chunks (idempotent)
    ↓
Live UI: File status Queued → Extracting → Embedding → Indexed
    ↓
Chat: User question
    ├─ Interfaze: embed question
    ├─ Vector index: semantic search (top 6 chunks)
    ├─ Interfaze: generate grounded answer
    └─ Stream to browser
```

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/InterfazeAI/ask-box.git
cd ask-box
npm install
```

### 2. Create `.env.local`

Copy the template and fill in all values:

```bash
cp .env.example .env.local
```

**Required environment variables** (see `.env.example`):
- `APP_URL`: public URL for webhook callbacks (see "Public URL" below)
- `BOX_CLIENT_ID`, `BOX_CLIENT_SECRET`: from Box app
- `BOX_REDIRECT_URI`: set by Next.js; typically `${APP_URL}/api/box/oauth/callback`
- `BOX_WEBHOOK_PRIMARY_KEY`, `BOX_WEBHOOK_SECONDARY_KEY`: Box webhook signature keys
- `INTERFAZE_API_KEY`, `INTERFAZE_BASE_URL`: Interfaze OCR service
- `JIGSAWSTACK_API_KEY`: embeddings
- `UPSTASH_VECTOR_REST_URL`, `UPSTASH_VECTOR_REST_TOKEN`: vector index
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: status pub/sub
- `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`: async job queue

### 3. Vector & Queue Setup

#### Vector Index (Critical: dimension must match your embedding size)

1. Create a **Vector** index with your provider
2. **Before creating the index**, determine your embedding dimension:
   - Run this snippet in your project (after setting `JIGSAWSTACK_API_KEY` in `.env.local`):
     ```ts
     import { embed } from "@/lib/jigsawstack";
     console.log((await embed("test")).length); // <- this is your dimension
     ```
   - v1 = 768 dims, v2 = 4096 dims (assume 4096 unless you verified otherwise)
3. Create the Vector index with **exactly** that dimension (e.g., 4096)
4. Copy `UPSTASH_VECTOR_REST_URL` and `UPSTASH_VECTOR_REST_TOKEN` to `.env.local`

#### Redis Database

1. Create a **Redis** database
2. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to `.env.local`

#### Queue

1. Create a **QStash** instance
2. Copy `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, and `QSTASH_NEXT_SIGNING_KEY` to `.env.local`

### 4. Box App Setup

1. Go to [developer.box.com](https://developer.box.com)
2. Create a new app with **OAuth 2.0 (user auth)**
3. Set redirect URI to: `${APP_URL}/api/box/oauth/callback` (e.g., `https://example-tunnel.ngrok.io/api/box/oauth/callback`)
4. Copy **Client ID** and **Client Secret** to `.env.local`
5. Set up a **webhook** for file uploads:
   - In your Box app settings, go to Webhooks and add a webhook pointing to `${APP_URL}/api/box/webhook`
   - Event: `FILE.UPLOADED`
   - Copy the **Primary** and **Secondary** signature keys to `BOX_WEBHOOK_PRIMARY_KEY` and `BOX_WEBHOOK_SECONDARY_KEY` in `.env.local`

### 5. Public URL (Local Dev or Deployed)

Box webhooks and queue callbacks require a public URL.

#### Option A: Local Development (Tunnel)

Use ngrok or similar to expose localhost:3000:

```bash
ngrok http 3000
```

Copy the tunnel URL (e.g., `https://abc123-tunnel.ngrok.io`) and set:

```bash
APP_URL=https://abc123-tunnel.ngrok.io
```

#### Option B: Deploy to Vercel

```bash
vercel deploy
```

Then set:

```bash
APP_URL=https://your-project.vercel.app
```

### 6. Build Prerequisites

All environment variables must be set **before** running `npm run build` or `npm run dev`, because client modules (e.g., `lib/jigsawstack.ts`) read env vars at import time. A build with missing keys will fail at startup.

## 🏃 Run

```bash
npm run dev
```

Navigate to `http://localhost:3000`.

## ☁️ One-Click Deploy

Deploy your own instance to Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FInterfazeAI%2Fask-box&env=APP_URL,BOX_CLIENT_ID,BOX_CLIENT_SECRET,BOX_WEBHOOK_PRIMARY_KEY,BOX_WEBHOOK_SECONDARY_KEY,INTERFAZE_API_KEY,INTERFAZE_BASE_URL,JIGSAWSTACK_API_KEY,UPSTASH_VECTOR_REST_URL,UPSTASH_VECTOR_REST_TOKEN,UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN,QSTASH_TOKEN,QSTASH_CURRENT_SIGNING_KEY,QSTASH_NEXT_SIGNING_KEY,SESSION_SECRET)

After deploying, set `APP_URL` to your Vercel URL and point your Box webhook and redirect URI at it.

## 🎮 Demo Flow

1. **Click "Connect Box"** in the top-right
   - You'll be redirected to Box login and asked to authorize the app
   - After successful OAuth, the app stores your tokens

2. **Upload a file to your Box account**
   - The Box webhook triggers, queues an async job, and the job starts
   - Watch the **Files** panel on the left as the status changes:
     - Queued, then Extracting (Interfaze OCR)
     - then Embedding (Interfaze)
     - then Indexed
   
3. **Ask a question in the Chat panel**
   - The app embeds your question, searches the vector index for relevant chunks, and streams a grounded answer from Interfaze

4. **Try uploading multiple files** to see them all indexed and searchable together in one session

## 🧪 Testing

Run all unit tests (chunk extraction, status pub/sub, Box signature validation, embedding parsing, context building):

```bash
npm run test
```

Watch mode:

```bash
npm run test:watch
```

## 📝 Notes

- **Interfaze model IDs** (`interfaze-ocr` in `lib/interfaze.ts` and `interfaze` in `app/api/chat/route.ts`) are placeholders. Verify against current [Interfaze docs](https://docs.interfaze.ai) before relying on them in production.
- **Dimension mismatch error**: If you see a vector dimension error, you likely created your vector index at the wrong dimension. Run the snippet above to confirm your embedding size and recreate the index at the correct dimension.
- **Webhook delivery**: Box webhooks may take a few seconds to deliver. If a file doesn't appear in the UI, check the queue or status logs.

## 🔧 Troubleshooting

- **"Build failed: Cannot find module '@/lib/jigsawstack'"**: Set all env vars in `.env.local` before building.
- **"403 bad signature" on webhook**: Verify `BOX_WEBHOOK_PRIMARY_KEY` and `BOX_WEBHOOK_SECONDARY_KEY` match your Box app settings.
- **"Vector dimension mismatch"**: Run the embedding size check above and recreate your vector index at the correct dimension.

## 🧱 Built With

- **Box**: file management and webhooks
- **Interfaze**: OCR text extraction, embeddings, and grounded chat

## 🧩 Chrome Extension: Ask Box

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

## 📄 License

Released under the [MIT License](./LICENSE).
