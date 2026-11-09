import Decimal from "decimal.js";
import type { VerificationStatus } from "./enums";
import { isAuthoritativeFactStatus } from "./fact-review";
import { money } from "./money";
import {
  numericConflict,
  periodsOverlap,
  type FactLike,
} from "./facts";

export type MetricId =
  | "hoa_income"
  | "dues_collected"
  | "special_assessment_collected"
  | "base_operating_expenses"
  | "net_operating_result"
  | "cash"
  | "reserve_balance"
  | "accounts_receivable"
  | "accounts_payable"
  | "collection_rate";

export const DASHBOARD_METRIC_ORDER: MetricId[] = [
  "hoa_income",
  "dues_collected",
  "special_assessment_collected",
  "base_operating_expenses",
  "net_operating_result",
  "cash",
  "reserve_balance",
  "accounts_receivable",
  "accounts_payable",
  "collection_rate",
];

export type MetricDefinition = {
  id: MetricId;
  label: string;
  /** Primary fact type(s) to consider, in preference order. */
  factTypes: string[];
  /** Optional substring filter on label (case-insensitive). */
  preferLabelIncludes?: string[];
  unit: string;
  /** When true, value is a percentage (collection rate). */
  asPercent?: boolean;
};

export const METRIC_DEFINITIONS: Record<MetricId, MetricDefinition> = {
  hoa_income: {
    id: "hoa_income",
    label: "Monthly HOA income",
    factTypes: ["operating_income"],
    unit: "USD",
  },
  dues_collected: {
    id: "dues_collected",
    label: "Regular dues collected",
    factTypes: ["monthly_dues_collected"],
    preferLabelIncludes: ["average dues", "dues collected", "hoa dues"],
    unit: "USD",
  },
  special_assessment_collected: {
    id: "special_assessment_collected",
    label: "Assessments collected",
    factTypes: ["special_assessment_collected"],
    unit: "USD",
  },
  base_operating_expenses: {
    id: "base_operating_expenses",
    label: "Operating expenses",
    factTypes: ["base_operating_expenses", "operating_expenses"],
    preferLabelIncludes: ["base operating", "september expenses", "operating"],
    unit: "USD",
  },
  net_operating_result: {
    id: "net_operating_result",
    label: "Net operating result",
    factTypes: ["net_income"],
    unit: "USD",
  },
  cash: {
    id: "cash",
    label: "Cash balance",
    factTypes: ["cash_balance"],
    unit: "USD",
  },
  accounts_receivable: {
    id: "accounts_receivable",
    label: "Accounts Receivable",
    factTypes: ["accounts_receivable"],
    unit: "USD",
  },
  accounts_payable: {
    id: "accounts_payable",
    label: "Accounts Payable",
    factTypes: ["accounts_payable"],
    unit: "USD",
  },
  reserve_balance: {
    id: "reserve_balance",
    label: "Reserve balance",
    factTypes: ["reserve_balance"],
    unit: "USD",
  },
  collection_rate: {
    id: "collection_rate",
    label: "Collection Rate",
    factTypes: ["collection_rate"],
    unit: "%",
    asPercent: true,
  },
};

export type ResolvedMetricCandidate = FactLike & {
  label?: string | null;
  unit?: string | null;
  sourceReference?: string | null;
  sourcePage?: string | null;
  sourceExcerpt?: string | null;
  notes?: string | null;
  verifiedAt?: string | null;
};

export type ResolvedMetric = {
  metric: MetricId;
  label: string;
  value: string | null;
  unit: string;
  period: { start: string | null; end: string | null; label: string };
  verificationStatus: VerificationStatus;
  factId: string | null;
  documentId: string | null;
  sourceReference: string | null;
  sourcePage: string | null;
  sourceExcerpt: string | null;
  asOfDate: string | null;
  notes: string | null;
  candidates: ResolvedMetricCandidate[];
};

function inPeriod(
  fact: FactLike,
  period?: { start?: string; end?: string },
): boolean {
  if (!period?.start && !period?.end) return true;
  const start = period.start ?? "0000-01-01";
  const end = period.end ?? "9999-12-31";
  const fStart = fact.periodStart ?? fact.asOfDate;
  const fEnd = fact.periodEnd ?? fact.asOfDate;
  if (!fStart && !fEnd) return true; // undated facts may apply community-wide
  return periodsOverlap(
    { periodStart: fStart, periodEnd: fEnd, asOfDate: fact.asOfDate },
    { periodStart: start, periodEnd: end, asOfDate: null },
  );
}

function labelPreferred(
  fact: ResolvedMetricCandidate,
  prefer?: string[],
): boolean {
  if (!prefer?.length) return true;
  const label = (fact.label ?? "").toLowerCase();
  return prefer.some((p) => label.includes(p.toLowerCase()));
}

/**
 * Pure metric resolution.
 * 1. Prefer verified
 * 2. Else reported
 * 3. Never silently resolve conflicts — return conflicting + all candidates
 * 4. Unknown/null stay unknown/null — never zero
 */
export function resolveMetricFromFacts(
  definition: MetricDefinition,
  facts: ResolvedMetricCandidate[],
  period: { start: string; end: string; label: string },
): ResolvedMetric {
  const empty: ResolvedMetric = {
    metric: definition.id,
    label: definition.label,
    value: null,
    unit: definition.unit,
    period: {
      start: period.start,
      end: period.end,
      label: period.label,
    },
    verificationStatus: "unknown",
    factId: null,
    documentId: null,
    sourceReference: null,
    sourcePage: null,
    sourceExcerpt: null,
    asOfDate: null,
    notes: null,
    candidates: [],
  };

  // Prefer earlier factTypes in the definition when they have in-period facts.
  let typed: ResolvedMetricCandidate[] = [];
  for (const factType of definition.factTypes) {
    const matches = facts.filter(
      (f) => f.factType === factType && inPeriod(f, period),
    );
    if (matches.length) {
      typed = matches;
      break;
    }
  }
  const inScope = typed;
  const preferred = inScope.filter((f) =>
    labelPreferred(f, definition.preferLabelIncludes),
  );
  const pool = preferred.length ? preferred : inScope;

  if (pool.length === 0) {
    return empty;
  }

  const withNumbers = pool.filter((f) => f.numericValue != null);
  const authoritative = withNumbers.filter((f) =>
    isAuthoritativeFactStatus(f.verificationStatus),
  );

  const tierConflict = (tier: ResolvedMetricCandidate[]) =>
    tier.length >= 2 &&
    tier.some((f) => numericConflict(f.numericValue, tier[0].numericValue));

  const verified = authoritative.filter((f) => f.verificationStatus === "verified");
  const reported = authoritative.filter((f) => f.verificationStatus === "reported");

  // Conflicts only within approved tiers. Unreviewed extractions do not blank a figure.
  if (tierConflict(verified) || (!verified.length && tierConflict(reported))) {
    return {
      ...empty,
      verificationStatus: "conflicting",
      value: null,
      candidates: pool,
      factId: null,
      documentId: null,
    };
  }

  const chosen = verified[0] ?? reported[0] ?? null;

  if (!chosen || chosen.numericValue == null) {
    const waiting = pool.some((f) => f.verificationStatus === "needs_review");
    const rejectedOnly =
      pool.length > 0 && pool.every((f) => f.verificationStatus === "rejected");
    return {
      ...empty,
      verificationStatus: waiting ? "needs_review" : rejectedOnly ? "rejected" : "unknown",
      candidates: pool,
      notes: waiting
        ? "Extracted facts are waiting for review and are not used as the dashboard figure."
        : null,
    };
  }

  return {
    metric: definition.id,
    label: definition.label,
    value: chosen.numericValue,
    unit: chosen.unit ?? definition.unit,
    period: {
      start: chosen.periodStart ?? period.start,
      end: chosen.periodEnd ?? period.end,
      label: period.label,
    },
    verificationStatus: chosen.verificationStatus,
    factId: chosen.id,
    documentId: chosen.documentId,
    sourceReference: chosen.sourceReference ?? null,
    sourcePage: chosen.sourcePage ?? null,
    sourceExcerpt: chosen.sourceExcerpt ?? null,
    asOfDate: chosen.asOfDate,
    notes: chosen.notes ?? null,
    candidates: pool,
  };
}

/**
 * Income minus operating expenses. Cash and reserve balances are not inputs.
 */
export function deriveNetOperatingResult(
  income: ResolvedMetric,
  expenses: ResolvedMetric,
  period: { start: string; end: string; label: string },
): ResolvedMetric {
  const base = METRIC_DEFINITIONS.net_operating_result;
  const missing = {
    metric: "net_operating_result" as const,
    label: base.label,
    value: null,
    unit: "USD",
    period,
    verificationStatus: "unknown" as const,
    factId: null,
    documentId: null,
    sourceReference: null,
    sourcePage: null,
    sourceExcerpt: null,
    asOfDate: null,
    notes:
      "Net operating result needs both approved monthly income and operating expenses. Cash balance is not used.",
    candidates: [...income.candidates, ...expenses.candidates],
  };
  if (
    income.verificationStatus === "conflicting" ||
    expenses.verificationStatus === "conflicting" ||
    income.value == null ||
    expenses.value == null
  ) {
    return {
      ...missing,
      verificationStatus:
        income.verificationStatus === "conflicting" ||
        expenses.verificationStatus === "conflicting"
          ? "conflicting"
          : income.verificationStatus === "needs_review" ||
              expenses.verificationStatus === "needs_review"
            ? "needs_review"
            : "unknown",
    };
  }
  const value = new Decimal(income.value).minus(expenses.value).toFixed(2);
  const status =
    income.verificationStatus === "verified" &&
    expenses.verificationStatus === "verified"
      ? "verified"
      : "reported";
  return {
    metric: "net_operating_result",
    label: base.label,
    value,
    unit: "USD",
    period,
    verificationStatus: status,
    factId: income.factId,
    documentId: income.documentId,
    sourceReference: income.sourceReference,
    sourcePage: income.sourcePage,
    sourceExcerpt: income.sourceExcerpt,
    asOfDate: income.asOfDate,
    notes: `Derived from monthly HOA income (${income.value}) minus operating expenses (${expenses.value}). Cash balance is not included.`,
    candidates: [...income.candidates, ...expenses.candidates],
  };
}

/**
 * Derive collection rate from collected ÷ potential (or billed) when no
 * direct collection_rate fact exists. Never invents zeros.
 */
export function deriveCollectionRate(
  collected: ResolvedMetric,
  potentialOrBilled: ResolvedMetric,
  period: { start: string; end: string; label: string },
): ResolvedMetric {
  const base = METRIC_DEFINITIONS.collection_rate;
  if (
    collected.verificationStatus === "conflicting" ||
    potentialOrBilled.verificationStatus === "conflicting"
  ) {
    return {
      metric: "collection_rate",
      label: base.label,
      value: null,
      unit: "%",
      period,
      verificationStatus: "conflicting",
      factId: null,
      documentId: null,
      sourceReference: null,
      sourcePage: null,
      sourceExcerpt: null,
      asOfDate: null,
      notes: "Collection rate cannot be derived while source facts conflict.",
      candidates: [...collected.candidates, ...potentialOrBilled.candidates],
    };
  }

  if (collected.value == null || potentialOrBilled.value == null) {
    return {
      metric: "collection_rate",
      label: base.label,
      value: null,
      unit: "%",
      period,
      verificationStatus: "unknown",
      factId: null,
      documentId: null,
      sourceReference: null,
      sourcePage: null,
      sourceExcerpt: null,
      asOfDate: null,
      notes: "Requires both collected and potential/billed dues facts.",
      candidates: [...collected.candidates, ...potentialOrBilled.candidates],
    };
  }

  const denom = Number(potentialOrBilled.value);
  if (!Number.isFinite(denom) || denom === 0) {
    return {
      metric: "collection_rate",
      label: base.label,
      value: null,
      unit: "%",
      period,
      verificationStatus: "unknown",
      factId: null,
      documentId: null,
      sourceReference: null,
      sourcePage: null,
      sourceExcerpt: null,
      asOfDate: null,
      notes: "Potential/billed dues is missing or zero — rate left unknown.",
      candidates: [...collected.candidates, ...potentialOrBilled.candidates],
    };
  }

  const rate = ((Number(collected.value) / denom) * 100).toFixed(2);
  const status =
    collected.verificationStatus === "verified" &&
    potentialOrBilled.verificationStatus === "verified"
      ? "verified"
      : collected.verificationStatus === "reported" ||
          potentialOrBilled.verificationStatus === "reported"
        ? "reported"
        : money(rate, collected.verificationStatus).status;

  return {
    metric: "collection_rate",
    label: base.label,
    value: rate,
    unit: "%",
    period,
    verificationStatus: status,
    factId: collected.factId,
    documentId: collected.documentId,
    sourceReference: collected.sourceReference,
    sourcePage: collected.sourcePage,
    sourceExcerpt: collected.sourceExcerpt,
    asOfDate: collected.asOfDate,
    notes: `Derived from dues collected (${collected.value}) ÷ potential/billed (${potentialOrBilled.value}).`,
    candidates: [...collected.candidates, ...potentialOrBilled.candidates],
  };
}
