import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock every side-effecting dependency so we can assert the video guard fires
// before any extract/embed/index work happens.
const downloadFile = vi.fn();
const extractText = vi.fn();
const embed = vi.fn();
const upsertChunks = vi.fn();
const setFileStatus = vi.fn();

vi.mock("@/lib/box", () => ({ downloadFile: (...a: unknown[]) => downloadFile(...a) }));
vi.mock("@/lib/interfaze", () => ({ extractText: (...a: unknown[]) => extractText(...a) }));
vi.mock("@/lib/jigsawstack", () => ({ embed: (...a: unknown[]) => embed(...a) }));
vi.mock("@/lib/vector", () => ({ upsertChunks: (...a: unknown[]) => upsertChunks(...a) }));
vi.mock("@/lib/redis", () => ({ setFileStatus: (...a: unknown[]) => setFileStatus(...a) }));

describe("processFile — video guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a video file and never extracts or embeds it", async () => {
    downloadFile.mockResolvedValue({ name: "recording.mp4", buffer: new Uint8Array() });
    const { processFile } = await import("@/lib/process");

    await expect(processFile("user1", "f1", "recording.mp4")).rejects.toThrow(
      /video files are not supported/i,
    );

    expect(extractText).not.toHaveBeenCalled();
    expect(embed).not.toHaveBeenCalled();
    expect(upsertChunks).not.toHaveBeenCalled();
    // The failure is recorded as an "error" status so the UI reflects it.
    expect(setFileStatus).toHaveBeenCalledWith(
      "user1",
      expect.objectContaining({ fileId: "f1", stage: "error" }),
    );
  });

  it("proceeds past the guard for a non-video file", async () => {
    downloadFile.mockResolvedValue({ name: "report.pdf", buffer: new Uint8Array() });
    extractText.mockResolvedValue("hello world");
    embed.mockResolvedValue([0.1, 0.2, 0.3]);
    upsertChunks.mockResolvedValue(undefined);
    const { processFile } = await import("@/lib/process");

    const count = await processFile("user1", "f2", "report.pdf");

    expect(extractText).toHaveBeenCalledOnce();
    expect(count).toBeGreaterThan(0);
  });
});
