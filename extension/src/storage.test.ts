import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getBaseUrl,
  setBaseUrl,
  normalizeBaseUrl,
  DEFAULT_BASE_URL,
  getStoredSid,
  setStoredSid,
  clearStoredSid,
} from "./storage";

function mockChromeStorage() {
  const make = () => {
    let store: Record<string, unknown> = {};
    return {
      get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
      set: vi.fn(async (items: Record<string, unknown>) => {
        store = { ...store, ...items };
      }),
      remove: vi.fn(async (key: string) => {
        const { [key]: _, ...rest } = store;
        store = rest;
      }),
    };
  };
  return { sync: make(), local: make() };
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

describe("sid storage", () => {
  beforeEach(() => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: mockChromeStorage(),
    };
  });

  it("returns null when no sid stored", async () => {
    expect(await getStoredSid()).toBeNull();
  });

  it("round-trips a sid", async () => {
    await setStoredSid("bare.sig");
    expect(await getStoredSid()).toBe("bare.sig");
  });

  it("clears a sid", async () => {
    await setStoredSid("bare.sig");
    await clearStoredSid();
    expect(await getStoredSid()).toBeNull();
  });
});
