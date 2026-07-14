import { describe, it, expect, beforeEach, vi } from "vitest";
import { BoxApiError } from "box-typescript-sdk-gen/box/errors";

const refreshMock = vi.hoisted(() => vi.fn());
vi.mock("box-typescript-sdk-gen/managers", () => ({
  AuthorizationManager: class {
    refreshAccessToken = refreshMock;
    requestAccessToken = vi.fn();
  },
}));
vi.mock("@/lib/redis", () => ({
  getBoxTokens: vi.fn(),
  setBoxTokens: vi.fn(),
  clearBoxTokens: vi.fn(),
}));

import { getValidAccessToken, BoxAuthError } from "@/lib/box";
import { getBoxTokens, setBoxTokens, clearBoxTokens } from "@/lib/redis";

// Mirrors what the SDK's networking layer actually throws: message is
// "<status> <text>; Request ID: <id>", and in the ESM build `responseInfo`
// is wiped to undefined by class-field define semantics — which is exactly
// the case the classifier must handle.
function apiError(statusCode: number): BoxApiError {
  return new BoxApiError({
    message: `${statusCode} error; Request ID: test`,
    requestInfo: { method: "POST", url: "", queryParams: {}, headers: {} },
    responseInfo: { statusCode, headers: {} },
  } as ConstructorParameters<typeof BoxApiError>[0]);
}

const fresh = { accessToken: "at", refreshToken: "rt", expiresAt: Date.now() + 3_600_000 };
const expired = { accessToken: "old", refreshToken: "rt", expiresAt: Date.now() - 1_000 };

describe("getValidAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws BoxAuthError when no tokens are stored", async () => {
    vi.mocked(getBoxTokens).mockResolvedValue(null);
    await expect(getValidAccessToken("u1")).rejects.toBeInstanceOf(BoxAuthError);
  });

  it("returns the stored token without refreshing when unexpired", async () => {
    vi.mocked(getBoxTokens).mockResolvedValue(fresh);
    await expect(getValidAccessToken("u1")).resolves.toBe("at");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("refreshes an expired token and stores the result", async () => {
    vi.mocked(getBoxTokens).mockResolvedValue(expired);
    refreshMock.mockResolvedValue({ accessToken: "new", refreshToken: "rt2", expiresIn: 3600 });
    await expect(getValidAccessToken("u1")).resolves.toBe("new");
    expect(setBoxTokens).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ accessToken: "new", refreshToken: "rt2" }),
    );
  });

  it("maps a rejected refresh (invalid_grant 400) to BoxAuthError and clears dead tokens", async () => {
    vi.mocked(getBoxTokens).mockResolvedValue(expired);
    refreshMock.mockRejectedValue(apiError(400));
    await expect(getValidAccessToken("u1")).rejects.toBeInstanceOf(BoxAuthError);
    expect(clearBoxTokens).toHaveBeenCalledWith("u1");
  });

  it("rethrows a transient Box 5xx as-is (not BoxAuthError, tokens kept)", async () => {
    vi.mocked(getBoxTokens).mockResolvedValue(expired);
    refreshMock.mockRejectedValue(apiError(503));
    await expect(getValidAccessToken("u1")).rejects.toBeInstanceOf(BoxApiError);
    expect(clearBoxTokens).not.toHaveBeenCalled();
  });

  it("rethrows a network error as-is (tokens kept)", async () => {
    vi.mocked(getBoxTokens).mockResolvedValue(expired);
    refreshMock.mockRejectedValue(new Error("fetch failed"));
    await expect(getValidAccessToken("u1")).rejects.toThrow("fetch failed");
    expect(clearBoxTokens).not.toHaveBeenCalled();
  });
});
