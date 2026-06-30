export function chunkText(
  text: string,
  opts: { size?: number; overlap?: number } = {},
): string[] {
  const size = opts.size ?? 800;
  const overlap = opts.overlap ?? 100;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const step = Math.max(1, size - overlap);
  const chunks: string[] = [];
  for (let start = 0; start < words.length; start += step) {
    chunks.push(words.slice(start, start + size).join(" "));
    if (start + size >= words.length) break;
  }
  return chunks;
}
