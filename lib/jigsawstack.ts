import { JigsawStack } from "jigsawstack";

const jigsaw = JigsawStack({ apiKey: process.env.JIGSAWSTACK_API_KEY! });

export async function embed(text: string): Promise<number[]> {
  const res = await jigsaw.embedding({ text, type: "text" });
  // Per JigsawStack docs, the real response shape is `{ embeddings: number[][]; chunks: string[] }`
  // (one vector per chunk) — the SDK's .d.ts mistypes `embeddings` as a flat `number[]`,
  // hence the `as any` cast needed to index `[0]`. Dimension is v1=768 / v2=4096 depending
  // on account, so it is intentionally not asserted here.
  const vec = (res as any).embeddings?.[0];
  if (!Array.isArray(vec) || vec.length === 0 || typeof vec[0] !== "number") {
    throw new Error("JigsawStack embedding: unexpected response shape");
  }
  return vec as number[];
}
