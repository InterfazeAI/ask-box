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

import { getValidAccessToken, withFreshTokenRetry, BoxAuthError } from "@/lib/box";
import { getBoxTokens, setBoxTokens, clearBoxTokens } from "@/lib/redis";
import { BoxSdkError } from "box-typescript-sdk-gen/box/errors";

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

// What BoxDeveloperTokenAuth throws when a Box API call gets an in-flight 401
// (revocation kills the access token before its expiresAt): the SDK retry
// layer asks the auth provider to refresh, which a developer-token auth can't.
function devTokenExpired(): BoxSdkError {
  return new BoxSdkError({
    message: "Developer token has expired. Please provide a new one.",
  });
}

describe("withFreshTokenRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBoxTokens).mockResolvedValue(fresh);
  });

  it("returns the result without refreshing when the call succeeds", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withFreshTokenRetry("u1", fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledWith("at");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("force-refreshes on an in-flight 401 and retries once with the new token", async () => {
    refreshMock.mockResolvedValue({ accessToken: "new", refreshToken: "rt2", expiresIn: 3600 });
    const fn = vi.fn().mockRejectedValueOnce(devTokenExpired()).mockResolvedValue("ok");
    await expect(withFreshTokenRetry("u1", fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenNthCalledWith(2, "new");
  });

  it("maps in-flight 401 + rejected refresh to BoxAuthError (revoked grant)", async () => {
    refreshMock.mockRejectedValue(apiError(400));
    const fn = vi.fn().mockRejectedValue(devTokenExpired());
    await expect(withFreshTokenRetry("u1", fn)).rejects.toBeInstanceOf(BoxAuthError);
    expect(clearBoxTokens).toHaveBeenCalledWith("u1");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("also treats our raw-fetch helpers' 401s as an expired access token", async () => {
    refreshMock.mockResolvedValue({ accessToken: "new", refreshToken: "rt2", expiresIn: 3600 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Box upload failed (401): unauthorized"))
      .mockResolvedValue("ok");
    await expect(withFreshTokenRetry("u1", fn)).resolves.toBe("ok");
  });

  it("rethrows non-auth errors without refreshing or retrying", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Box upload failed (503): down"));
    await expect(withFreshTokenRetry("u1", fn)).rejects.toThrow("(503)");
    expect(refreshMock).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
