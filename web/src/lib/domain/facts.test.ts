import { describe, expect, it } from "vitest";
import {
  aggregateMetricFacts,
  detectConflicts,
  periodsOverlap,
  resolveDocumentProcessingStatus,
} from "./facts";
import type { FactLike } from "./facts";

function fact(partial: Partial<FactLike> & Pick<FactLike, "id">): FactLike {
  return {
    factType: "operating_expenses",
    numericValue: "100.00",
    value: null,
    verificationStatus: "reported",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    asOfDate: "2026-10-01",
    documentId: "doc-1",
    ...partial,
  };
}

describe("periodsOverlap", () => {
  it("detects overlapping months", () => {
    expect(
      periodsOverlap(
        { periodStart: "2026-09-01", periodEnd: "2026-09-30", asOfDate: null },
        { periodStart: "2026-09-15", periodEnd: "2026-10-15", asOfDate: null },
      ),
    ).toBe(true);
  });

  it("uses asOfDate when period missing", () => {
    expect(
      periodsOverlap(
        { periodStart: null, periodEnd: null, asOfDate: "2026-10-01" },
        { periodStart: null, periodEnd: null, asOfDate: "2026-10-01" },
      ),
    ).toBe(true);
  });
});

describe("detectConflicts", () => {
  it("flags differing numeric values for same type and period", () => {
    const peers = [fact({ id: "a", numericValue: "108476.00" })];
    const result = detectConflicts(
      {
        factType: "operating_expenses",
        numericValue: "90000.00",
        value: null,
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        asOfDate: null,
      },
      peers,
    );
    expect(result.isConflict).toBe(true);
    expect(result.conflictingIds).toEqual(["a"]);
  });

  it("does not overwrite semantics — same value is not a conflict", () => {
    const peers = [fact({ id: "a", numericValue: "108476.00" })];
    const result = detectConflicts(
      {
        factType: "operating_expenses",
        numericValue: "108476.00",
        value: null,
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        asOfDate: null,
      },
      peers,
    );
    expect(result.isConflict).toBe(false);
  });
});

describe("aggregateMetricFacts", () => {
  it("returns unknown null amount when no facts", () => {
    const result = aggregateMetricFacts([], "cash_balance");
    expect(result.amount.amount).toBeNull();
    expect(result.status).toBe("unknown");
  });

  it("never coerces missing numeric to zero", () => {
    const result = aggregateMetricFacts(
      [
        fact({
          id: "1",
          factType: "cash_balance",
          numericValue: null,
          verificationStatus: "needs_review",
        }),
      ],
      "cash_balance",
    );
    expect(result.amount.amount).toBeNull();
    expect(result.amount.status).not.toBe("verified");
  });

  it("prefers verified over reported", () => {
    const result = aggregateMetricFacts(
      [
        fact({
          id: "1",
          factType: "monthly_dues_collected",
          numericValue: "41195.00",
          verificationStatus: "reported",
        }),
        fact({
          id: "2",
          factType: "monthly_dues_collected",
          numericValue: "42000.00",
          verificationStatus: "verified",
          documentId: "doc-2",
        }),
      ],
      "monthly_dues_collected",
    );
    // Conflict on different numbers → conflicting
    expect(result.status).toBe("conflicting");
    expect(result.amount.amount).toBeNull();
  });

  it("surfaces reported amount when only reported exists", () => {
    const result = aggregateMetricFacts(
      [
        fact({
          id: "1",
          factType: "special_assessment_collected",
          numericValue: "17973.00",
          verificationStatus: "reported",
          periodStart: null,
          periodEnd: null,
        }),
      ],
      "special_assessment_collected",
    );
    expect(result.amount.amount).toBe("17973.00");
    expect(result.status).toBe("reported");
  });
});

describe("resolveDocumentProcessingStatus", () => {
  it("source_only with no facts", () => {
    expect(resolveDocumentProcessingStatus([])).toBe("source_only");
  });

  it("verified only when all verified", () => {
    expect(
      resolveDocumentProcessingStatus([
        { verificationStatus: "verified" },
        { verificationStatus: "verified" },
      ]),
    ).toBe("verified");
  });

  it("partially_verified when mixed", () => {
    expect(
      resolveDocumentProcessingStatus([
        { verificationStatus: "verified" },
        { verificationStatus: "reported" },
      ]),
    ).toBe("partially_verified");
  });
});
