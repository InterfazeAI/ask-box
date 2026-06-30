import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.JIGSAWSTACK_API_KEY = "test";

describe("embed", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the inner embedding vector for the first chunk", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embeddings: [[0.1, 0.2, 0.3]], chunks: ["x"] }),
      }),
    );
    const { embed } = await import("@/lib/jigsawstack");

    const result = await embed("hello");

    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it("throws when the response has no embedding vectors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embeddings: [], chunks: [] }),
      }),
    );
    const { embed } = await import("@/lib/jigsawstack");

    await expect(embed("x")).rejects.toThrow("unexpected response shape");
  });

  it("throws on a non-ok HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "unauthorized",
      }),
    );
    const { embed } = await import("@/lib/jigsawstack");

    await expect(embed("x")).rejects.toThrow("v2 failed");
  });
});
