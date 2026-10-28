import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { facts } from "@/lib/db/schema";
import type { FactType, VerificationStatus } from "@/lib/domain/enums";
import { aggregateMetricFacts } from "@/lib/domain/facts";
import type { MoneyAmount } from "@/lib/domain/money";
import {
  assertCan,
  type TenantContext,
} from "@/lib/domain/permissions";

/**
 * Query boundary for Financial Health (and other dashboards).
 * Does not hard-code KPI values — consumers decide which statuses to display.
 */
export type MetricFactResult = {
  factType: string;
  amount: MoneyAmount;
  status: VerificationStatus;
  factIds: string[];
  documentIds: string[];
};

export async function getFactsForMetric(
  ctx: TenantContext,
  factType: FactType | string,
  options?: {
    periodStart?: string;
    periodEnd?: string;
  },
): Promise<MetricFactResult> {
  assertCan(ctx.capabilities, "transparency.read");

  const rows = await db
    .select()
    .from(facts)
    .where(
      and(
        eq(facts.organizationId, ctx.organizationId),
        eq(facts.communityId, ctx.communityId),
        eq(facts.factType, factType),
      ),
    );

  const filtered = rows.filter((r) => {
    if (options?.periodStart && r.periodEnd && r.periodEnd < options.periodStart) {
      return false;
    }
    if (options?.periodEnd && r.periodStart && r.periodStart > options.periodEnd) {
      return false;
    }
    return true;
  });

  const aggregated = aggregateMetricFacts(
    filtered.map((f) => ({
      id: f.id,
      factType: f.factType,
      numericValue: f.numericValue,
      value: f.value,
      verificationStatus: f.verificationStatus,
      periodStart: f.periodStart,
      periodEnd: f.periodEnd,
      asOfDate: f.asOfDate,
      documentId: f.documentId,
    })),
    factType,
  );

  return {
    factType,
    amount: aggregated.amount,
    status: aggregated.status,
    factIds: aggregated.factIds,
    documentIds: aggregated.documentIds,
  };
}

export async function listCommunityFacts(ctx: TenantContext) {
  assertCan(ctx.capabilities, "transparency.read");
  return db
    .select()
    .from(facts)
    .where(
      and(
        eq(facts.organizationId, ctx.organizationId),
        eq(facts.communityId, ctx.communityId),
      ),
    );
}
