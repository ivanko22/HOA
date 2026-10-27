import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/auth/config";
import { getBuildingDetail } from "@/lib/services/buildings";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/verification/status-badge";
import type { BuildingCondition } from "@/lib/domain/enums";

function conditionToVerification(c: BuildingCondition) {
  return c === "unknown" ? ("unknown" as const) : ("reported" as const);
}

export default async function BuildingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const detail = await getBuildingDetail(ctx, id);
  if (!detail) notFound();

  const { building, units, projects, conditions } = detail;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/app/buildings"
          className="text-xs font-medium text-[var(--accent)] hover:underline"
        >
          ← Buildings
        </Link>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl tracking-tight">
          {building.name}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {building.notes ??
            "No verified inspection narrative on file."}
        </p>
      </div>

      <section className="border border-[var(--border)] bg-[var(--surface)]">
        <header className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold">Condition snapshot</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--surface-hover)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-2">Area</th>
                <th className="px-4 py-2">Condition</th>
                <th className="px-4 py-2">Verification</th>
              </tr>
            </thead>
            <tbody>
              {conditions.map((c) => (
                <tr key={c.label} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2 font-medium">{c.label}</td>
                  <td className="px-4 py-2 capitalize">{c.value}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={conditionToVerification(c.value)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border border-[var(--border)] bg-[var(--surface)]">
          <header className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-sm font-semibold">Units</h2>
          </header>
          <ul className="divide-y divide-[var(--border)] text-sm">
            {units.map((u) => (
              <li key={u.id} className="flex justify-between px-4 py-2">
                <span>Unit {u.unitNumber}</span>
                <span className="text-[var(--muted)]">
                  Sq ft: {u.sqFt ?? "Unknown"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="border border-[var(--border)] bg-[var(--surface)]">
          <header className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-sm font-semibold">Open projects</h2>
          </header>
          {projects.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--muted)]">
              No projects linked.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-sm">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2">
                  <Link
                    href="/app/projects"
                    className="font-medium text-[var(--accent)] hover:underline"
                  >
                    {p.name}
                  </Link>
                  <Badge variant="default">{p.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
