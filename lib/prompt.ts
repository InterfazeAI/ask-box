import type { ChunkMeta } from "@/lib/vector";

const DEFAULT_MAX_CHARS = 12000;

function wordSet(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/\s+/).filter(Boolean));
}

/** Jaccard similarity over word sets — cheap near-duplicate detector. */
function jaccard(a: string, b: string): number {
  const A = wordSet(a);
  const B = wordSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * Turn retrieved chunks into a numbered context string.
 *  - #4 skips near-duplicate chunks (overlapping / repeated passages),
 *  - #3 keeps the total within a character budget so the prompt can't blow up.
 * Assumes `chunks` are already ordered best-first (by score).
 */
export function buildContext(
  chunks: ChunkMeta[],
  opts: { maxChars?: number } = {},
): { context: string; sources: string[] } {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const selected: ChunkMeta[] = [];
  let total = 0;

  for (const c of chunks) {
    if (selected.some((s) => jaccard(s.text, c.text) > 0.7)) continue;
    if (selected.length > 0 && total + c.text.length > maxChars) break;
    selected.push(c);
    total += c.text.length;
  }

  const context = selected
    .map((c, i) => `[${i + 1}] (from ${c.fileName})\n${c.text}`)
    .join("\n\n");
  const sources = [...new Set(selected.map((c) => c.fileName))];
  return { context, sources };
}

export function buildSystemPrompt(
  context: string,
  sources: string[] = [],
  manifest?: string,
): string {
  const lines = [
    "You are a helpful assistant answering questions about the user's Box files.",
    "For questions about document CONTENT, answer ONLY using the context below; if it isn't there, say you don't know.",
    "For questions about which files exist or how many are indexed, use the 'Indexed documents' list below.",
    "Cite content sources using their [n] markers and name the source file(s) you relied on.",
    "Respond as quickly as possible",
  ];
  if (manifest) {
    lines.push("", `Indexed documents — ${manifest}`);
  }
  lines.push("", "Context:", context);
  return lines.join("\n");
}
