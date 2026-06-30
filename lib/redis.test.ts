import { describe, it, expect } from "vitest";
import { buildStatusEvent } from "@/lib/redis";

describe("buildStatusEvent", () => {
  it("serializes a status to a publishable event string", () => {
    const evt = buildStatusEvent({
      fileId: "1", name: "a.pdf", stage: "indexed", chunkCount: 5, updatedAt: 123,
    });
    expect(JSON.parse(evt)).toMatchObject({ fileId: "1", stage: "indexed", chunkCount: 5 });
  });
});
