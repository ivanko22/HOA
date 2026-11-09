import Decimal from "decimal.js";
import type { VerificationStatus } from "./enums";

export type ReviewFactShape = {
  id: string;
  factType: string;
  label: string;
  numericValue: string | null;
  originalNumericValue: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  asOfDate: string | null;
  verificationStatus: VerificationStatus;
  sourceExcerpt: string | null;
  sourcePage: string | null;
  sourceReference: string | null;
};

export type ReviewFilter = {
  year?: number | null;
  month?: number | null;
  factType?: string | null;
  status?: VerificationStatus | null;
};

const AUTHORITATIVE = new Set<VerificationStatus>(["verified", "reported"]);

export function isAuthoritativeFactStatus(status: VerificationStatus): boolean {
  return AUTHORITATIVE.has(status);
}

function dateOnly(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function overlapsRange(
  start: string | null,
  end: string | null,
  rangeStart: string,
  rangeEnd: string,
): boolean {
  const factStart = dateOnly(start);
  const factEnd = dateOnly(end) ?? factStart;
  if (!factStart || !factEnd) return false;
  return factStart <= rangeEnd && factEnd >= rangeStart;
}

function monthEnd(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

export function factMatchesReviewFilter(
  fact: Pick<
    ReviewFactShape,
    "factType" | "verificationStatus" | "periodStart" | "periodEnd" | "asOfDate"
  >,
  filter: ReviewFilter,
): boolean {
  if (filter.factType && fact.factType !== filter.factType) return false;
  if (filter.status && fact.verificationStatus !== filter.status) return false;
  if (filter.year == null && filter.month == null) return true;

  const start = fact.periodStart ?? fact.asOfDate;
  const end = fact.periodEnd ?? fact.asOfDate ?? fact.periodStart;
  if (!start && !end) return false;

  if (filter.year != null && filter.month != null) {
    const rangeStart = `${filter.year}-${String(filter.month).padStart(2, "0")}-01`;
    return overlapsRange(start, end, rangeStart, monthEnd(filter.year, filter.month));
  }
  if (filter.year != null) {
    return overlapsRange(start, end, `${filter.year}-01-01`, `${filter.year}-12-31`);
  }
  const month = filter.month!;
  const factStart = dateOnly(start);
  const factEnd = dateOnly(end) ?? factStart;
  if (!factStart || !factEnd) return false;
  const cursor = new Date(`${factStart}T00:00:00Z`);
  const last = new Date(`${factEnd}T00:00:00Z`);
  while (cursor <= last) {
    if (cursor.getUTCMonth() + 1 === month) return true;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    if (cursor.getUTCDate() !== 1) cursor.setUTCDate(1);
  }
  return false;
}

export function conflictingFactIds(
  facts: Pick<
    ReviewFactShape,
    "id" | "factType" | "numericValue" | "periodStart" | "periodEnd" | "asOfDate" | "verificationStatus"
  >[],
): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < facts.length; i++) {
    for (let j = i + 1; j < facts.length; j++) {
      const a = facts[i];
      const b = facts[j];
      if (a.factType !== b.factType) continue;
      if (a.numericValue == null || b.numericValue == null) continue;
      if (Number(a.numericValue) === Number(b.numericValue)) continue;
      if (a.verificationStatus === "rejected" || b.verificationStatus === "rejected") {
        continue;
      }
      const aStart = a.periodStart ?? a.asOfDate;
      const aEnd = a.periodEnd ?? a.asOfDate ?? a.periodStart;
      const bStart = b.periodStart ?? b.asOfDate;
      const bEnd = b.periodEnd ?? b.asOfDate ?? b.periodStart;
      const sameUndated = !aStart && !bStart;
      const overlap =
        sameUndated ||
        overlapsRange(aStart, aEnd, bStart ?? "0000-01-01", bEnd ?? "9999-12-31");
      if (!overlap) continue;
      ids.add(a.id);
      ids.add(b.id);
    }
  }
  return ids;
}

export function correctionPatch<T extends {
  numericValue: string | null;
  originalNumericValue: string | null;
  sourceExcerpt: string | null;
  sourcePage: string | null;
  sourceReference: string | null;
}>(existing: T, nextAmount: string): T & { numericValue: string; verificationStatus: "needs_review" } {
  const cleaned = nextAmount.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error("Enter a dollar amount such as 1234.56.");
  }
  const numericValue = new Decimal(cleaned).toFixed(2);
  return {
    ...existing,
    numericValue,
    originalNumericValue: existing.originalNumericValue ?? existing.numericValue,
    sourceExcerpt: existing.sourceExcerpt,
    sourcePage: existing.sourcePage,
    sourceReference: existing.sourceReference,
    verificationStatus: "needs_review",
  };
}
