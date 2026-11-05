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
});
