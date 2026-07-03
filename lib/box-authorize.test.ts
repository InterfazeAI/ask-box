import { describe, it, expect, beforeAll } from "vitest";
import { isValidExtensionRedirectUri, getExtensionAuthorizeUrl } from "@/lib/box";

beforeAll(() => {
  process.env.BOX_CLIENT_ID = "test-client";
});

describe("isValidExtensionRedirectUri", () => {
  it("accepts a chromiumapp.org https URL", () => {
    expect(isValidExtensionRedirectUri("https://abcdefghijklmnop.chromiumapp.org/")).toBe(true);
  });
  it("rejects other hosts", () => {
    expect(isValidExtensionRedirectUri("https://evil.com/")).toBe(false);
  });
  it("rejects http scheme", () => {
    expect(isValidExtensionRedirectUri("http://abc.chromiumapp.org/")).toBe(false);
  });
  it("rejects a lookalike host", () => {
    expect(isValidExtensionRedirectUri("https://chromiumapp.org.evil.com/")).toBe(false);
  });
  it("rejects garbage", () => {
    expect(isValidExtensionRedirectUri("not-a-url")).toBe(false);
  });
});

describe("getExtensionAuthorizeUrl", () => {
  it("includes client_id, redirect_uri, state, response_type", () => {
    const url = new URL(getExtensionAuthorizeUrl("st8", "https://abc.chromiumapp.org/"));
    expect(url.origin + url.pathname).toBe("https://account.box.com/api/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-client");
    expect(url.searchParams.get("redirect_uri")).toBe("https://abc.chromiumapp.org/");
    expect(url.searchParams.get("state")).toBe("st8");
    expect(url.searchParams.get("response_type")).toBe("code");
  });
});
