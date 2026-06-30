import { getAllFileStatuses, type FileStatus } from "@/lib/redis";

export const dynamic = "force-dynamic";

// NOTE: @upstash/redis is a REST client. It does expose a `subscribe()` method,
// but it works by opening its own long-lived SSE connection to Upstash's REST
// endpoint. Chaining that inside an SSE response from a Vercel serverless
// function means juggling two independent long-lived connections (and their
// cleanup) for a route that already has a hard execution-time ceiling on most
// plans. Polling `getAllFileStatuses()` is simpler, has no extra upstream
// connection to manage, and is robust to the function being recycled. We poll
// every 1.5s and diff against the last-sent snapshot by fileId+stage+updatedAt
// so we only emit events for files that actually changed.
const POLL_INTERVAL_MS = 1500;

function statusKey(s: FileStatus): string {
  return `${s.fileId}:${s.stage}:${s.updatedAt}`;
}

export async function GET() {
  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const lastSeen = new Map<string, string>();

      const recordSeen = (files: FileStatus[]) => {
        for (const file of files) {
          lastSeen.set(file.fileId, statusKey(file));
        }
      };

      try {
        const snapshot = await getAllFileStatuses();
        recordSeen(snapshot);
        send({ type: "snapshot", files: snapshot });
      } catch (err) {
        controller.error(err);
        return;
      }

      intervalId = setInterval(async () => {
        try {
          const files = await getAllFileStatuses();
          for (const file of files) {
            const key = statusKey(file);
            if (lastSeen.get(file.fileId) !== key) {
              lastSeen.set(file.fileId, key);
              send({ type: "update", file });
            }
          }
        } catch {
          // Transient Redis/network errors shouldn't kill the stream; just
          // skip this tick and try again on the next interval.
        }
      }, POLL_INTERVAL_MS);
    },
    cancel() {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
      }
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
