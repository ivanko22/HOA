import { z } from "zod";
import {
  factTypeSchema,
  verificationStatusSchema,
  type FactType,
  type VerificationStatus,
  worstVerification,
} from "./enums";
import { money, type MoneyAmount } from "./money";

export const createFactInputSchema = z.object({
  documentId: z.string().uuid(),
  factType: factTypeSchema.or(z.string().min(1)),
  label: z.string().min(1).max(200),
  value: z.string().max(2000).nullable().optional(),
  numericValue: z
    .string()
    .regex(/^-?\d+(\.\d{1,2})?$/)
    .nullable()
    .optional(),
  unit: z.string().max(40).nullable().optional(),
  periodStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  periodEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  asOfDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  sourcePage: z.string().max(40).nullable().optional(),
  sourceReference: z.string().max(200).nullable().optional(),
  sourceExcerpt: z.string().max(2000).nullable().optional(),
  verificationStatus: verificationStatusSchema.default("needs_review"),
  confidence: z
    .string()
    .regex(/^0(\.\d{1,2})?$|^1(\.0{1,2})?$/)
    .nullable()
    .optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type CreateFactInput = z.infer<typeof createFactInputSchema>;

export type FactLike = {
  id: string;
  factType: string;
  numericValue: string | null;
  value: string | null;
  verificationStatus: VerificationStatus;
  periodStart: string | null;
  periodEnd: string | null;
  asOfDate: string | null;
  documentId: string;
};

export function periodsOverlap(
  a: { periodStart: string | null; periodEnd: string | null; asOfDate: string | null },
  b: { periodStart: string | null; periodEnd: string | null; asOfDate: string | null },
): boolean {
  const aStart = a.periodStart ?? a.asOfDate;
  const aEnd = a.periodEnd ?? a.asOfDate;
  const bStart = b.periodStart ?? b.asOfDate;
  const bEnd = b.periodEnd ?? b.asOfDate;
  if (!aStart || !aEnd || !bStart || !bEnd) {
    // Without dates, treat same factType peers as potentially overlapping when both lack bounds
    return !aStart && !aEnd && !bStart && !bEnd;
  }
  return aStart <= bEnd && bStart <= aEnd;
}

export function numericConflict(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (a == null || b == null || a === "" || b === "") return false;
  return Number(a) !== Number(b);
}

/**
 * Given a candidate fact and existing peers of the same type, return whether
 * it should be marked conflicting (and which peer ids conflict).
 * Never overwrites peers — caller stores both.
 */
export function detectConflicts(
  candidate: Pick<
    FactLike,
    "factType" | "numericValue" | "value" | "periodStart" | "periodEnd" | "asOfDate"
  >,
  peers: FactLike[],
): { isConflict: boolean; conflictingIds: string[] } {
  const conflictingIds: string[] = [];
  for (const peer of peers) {
    if (peer.factType !== candidate.factType) continue;
    if (!periodsOverlap(candidate, peer)) continue;
    const numConflict = numericConflict(candidate.numericValue, peer.numericValue);
    const textConflict =
      !numConflict &&
      candidate.value != null &&
      peer.value != null &&
      candidate.value.trim() !== peer.value.trim();
    if (numConflict || textConflict) {
      conflictingIds.push(peer.id);
    }
  }
  return { isConflict: conflictingIds.length > 0, conflictingIds };
}

export function resolveDocumentProcessingStatus(
  facts: { verificationStatus: VerificationStatus }[],
): "source_only" | "needs_review" | "partially_verified" | "verified" {
  if (facts.length === 0) return "source_only";
  const statuses = facts.map((f) => f.verificationStatus);
  if (statuses.every((s) => s === "verified")) return "verified";
  if (statuses.some((s) => s === "verified")) return "partially_verified";
  if (statuses.some((s) => s === "needs_review" || s === "conflicting")) {
    return "needs_review";
  }
  return "needs_review";
}

/**
 * Aggregate facts for a metric into a MoneyAmount for dashboards.
 * Unknown/null numeric values stay null — never coerced to zero.
 * Prefer verified; if only reported exist, surface as reported.
 * Conflicting peers force conflicting status and null amount.
 */
export function aggregateMetricFacts(
  facts: FactLike[],
  factType: FactType | string,
): {
  amount: MoneyAmount;
  factIds: string[];
  documentIds: string[];
  status: VerificationStatus;
} {
  const relevant = facts.filter((f) => f.factType === factType);
  if (relevant.length === 0) {
    return {
      amount: money(null, "unknown"),
      factIds: [],
      documentIds: [],
      status: "unknown",
    };
  }

  const withNumbers = relevant.filter((f) => f.numericValue != null);
  const statuses = relevant.map((f) => f.verificationStatus);
  const hasConflict =
    statuses.includes("conflicting") ||
    (withNumbers.length >= 2 &&
      withNumbers.some((f) =>
        numericConflict(f.numericValue, withNumbers[0].numericValue),
      ));

  if (hasConflict) {
    return {
      amount: money(null, "conflicting"),
      factIds: relevant.map((f) => f.id),
      documentIds: [...new Set(relevant.map((f) => f.documentId))],
      status: "conflicting",
    };
  }

  const verified = withNumbers.filter((f) => f.verificationStatus === "verified");
  const reported = withNumbers.filter((f) => f.verificationStatus === "reported");
  const chosen =
    verified[0] ?? reported[0] ?? withNumbers[0] ?? null;

  if (!chosen || chosen.numericValue == null) {
    return {
      amount: money(null, worstVerification(statuses)),
      factIds: relevant.map((f) => f.id),
      documentIds: [...new Set(relevant.map((f) => f.documentId))],
      status: worstVerification(statuses),
    };
  }

  const status = chosen.verificationStatus;
  return {
    amount: money(chosen.numericValue, status),
    factIds: relevant.map((f) => f.id),
    documentIds: [...new Set(relevant.map((f) => f.documentId))],
    status,
  };
}
