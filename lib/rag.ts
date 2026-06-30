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
