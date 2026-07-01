import { describe, it, expect } from "vitest";
import { buildContext, buildSystemPrompt } from "@/lib/prompt";

const chunks = [
  { fileId: "1", fileName: "a.pdf", chunkIdx: 0, text: "alpha" },
  { fileId: "1", fileName: "a.pdf", chunkIdx: 1, text: "beta" },
  { fileId: "2", fileName: "b.docx", chunkIdx: 0, text: "gamma" },
];

describe("prompt", () => {
  it("builds numbered context and deduped sources", () => {
    const { context, sources } = buildContext(chunks);
    expect(context).toContain("[1]");
    expect(context).toContain("alpha");
    expect(sources).toEqual(["a.pdf", "b.docx"]);
  });

  it("embeds context into the system prompt", () => {
    expect(buildSystemPrompt("CTX")).toContain("CTX");
  });
});
