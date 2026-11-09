import Link from "next/link";
import { StatusBadge } from "@/components/verification/status-badge";
import type { KpiCard as KpiCardData } from "@/lib/services/financial-health";

export function KpiCard({ kpi }: { kpi: KpiCardData }) {
  const figureHref = kpi.documentHref ?? kpi.drilldownHref;
  return (
    <div className="border-b border-r border-[var(--border)] px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
          {kpi.label}
        </p>
        <StatusBadge status={kpi.verificationStatus} />
      </div>
      <Link
        href={figureHref}
        className="mt-3 block font-[family-name:var(--font-display)] text-2xl tracking-tight text-[var(--foreground)] tabular-nums hover:text-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        {kpi.displayValue}
      </Link>
      <div className="mt-3 space-y-0.5 text-xs text-[var(--muted)]">
        <p>Period: {kpi.period.label}</p>
        <p>As of: {kpi.asOfDate ?? kpi.lastVerifiedAt ?? "Unknown"}</p>
        {kpi.documentHref ? (
          <Link href={kpi.documentHref} className="text-[var(--accent)] hover:underline">
            Open supporting document
          </Link>
        ) : (
          <p>No supporting document</p>
        )}
      </div>
      <Link
        href={kpi.drilldownHref}
        className="mt-2 inline-block text-xs text-[var(--accent)] hover:underline"
      >
        View metric details
      </Link>
    </div>
  );
}
