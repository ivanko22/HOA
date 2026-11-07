import { describe, expect, it } from "vitest";
import { classifySyncFile, MAX_SYNC_FILE_BYTES } from "./sync-file";

describe("classifySyncFile", () => {
  it("leaves meeting recordings on Drive for later transcription", () => {
    const plan = classifySyncFile({
      name: "ECM #4 10.14.2026.m4a",
      mimeType: "audio/mp4",
      sizeBytes: 48 * 1024 * 1024,
    });
    expect(plan.action).toBe("skip");
    if (plan.action !== "skip") return;
    expect(plan.status).toBe("pending_transcription");
    expect(plan.reason).toMatch(/transcription/i);
    expect(plan.reason).toMatch(/not downloaded/i);
    expect(plan.reason).toMatch(/Google Drive/);
  });

  it("does not download a small audio file either", () => {
    const plan = classifySyncFile({
      name: "notes.mp3",
      mimeType: "application/octet-stream",
      sizeBytes: 200_000,
    });
    expect(plan).toMatchObject({ action: "skip", status: "pending_transcription" });
  });

  it("marks video and images unsupported instead of failed", () => {
    expect(
      classifySyncFile({ name: "walkthrough.mp4", mimeType: "video/mp4" }),
    ).toMatchObject({ action: "skip", status: "unsupported" });
    expect(
      classifySyncFile({ name: "photo.jpg", mimeType: "image/jpeg" }),
    ).toMatchObject({ action: "skip", status: "unsupported" });
  });

  it("skips oversized statements without calling them failures", () => {
    const plan = classifySyncFile({
      name: "September 2026 financial statement.pdf",
      mimeType: "application/pdf",
      sizeBytes: MAX_SYNC_FILE_BYTES + 1,
    });
    expect(plan.action).toBe("skip");
    if (plan.action !== "skip") return;
    expect(plan.status).toBe("oversized");
    expect(plan.reason).toMatch(/12 MB/);
    expect(plan.reason).toMatch(/Google Drive/);
  });

  it("downloads a normal financial statement", () => {
    expect(
      classifySyncFile({
        name: "balance-sheet.pdf",
        mimeType: "application/pdf",
        sizeBytes: 400_000,
      }),
    ).toEqual({ action: "download" });
  });
});
