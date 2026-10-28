import { requireTenantContext } from "@/lib/auth/config";
import { getFinancialHealth } from "@/lib/services/financial-health";
import { KpiCard } from "@/components/finance/kpi-card";
import { FinancialTrendChart } from "@/components/finance/financial-trend-chart";

export default async function FinancialHealthPage() {
  const ctx = await requireTenantContext();
  const dashboard = await getFinancialHealth(ctx);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Financial Health
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          KPIs resolve from the facts repository with verification status.
          Unknown and conflicting values stay explicit — never coerced to zero.
          Period: {dashboard.period.label} ({dashboard.period.start} →{" "}
          {dashboard.period.end}).
        </p>
      </div>

      <section
        aria-label="Key performance indicators"
        className="overflow-hidden border border-[var(--border)] bg-[var(--surface)]"
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
          {dashboard.kpis.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>
      </section>

      <FinancialTrendChart points={dashboard.trend} />
    </div>
  );
}
