import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/chunk";

describe("chunkText", () => {
  it("returns [] for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n ")).toEqual([]);
  });

  it("returns one chunk when under size", () => {
    expect(chunkText("hello world foo")).toEqual(["hello world foo"]);
  });

  it("splits into overlapping windows", () => {
    const words = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
    const chunks = chunkText(words, { size: 10, overlap: 2 });
    expect(chunks.length).toBe(4); // windows starting at 0,8,16,24
    expect(chunks[0].split(" ").length).toBe(10);
    expect(chunks[1].startsWith("w8")).toBe(true); // overlap of 2
  });
});
