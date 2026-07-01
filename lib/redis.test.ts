import { describe, it, expect } from "vitest";
import { buildStatusEvent, tokensKey, filesKey, fileKey } from "@/lib/redis";

describe("buildStatusEvent", () => {
  it("serializes a status to a publishable event string", () => {
    const evt = buildStatusEvent({
      fileId: "1", name: "a.pdf", stage: "indexed", chunkCount: 5, updatedAt: 123,
    });
    expect(JSON.parse(evt)).toMatchObject({ fileId: "1", stage: "indexed", chunkCount: 5 });
  });
});

describe("per-account key builders", () => {
  it("namespaces every key by the account id", () => {
    expect(tokensKey("user42")).toBe("box:tokens:user42");
    expect(filesKey("user42")).toBe("files:user42");
    expect(fileKey("user42", "9")).toBe("file:user42:9");
  });

  it("keeps different accounts' file keys disjoint", () => {
    expect(fileKey("a", "1")).not.toBe(fileKey("b", "1"));
  });
});
