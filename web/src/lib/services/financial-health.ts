import { formatMoney, money } from "@/lib/domain/money";
import type { VerificationStatus } from "@/lib/domain/enums";
import {
  assertCan,
  type TenantContext,
} from "@/lib/domain/permissions";
import {
  getFinancialTrend,
  resolveAllKpis,
  type TrendPoint,
} from "./metric-resolution";
import type { MetricId, ResolvedMetric } from "@/lib/domain/metric-resolution";

export type KpiCard = {
  id: MetricId;
  label: string;
  value: ReturnType<typeof money>;
  displayValue: string;
  unit: string;
  period: { start: string; end: string; label: string };
  lastVerifiedAt: string | null;
  verificationStatus: VerificationStatus;
  factId: string | null;
  documentId: string | null;
  sourceReference: string | null;
  asOfDate: string | null;
  drilldownHref: string;
};

export type FinancialHealthDashboard = {
  period: { start: string; end: string; label: string };
  kpis: KpiCard[];
  resolved: ResolvedMetric[];
  trend: TrendPoint[];
};

function toKpi(m: ResolvedMetric): KpiCard {
  const amount = money(m.value, m.verificationStatus);
  const asPercent = m.unit === "%";
  return {
    id: m.metric,
    label: m.label,
    value: amount,
    displayValue: asPercent
      ? m.value == null || m.verificationStatus === "unknown"
        ? "Unknown"
        : m.verificationStatus === "conflicting"
          ? "Conflicting"
          : `${m.verificationStatus === "estimated" ? "~" : ""}${m.value}%`
      : m.verificationStatus === "conflicting"
        ? "Conflicting"
        : formatMoney(amount),
    unit: m.unit,
    period: {
      start: m.period.start ?? "",
      end: m.period.end ?? "",
      label: m.period.label,
    },
    lastVerifiedAt: m.asOfDate,
    verificationStatus: m.verificationStatus,
    factId: m.factId,
    documentId: m.documentId,
    sourceReference: m.sourceReference,
    asOfDate: m.asOfDate,
    drilldownHref: `/app/metrics/${m.metric}`,
  };
}

export async function getFinancialHealth(
  ctx: TenantContext,
): Promise<FinancialHealthDashboard> {
  assertCan(ctx.capabilities, "transparency.read");
  const { period, metrics } = await resolveAllKpis(ctx);
  const trend = await getFinancialTrend(ctx);

  return {
    period,
    kpis: metrics.map(toKpi),
    resolved: metrics,
    trend,
  };
}

export {
  getFinancialTrend,
  resolveMetric,
  getMetricDetail,
  isMetricId,
} from "./metric-resolution";
