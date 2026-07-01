# Box Sync Button — Design

**Date:** 2026-07-01
**Status:** Approved

## Problem

Files already in a connected Box account do not appear in the Box RAG Demo, and the
webhook cannot be set up at all. Root causes established during investigation:

1. **Webhook creation only runs during OAuth**, which is bypassed when
   `BOX_DEVELOPER_TOKEN` is set (`lib/box.ts:70`). Redis confirms no `box:tokens`,
   no `box:webhook`, no files were ever created.
2. **The Box app lacks the "Manage webhooks" scope** — calling Box directly returns
   `403 insufficient_scope`.
3. **The code targets the root folder** (`createWebhook("0")`, `lib/box.ts:126`).
   Box V2 webhooks cannot be created on the root folder — a documented limitation.
4. **`FILE.UPLOADED` only fires for new uploads** after the webhook exists. Existing
   files (e.g. `response.json` already in Box) never trigger it, and there is no
   backfill/sync.

The webhook path is blocked for now (Box scope glitch on the user's side). This spec
covers a manual **Sync** feature that indexes existing Box files without any webhook.

## Goal

A "Sync from Box" button that lists files already in Box and pushes them through the
existing processing pipeline, so existing documents get indexed and become chattable —
no webhook required.

## Approach

Treat Sync as a **manual replacement for the webhook trigger**. It reuses the entire
existing pipeline unchanged: for each file to index, do exactly what the webhook did —
`setFileStatus(queued)` + `enqueueProcess(fileId)` — and let QStash drive the existing
`/api/process` route. The webhook and Sync become two doors into the same room.

QStash and the public ngrok `APP_URL` are already configured, so no new infrastructure
is needed. Everything from `/api/process` onward (status → Redis → SSE → UI) is unchanged.

**Decisions (from brainstorming):**
- **Scope:** Root, recursive — all files in the Box root and every subfolder.
- **Re-index:** Skip files already `indexed` (by `fileId`). Upsert is idempotent, so
  repeat Syncs are safe regardless.

## Components

### 1. `lib/box.ts` — `listFolderFilesRecursive(folderId): Promise<{ id: string; name: string }[]>`
Walks a folder using the Box SDK `folders.getFolderItems`, paginating through **all**
entries (offset/marker until exhausted), recursing into subfolders, and returning a flat
list of **files only**. Called with `"0"` (root). Listing the root is permitted — only
webhooks on root are forbidden, which is precisely why Sync avoids the webhook problem.

### 2. `lib/sync.ts` — `selectFilesToSync(files, statuses): { id: string; name: string }[]`
Pure function. Given all Box files and current Redis `FileStatus[]`, returns the files to
enqueue — those without an `indexed` status. No network calls; isolates the
"skip already-indexed" rule and is unit-testable.

### 3. `app/api/sync/route.ts` — `POST`
1. `listFolderFilesRecursive("0")`
2. `getAllFileStatuses()`
3. `selectFilesToSync(files, statuses)`
4. For each selected file: `setFileStatus({ fileId, name, stage: "queued", updatedAt })`
   then `enqueueProcess(fileId)`. A per-file failure is logged and does not abort the rest.
5. Returns `{ queued, skipped, total }`.

On a Box auth/token error (e.g. expired dev token), returns a clear error message and
non-2xx status so the UI can surface it.

### 4. UI — "Sync from Box" button
Placed next to "Connect Box" in the header (`app/page.tsx` / a small component). On click:
`POST /api/sync`, button shows a spinner and disables during the request, then shows a
short result line (e.g. "Queued 3, skipped 1"). Files appear live through the existing SSE
stream — no new realtime plumbing.

## Data Flow

```
Sync click → POST /api/sync → list (recursive) + filter (skip indexed)
   → for each: setFileStatus(queued) + enqueueProcess
   → QStash → POST /api/process → Redis status → SSE → UI
```
Identical to the webhook path from `/api/process` onward.

## Error Handling

- **Box pagination:** handled inside `listFolderFilesRecursive` (loop until no more items).
- **Per-file enqueue failure:** caught, logged, skipped; other files still enqueue.
- **Box auth/token error:** surfaced to the UI with a clear message and non-2xx status.
- **Idempotency:** vector upsert deletes stale chunks by `fileId` prefix, so repeat Syncs
  never duplicate or corrupt data.

## Testing

Match existing `lib/*.test.ts` (vitest) style:
- `listFolderFilesRecursive` — mock Box client; verify recursion into subfolders and
  pagination across multiple pages; verify folders are excluded from the result.
- `selectFilesToSync` — verify indexed files are skipped and non-indexed files are
  returned; verify empty inputs.

## Out of Scope

- Fixing the webhook path (Box scope / root-folder target). Documented above for later;
  not changed here.
- Real-time deletion/removal sync. Sync only adds/indexes.
