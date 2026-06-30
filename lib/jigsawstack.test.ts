import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JIGSAWSTACK_API_KEY = "test";

const embeddingMock = vi.fn();

vi.mock("jigsawstack", () => ({
  JigsawStack: () => ({
    embedding: embeddingMock,
  }),
}));

describe("embed", () => {
  beforeEach(() => {
    embeddingMock.mockReset();
  });

  it("returns the inner embedding vector for the first chunk", async () => {
    embeddingMock.mockResolvedValue({ embeddings: [[0.1, 0.2, 0.3]], chunks: ["x"] });
    const { embed } = await import("@/lib/jigsawstack");

    const result = await embed("hello");

    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it("throws when the response has no embedding vectors", async () => {
    embeddingMock.mockResolvedValue({ embeddings: [], chunks: [] });
    const { embed } = await import("@/lib/jigsawstack");

    await expect(embed("x")).rejects.toThrow("unexpected response shape");
  });
});
