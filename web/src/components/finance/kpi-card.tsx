import Link from "next/link";
import { StatusBadge } from "@/components/verification/status-badge";
import type { KpiCard as KpiCardData } from "@/lib/services/financial-health";

export function KpiCard({ kpi }: { kpi: KpiCardData }) {
  return (
    <Link
      href={kpi.drilldownHref}
      className="group block border-b border-r border-[var(--border)] px-4 py-4 transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
          {kpi.label}
        </p>
        <StatusBadge status={kpi.verificationStatus} />
      </div>
      <p className="mt-3 font-[family-name:var(--font-display)] text-2xl tracking-tight text-[var(--foreground)] tabular-nums">
        {kpi.displayValue}
      </p>
      <div className="mt-3 space-y-0.5 text-xs text-[var(--muted)]">
        <p>Period: {kpi.period.label}</p>
        <p>
          As of: {kpi.asOfDate ?? kpi.lastVerifiedAt ?? "Unknown"}
        </p>
        {kpi.sourceReference ? (
          <p className="truncate" title={kpi.sourceReference}>
            Source: {kpi.sourceReference}
          </p>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-[var(--accent)] opacity-0 transition-opacity group-hover:opacity-100">
        View underlying records →
      </p>
    </Link>
  );
}
