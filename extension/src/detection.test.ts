import { describe, it, expect, beforeEach, vi } from "vitest";
import { maybeDetectDisplayMode } from "./detection";
import { DISPLAY_MODE_KEY } from "./storage";

function mockChrome({
  stored,
  tab,
  injectionResult,
  injectionError,
}: {
  stored?: string;
  tab?: { id?: number };
  injectionResult?: unknown;
  injectionError?: boolean;
} = {}) {
  let store: Record<string, unknown> =
    stored !== undefined ? { [DISPLAY_MODE_KEY]: stored } : {};
  const chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
        set: vi.fn(async (items: Record<string, unknown>) => {
          store = { ...store, ...items };
        }),
      },
    },
    tabs: { query: vi.fn(async () => (tab ? [tab] : [])) },
    scripting: {
      executeScript: vi.fn(async () => {
        if (injectionError) throw new Error("Cannot access contents of the page");
        return [{ result: injectionResult }];
      }),
    },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = chrome;
  return { chrome, getStored: () => store[DISPLAY_MODE_KEY] };
}

describe("maybeDetectDisplayMode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when a mode is already stored (detected or user-set)", async () => {
    const { chrome, getStored } = mockChrome({ stored: "popup" });
    await maybeDetectDisplayMode();
    expect(chrome.tabs.query).not.toHaveBeenCalled();
    expect(getStored()).toBe("popup");
  });

  it("stores popup when the page has Arc palette vars", async () => {
    const { getStored } = mockChrome({ tab: { id: 1 }, injectionResult: true });
    await maybeDetectDisplayMode();
    expect(getStored()).toBe("popup");
  });

  it("stores sidepanel when the page has no Arc palette vars", async () => {
    const { getStored } = mockChrome({ tab: { id: 1 }, injectionResult: false });
    await maybeDetectDisplayMode();
    expect(getStored()).toBe("sidepanel");
  });

  it("leaves mode unset when injection fails (chrome:// page) so it retries next open", async () => {
    const { getStored } = mockChrome({ tab: { id: 1 }, injectionError: true });
    await maybeDetectDisplayMode();
    expect(getStored()).toBeUndefined();
  });

  it("leaves mode unset when there is no active tab", async () => {
    const { chrome, getStored } = mockChrome();
    await maybeDetectDisplayMode();
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
    expect(getStored()).toBeUndefined();
  });

  it("leaves mode unset when the injection returns no verdict", async () => {
    const { getStored } = mockChrome({ tab: { id: 1 }, injectionResult: undefined });
    await maybeDetectDisplayMode();
    expect(getStored()).toBeUndefined();
  });
});
