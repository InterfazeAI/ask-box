import { describe, it, expect, beforeAll } from "vitest";
import { signSid, verifySid, getSid } from "@/lib/session";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret";
});

// Minimal stand-in for the parts of NextRequest that getSid touches.
function fakeReq(opts: { header?: string; cookie?: string }) {
  return {
    headers: {
      get: (k: string) => (k === "x-askbox-sid" ? opts.header ?? null : null),
    },
    cookies: {
      get: (k: string) =>
        k === "sid" && opts.cookie ? { value: opts.cookie } : undefined,
    },
  } as unknown as import("next/server").NextRequest;
}

describe("getSid", () => {
  it("reads a valid x-askbox-sid header", async () => {
    const signed = await signSid("hdr-user");
    expect(await getSid(fakeReq({ header: signed }))).toBe("hdr-user");
  });

  it("falls back to the sid cookie when no header", async () => {
    const signed = await signSid("cookie-user");
    expect(await getSid(fakeReq({ cookie: signed }))).toBe("cookie-user");
  });

  it("ignores a tampered header and falls back to the cookie", async () => {
    const good = await signSid("cookie-user");
    expect(
      await getSid(fakeReq({ header: "evil.deadbeef", cookie: good })),
    ).toBe("cookie-user");
  });

  it("returns null when neither is present", async () => {
    expect(await getSid(fakeReq({}))).toBeNull();
  });
});

describe("signSid / verifySid", () => {
  it("round-trips a valid signed sid", async () => {
    const signed = await signSid("abc-123");
    expect(signed.startsWith("abc-123.")).toBe(true);
    expect(await verifySid(signed)).toBe("abc-123");
  });

  it("rejects a tampered payload", async () => {
    const signed = await signSid("abc-123");
    const tampered = "evil-999." + signed.split(".")[1];
    expect(await verifySid(tampered)).toBeNull();
  });

  it("rejects a missing/garbage cookie", async () => {
    expect(await verifySid(undefined)).toBeNull();
    expect(await verifySid("no-dot")).toBeNull();
  });

  it("rejects a signature made with a different secret", async () => {
    const signed = await signSid("abc-123");
    process.env.SESSION_SECRET = "other-secret";
    const result = await verifySid(signed);
    process.env.SESSION_SECRET = "test-secret";
    expect(result).toBeNull();
  });
});
