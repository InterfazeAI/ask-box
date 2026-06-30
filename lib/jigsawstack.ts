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
export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${BASE_URL}/v2/embedding`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.JIGSAWSTACK_API_KEY!,
    },
    body: JSON.stringify({ text, type: "text", dimensions: DIMENSIONS }),
  });

  if (!res.ok) {
    throw new Error(
      `JigsawStack embedding v2 failed: ${res.status} ${await res.text()}`,
    );
  }

  const data = (await res.json()) as { embeddings?: number[][] };
  const vec = data.embeddings?.[0];
  if (!Array.isArray(vec) || vec.length === 0 || typeof vec[0] !== "number") {
    throw new Error("JigsawStack embedding: unexpected response shape");
  }
  return vec;
}
