import { jigsawstackLimiter } from "@/lib/ratelimit";

const BASE_URL = process.env.JIGSAWSTACK_BASE_URL ?? "https://api.jigsawstack.com";
// v2 embeddings are configurable 32–4096; default to the rich 4096-dim vector.
// MUST match the dimension your Upstash Vector index was created at.
const DIMENSIONS = Number(process.env.JIGSAWSTACK_EMBED_DIMENSIONS ?? 4096);

/**
 * Generate a single embedding vector via JigsawStack Embedding v2
 * (POST /v2/embedding). We call the REST endpoint directly because the
 * installed SDK version does not expose an `embedding_v2()` method.
 * Response shape: `{ embeddings: number[][]; chunks: string[] }` — one vector
 * per chunk — so the first vector is `embeddings[0]`.
 */
export async function embed(text: string, attempt = 0): Promise<number[]> {
  await jigsawstackLimiter.acquire();
  const res = await fetch(`${BASE_URL}/v2/embedding`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.JIGSAWSTACK_API_KEY!,
    },
    body: JSON.stringify({ text, type: "text", dimensions: DIMENSIONS }),
  });

  if (!res.ok) {
    const body = await res.text();
    // If the input is rejected for being too long, truncate and retry a couple
    // of times rather than failing the whole file on one over-length chunk.
    const tooLong =
      res.status === 400 ||
      res.status === 413 ||
      res.status === 422 ||
      /too\s*long|length|token|maximum|exceed/i.test(body);
    if (tooLong && attempt < 3 && text.length > 400) {
      const truncated = text.slice(0, Math.floor(text.length * 0.6));
      console.warn(
        `[jigsawstack] embedding input too long (${text.length} chars); retrying truncated to ${truncated.length}`,
      );
      return embed(truncated, attempt + 1);
    }
    throw new Error(`JigsawStack embedding v2 failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { embeddings?: number[][] };
  const vec = data.embeddings?.[0];
  if (!Array.isArray(vec) || vec.length === 0 || typeof vec[0] !== "number") {
    throw new Error("JigsawStack embedding: unexpected response shape");
  }
  return vec;
}
