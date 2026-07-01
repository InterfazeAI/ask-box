export function chunkText(
  text: string,
  opts: { size?: number; overlap?: number; maxChars?: number } = {},
): string[] {
  const size = opts.size ?? 800;
  const overlap = opts.overlap ?? 100;
  // Hard safety cap so no single chunk can exceed the embedding input limit —
  // guards pathological input (giant tokens / no whitespace) and huge words.
  const maxChars = opts.maxChars ?? 6000;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const step = Math.max(1, size - overlap);
  const chunks: string[] = [];
  for (let start = 0; start < words.length; start += step) {
    chunks.push(words.slice(start, start + size).join(" "));
    if (start + size >= words.length) break;
  }

  // Enforce the char cap: split any chunk that's still too long (e.g. a single
  // enormous "word" with no whitespace to break on).
  const capped: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxChars) {
      capped.push(chunk);
    } else {
      for (let i = 0; i < chunk.length; i += maxChars) {
        capped.push(chunk.slice(i, i + maxChars));
      }
    }
  }
  return capped;
}
