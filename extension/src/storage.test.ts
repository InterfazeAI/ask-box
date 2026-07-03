import { describe, it, expect, beforeEach, vi } from "vitest";
import { getStoredSid, setStoredSid, clearStoredSid } from "./storage";

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
