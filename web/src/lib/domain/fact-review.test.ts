import { describe, expect, it } from "vitest";
import {
  conflictingFactIds,
  correctionPatch,
  factMatchesReviewFilter,
} from "./fact-review";

const september = {
  id: "cash",
  factType: "cash_balance",
  label: "Cash balance",
  numericValue: "12345.67",
  originalNumericValue: null,
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  asOfDate: "2026-09-30",
  verificationStatus: "needs_review" as const,
  sourceExcerpt: "Cash balance $12,345.67",
  sourcePage: "1",
  sourceReference: "google_drive_sync",
};

describe("fact review", () => {
  it("filters by year, month, metric, and status", () => {
    expect(
      factMatchesReviewFilter(september, { year: 2026, month: 9, factType: "cash_balance", status: "needs_review" }),
    ).toBe(true);
    expect(factMatchesReviewFilter(september, { year: 2026, month: 10 })).toBe(false);
    expect(factMatchesReviewFilter(september, { year: 2025 })).toBe(false);
    expect(factMatchesReviewFilter(september, { factType: "operating_income" })).toBe(false);
    expect(factMatchesReviewFilter(september, { status: "verified" })).toBe(false);
  });

  it("flags different amounts for the same metric and period", () => {
    const ids = conflictingFactIds([
      september,
      { ...september, id: "other", numericValue: "100.00" },
      { ...september, id: "rejected", numericValue: "5.00", verificationStatus: "rejected" },
    ]);
    expect(ids.has("cash")).toBe(true);
    expect(ids.has("other")).toBe(true);
    expect(ids.has("rejected")).toBe(false);
  });

  it("keeps the extracted amount and evidence when a value is corrected", () => {
    const next = correctionPatch(september, "$12,300.00");
    expect(next.numericValue).toBe("12300.00");
    expect(next.originalNumericValue).toBe("12345.67");
    expect(next.sourceExcerpt).toBe(september.sourceExcerpt);
    expect(next.sourcePage).toBe("1");
    expect(next.sourceReference).toBe("google_drive_sync");
    expect(next.verificationStatus).toBe("needs_review");
    const again = correctionPatch(next, "12300");
    expect(again.originalNumericValue).toBe("12345.67");
  });
});
