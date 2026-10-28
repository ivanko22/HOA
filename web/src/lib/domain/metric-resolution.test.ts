import { describe, expect, it } from "vitest";
import {
  deriveCollectionRate,
  METRIC_DEFINITIONS,
  resolveMetricFromFacts,
  type ResolvedMetricCandidate,
} from "./metric-resolution";

function candidate(
  partial: Partial<ResolvedMetricCandidate> &
    Pick<ResolvedMetricCandidate, "id" | "factType" | "numericValue">,
): ResolvedMetricCandidate {
  return {
    value: null,
    verificationStatus: "reported",
    periodStart: null,
    periodEnd: null,
    asOfDate: "2026-10-01",
    documentId: "doc-1",
    label: partial.factType,
    unit: "USD",
    sourceReference: "minutes",
    sourcePage: null,
    sourceExcerpt: null,
    notes: null,
    verifiedAt: null,
    ...partial,
  };
}

const period = {
  start: "2026-01-01",
  end: "2026-12-31",
  label: "FY 2026",
};

describe("resolveMetricFromFacts", () => {
  it("returns unknown when no facts", () => {
    const result = resolveMetricFromFacts(
      METRIC_DEFINITIONS.cash,
      [],
      period,
    );
    expect(result.value).toBeNull();
    expect(result.verificationStatus).toBe("unknown");
    expect(result.factId).toBeNull();
  });

  it("prefers verified over reported", () => {
    const result = resolveMetricFromFacts(
      METRIC_DEFINITIONS.special_assessment_collected,
      [
        candidate({
          id: "r",
          factType: "special_assessment_collected",
          numericValue: "100.00",
          verificationStatus: "reported",
        }),
        candidate({
          id: "v",
          factType: "special_assessment_collected",
          numericValue: "17973.00",
          verificationStatus: "verified",
          documentId: "doc-2",
        }),
      ],
      period,
    );
    expect(result.value).toBe("17973.00");
    expect(result.verificationStatus).toBe("verified");
    expect(result.factId).toBe("v");
    expect(result.documentId).toBe("doc-2");
  });

  it("falls back to reported when no verified", () => {
    const result = resolveMetricFromFacts(
      METRIC_DEFINITIONS.special_assessment_collected,
      [
        candidate({
          id: "r",
          factType: "special_assessment_collected",
          numericValue: "17973.00",
          verificationStatus: "reported",
          sourceReference: "Oct 1 minutes",
        }),
      ],
      period,
    );
    expect(result.value).toBe("17973.00");
    expect(result.verificationStatus).toBe("reported");
    expect(result.sourceReference).toBe("Oct 1 minutes");
  });

  it("returns conflicting without choosing a value", () => {
    const result = resolveMetricFromFacts(
      METRIC_DEFINITIONS.special_assessment_collected,
      [
        candidate({
          id: "a",
          factType: "special_assessment_collected",
          numericValue: "17973.00",
        }),
        candidate({
          id: "b",
          factType: "special_assessment_collected",
          numericValue: "100.00",
          documentId: "doc-2",
        }),
      ],
      period,
    );
    expect(result.verificationStatus).toBe("conflicting");
    expect(result.value).toBeNull();
    expect(result.candidates).toHaveLength(2);
    expect(result.factId).toBeNull();
  });

  it("keeps unknown when numeric is null", () => {
    const result = resolveMetricFromFacts(
      METRIC_DEFINITIONS.cash,
      [
        candidate({
          id: "u",
          factType: "cash_balance",
          numericValue: null,
          verificationStatus: "needs_review",
        }),
      ],
      period,
    );
    expect(result.value).toBeNull();
    expect(result.verificationStatus).toBe("needs_review");
  });

  it("excludes facts outside the requested period", () => {
    const result = resolveMetricFromFacts(
      METRIC_DEFINITIONS.base_operating_expenses,
      [
        candidate({
          id: "old",
          factType: "operating_expenses",
          numericValue: "1.00",
          periodStart: "2024-01-01",
          periodEnd: "2024-12-31",
          asOfDate: null,
          label: "September expenses",
        }),
      ],
      period,
    );
    expect(result.value).toBeNull();
    expect(result.verificationStatus).toBe("unknown");
  });
});

describe("deriveCollectionRate", () => {
  it("derives reported rate from collected and potential", () => {
    const collected = resolveMetricFromFacts(
      METRIC_DEFINITIONS.dues_collected,
      [
        candidate({
          id: "c",
          factType: "monthly_dues_collected",
          numericValue: "41195.00",
          label: "Average dues collected",
        }),
      ],
      period,
    );
    const potential = resolveMetricFromFacts(
      {
        id: "dues_collected",
        label: "Potential",
        factTypes: ["potential_dues_full_collection"],
        unit: "USD",
      },
      [
        candidate({
          id: "p",
          factType: "potential_dues_full_collection",
          numericValue: "50000.00",
        }),
      ],
      period,
    );
    const rate = deriveCollectionRate(collected, potential, period);
    expect(rate.value).toBe("82.39");
    expect(rate.verificationStatus).toBe("reported");
    expect(rate.unit).toBe("%");
  });

  it("stays unknown when potential is missing", () => {
    const collected = resolveMetricFromFacts(
      METRIC_DEFINITIONS.dues_collected,
      [
        candidate({
          id: "c",
          factType: "monthly_dues_collected",
          numericValue: "41195.00",
          label: "Average dues collected",
        }),
      ],
      period,
    );
    const potential = resolveMetricFromFacts(
      {
        id: "dues_collected",
        label: "Potential",
        factTypes: ["potential_dues_full_collection"],
        unit: "USD",
      },
      [],
      period,
    );
    const rate = deriveCollectionRate(collected, potential, period);
    expect(rate.value).toBeNull();
    expect(rate.verificationStatus).toBe("unknown");
  });
});
