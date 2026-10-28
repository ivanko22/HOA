import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditEvents, documents, facts, financialPeriods } from "@/lib/db/schema";
import {
  deriveCollectionRate,
  METRIC_DEFINITIONS,
  resolveMetricFromFacts,
  type MetricId,
  type ResolvedMetric,
  type ResolvedMetricCandidate,
} from "@/lib/domain/metric-resolution";
import {
  assertCan,
  type TenantContext,
} from "@/lib/domain/permissions";

async function loadCommunityFactCandidates(
  ctx: TenantContext,
): Promise<ResolvedMetricCandidate[]> {
  const rows = await db
    .select()
    .from(facts)
    .where(
      and(
        eq(facts.organizationId, ctx.organizationId),
        eq(facts.communityId, ctx.communityId),
      ),
    );

  return rows.map((f) => ({
    id: f.id,
    factType: f.factType,
    numericValue: f.numericValue,
    value: f.value,
    verificationStatus: f.verificationStatus,
    periodStart: f.periodStart,
    periodEnd: f.periodEnd,
    asOfDate: f.asOfDate,
    documentId: f.documentId,
    label: f.label,
    unit: f.unit,
    sourceReference: f.sourceReference,
    sourcePage: f.sourcePage,
    sourceExcerpt: f.sourceExcerpt,
    notes: f.notes,
    verifiedAt: f.verifiedAt?.toISOString() ?? null,
  }));
}

export async function resolveActivePeriod(ctx: TenantContext) {
  const periods = await db
    .select()
    .from(financialPeriods)
    .where(
      and(
        eq(financialPeriods.organizationId, ctx.organizationId),
        eq(financialPeriods.communityId, ctx.communityId),
      ),
    );
  const period =
    periods.find((p) => !p.isClosed) ??
    periods[0] ?? {
      name: "Current (unconfigured)",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    };
  return {
    start: period.startDate,
    end: period.endDate,
    label: period.name,
  };
}

export async function resolveMetric(
  ctx: TenantContext,
  metricId: MetricId,
  periodOverride?: { start: string; end: string; label: string },
): Promise<ResolvedMetric> {
  assertCan(ctx.capabilities, "transparency.read");
  const period = periodOverride ?? (await resolveActivePeriod(ctx));
  const candidates = await loadCommunityFactCandidates(ctx);
  const definition = METRIC_DEFINITIONS[metricId];

  if (metricId === "collection_rate") {
    const direct = resolveMetricFromFacts(definition, candidates, period);
    if (direct.value != null || direct.verificationStatus === "conflicting") {
      return direct;
    }
    const collected = resolveMetricFromFacts(
      METRIC_DEFINITIONS.dues_collected,
      candidates,
      period,
    );
    const potential = resolveMetricFromFacts(
      {
        id: "dues_collected",
        label: "Potential dues",
        factTypes: ["potential_dues_full_collection"],
        unit: "USD",
      },
      candidates,
      period,
    );
    return deriveCollectionRate(collected, potential, period);
  }

  return resolveMetricFromFacts(definition, candidates, period);
}

export async function resolveAllKpis(ctx: TenantContext): Promise<{
  period: { start: string; end: string; label: string };
  metrics: ResolvedMetric[];
}> {
  assertCan(ctx.capabilities, "transparency.read");
  const period = await resolveActivePeriod(ctx);
  const ids = Object.keys(METRIC_DEFINITIONS) as MetricId[];
  const metrics: ResolvedMetric[] = [];
  for (const id of ids) {
    metrics.push(await resolveMetric(ctx, id, period));
  }
  return { period, metrics };
}

export type MetricDetail = ResolvedMetric & {
  documentTitle: string | null;
  verificationHistory: {
    action: string;
    at: string;
    after: string | null;
  }[];
};

export async function getMetricDetail(
  ctx: TenantContext,
  metricId: MetricId,
): Promise<MetricDetail> {
  const resolved = await resolveMetric(ctx, metricId);
  let documentTitle: string | null = null;
  if (resolved.documentId) {
    const [doc] = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, resolved.documentId),
          eq(documents.organizationId, ctx.organizationId),
          eq(documents.communityId, ctx.communityId),
        ),
      )
      .limit(1);
    documentTitle = doc?.title ?? null;
  }

  const history =
    resolved.factId == null
      ? []
      : (
          await db
            .select()
            .from(auditEvents)
            .where(
              and(
                eq(auditEvents.organizationId, ctx.organizationId),
                eq(auditEvents.communityId, ctx.communityId),
                eq(auditEvents.entityType, "fact"),
                eq(auditEvents.entityId, resolved.factId),
              ),
            )
            .orderBy(desc(auditEvents.createdAt))
            .limit(20)
        ).map((a) => ({
          action: a.action,
          at: a.createdAt.toISOString(),
          after: a.after,
        }));

  return { ...resolved, documentTitle, verificationHistory: history };
}

export type TrendPoint = {
  metric: MetricId;
  periodLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  value: number | null;
  verificationStatus: ResolvedMetric["verificationStatus"];
  factId: string | null;
  documentId: string | null;
};

const TREND_METRICS: MetricId[] = [
  "dues_collected",
  "base_operating_expenses",
  "special_assessment_collected",
  "cash",
];

/**
 * Build sparse time series from available facts only — never fabricate months.
 */
export async function getFinancialTrend(
  ctx: TenantContext,
  metricIds: MetricId[] = TREND_METRICS,
): Promise<TrendPoint[]> {
  assertCan(ctx.capabilities, "transparency.read");
  const candidates = await loadCommunityFactCandidates(ctx);
  const points: TrendPoint[] = [];

  for (const metricId of metricIds) {
    const def = METRIC_DEFINITIONS[metricId];
    const typed = candidates.filter((f) => def.factTypes.includes(f.factType));
    for (const fact of typed) {
      if (fact.numericValue == null) continue;
      if (
        def.preferLabelIncludes?.length &&
        !def.preferLabelIncludes.some((p) =>
          (fact.label ?? "").toLowerCase().includes(p.toLowerCase()),
        )
      ) {
        // still include if it's the only type match without prefer — skip strict prefer for trend
      }
      const periodLabel =
        fact.periodStart && fact.periodEnd
          ? `${fact.periodStart} → ${fact.periodEnd}`
          : (fact.asOfDate ?? "Undated");
      points.push({
        metric: metricId,
        periodLabel,
        periodStart: fact.periodStart,
        periodEnd: fact.periodEnd,
        value: Number(fact.numericValue),
        verificationStatus: fact.verificationStatus,
        factId: fact.id,
        documentId: fact.documentId,
      });
    }
  }

  return points.sort((a, b) => {
    const ak = a.periodStart ?? a.periodEnd ?? a.periodLabel;
    const bk = b.periodStart ?? b.periodEnd ?? b.periodLabel;
    return ak.localeCompare(bk);
  });
}

export function isMetricId(value: string): value is MetricId {
  return value in METRIC_DEFINITIONS;
}
