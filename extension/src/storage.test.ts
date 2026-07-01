import { describe, it, expect, beforeEach, vi } from "vitest";
import { getBaseUrl, setBaseUrl, normalizeBaseUrl, DEFAULT_BASE_URL } from "./storage";

function mockChromeStorage() {
  let store: Record<string, unknown> = {};
  return {
    sync: {
      get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
      set: vi.fn(async (items: Record<string, unknown>) => {
        store = { ...store, ...items };
      }),
    },
  };
}

describe("storage", () => {
  beforeEach(() => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: mockChromeStorage(),
    };
  });

  it("returns the default when nothing is stored", async () => {
    expect(await getBaseUrl()).toBe(DEFAULT_BASE_URL);
  });

  it("round-trips a saved URL", async () => {
    await setBaseUrl("https://example.com");
    expect(await getBaseUrl()).toBe("https://example.com");
  });

  it("strips trailing slashes when normalizing", () => {
    expect(normalizeBaseUrl("https://example.com/")).toBe("https://example.com");
  });

  it("trims whitespace when normalizing", () => {
    expect(normalizeBaseUrl("  http://localhost:3000  ")).toBe("http://localhost:3000");
  });

  it("throws for a URL without an http(s) scheme", () => {
    expect(() => normalizeBaseUrl("example.com")).toThrow();
  });
});
