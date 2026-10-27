import Link from "next/link";
import { requireTenantContext } from "@/lib/auth/config";
import { listBuildings } from "@/lib/services/buildings";
import { StatusBadge } from "@/components/verification/status-badge";

export default async function BuildingsPage() {
  const ctx = await requireTenantContext();
  const rows = await listBuildings(ctx);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Buildings
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Conditions default to Unknown until verified inspections are recorded.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((b) => (
          <Link
            key={b.id}
            href={`/app/buildings/${b.id}`}
            className="group relative overflow-hidden border border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--accent)]"
          >
            <div
              aria-hidden
              className="h-28 bg-[linear-gradient(145deg,#0b3a4a,#1f6f78_55%,#94a3b8)] opacity-90 transition-opacity group-hover:opacity-100"
            />
            <div className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{b.name}</h2>
                <span className="text-xs text-[var(--muted)]">Code {b.code}</span>
              </div>
              <p className="text-sm text-[var(--muted)]">
                Units: {b.unitCount == null ? "Unknown" : b.unitCount}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge
                  status={
                    b.roofCondition === "unknown" ? "unknown" : "reported"
                  }
                />
                <span className="text-xs text-[var(--muted)]">
                  Roof: {b.roofCondition}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
