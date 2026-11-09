import { describe, expect, it } from "vitest";
import { normalizeSyncReport } from "./sync-report";

describe("normalizeSyncReport", () => {
  it("treats the default empty jsonb report as no report", () => {
    expect(normalizeSyncReport({})).toBeNull();
    expect(normalizeSyncReport(null)).toBeNull();
  });

  it("fills missing arrays so a partial report can render", () => {
    const report = normalizeSyncReport({
      status: "running",
      totals: { discovered: 2, files: 1 },
    });
    expect(report?.status).toBe("running");
    expect(report?.totals.discovered).toBe(2);
    expect(report?.totals.snapshotted).toBe(0);
    expect(report?.tree).toEqual([]);
    expect(report?.missingYears).toEqual([]);
    expect(report?.categoryCounts).toEqual({});
  });

  it("drops values that cannot be rendered", () => {
    const report = normalizeSyncReport({
      status: "failed",
      totals: { discovered: "many", errors: 3 },
      tree: [null, { path: "/Minutes/a.pdf", isFolder: false }, "nope"],
      categoryCounts: { Minutes: 2, bad: { n: 1 } },
      missingCredentials: "GOOGLE_DRIVE_API_KEY",
      missingYears: [null, { year: 2025, status: "missing", note: "none" }],
      discoveries: [{ text: "object" }, "2025 minutes found"],
      fileErrors: [null, { path: "/a.pdf", error: "ENOENT" }],
      matchedTargets: [{ key: "dues", label: "Dues", expected: 120, found: { n: 1 } }],
    });
    expect(report?.totals.discovered).toBe(0);
    expect(report?.totals.errors).toBe(3);
    expect(report?.tree).toEqual([
      { id: "", name: "", path: "/Minutes/a.pdf", isFolder: false, mimeType: undefined },
    ]);
    expect(report?.categoryCounts).toEqual({ Minutes: 2 });
    expect(report?.missingCredentials).toEqual([]);
    expect(report?.missingYears).toEqual([
      { year: 2025, status: "missing", note: "none", documents: [] },
    ]);
    expect(report?.discoveries).toEqual(["2025 minutes found"]);
    expect(report?.fileErrors).toEqual([
      {
        path: "/a.pdf",
        error: "ENOENT",
        status: "failed",
        driveFileId: undefined,
        webViewLink: undefined,
        documentId: undefined,
      },
    ]);
    expect(
      normalizeSyncReport({
        status: "completed",
        fileErrors: [
          {
            path: "/Minutes/Recordings/ECM #4 10.14.2026.m4a",
            error: "download timed out",
          },
          {
            path: "/Financials/statement.pdf",
            error: "Skipped. This file is about 40 MB, over the 12 MB sync limit. Open it on Drive.",
            driveFileId: "abc123",
          },
        ],
      })?.fileErrors.map((item) => [item.status, item.webViewLink]),
    ).toEqual([
      ["pending_transcription", undefined],
      ["oversized", "https://drive.google.com/file/d/abc123/view"],
    ]);
    expect(report?.matchedTargets[0]?.expected).toBe("120");
    expect(report?.matchedTargets[0]?.found).toBe("");
  });
});
