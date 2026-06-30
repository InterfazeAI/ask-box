import { JigsawStack } from "jigsawstack";

const jigsaw = JigsawStack({ apiKey: process.env.JIGSAWSTACK_API_KEY! });

export async function embed(text: string): Promise<number[]> {
  const res = await jigsaw.embedding({ text, type: "text" });
  const vec = (res as any).embeddings?.[0] ?? (res as any).embedding;
  if (!Array.isArray(vec)) throw new Error("JigsawStack embedding: unexpected response shape");
  return vec;
}
