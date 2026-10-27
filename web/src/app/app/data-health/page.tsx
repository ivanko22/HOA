import { requireTenantContext } from "@/lib/auth/config";
import { getDataHealth } from "@/lib/services/data-health";
import { Badge } from "@/components/ui/badge";
import type { DataHealthStatus } from "@/lib/domain/enums";

function healthVariant(status: DataHealthStatus) {
  return status;
}

export default async function DataHealthPage() {
  const ctx = await requireTenantContext();
  const health = await getDataHealth(ctx);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Data Health
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Completeness score summarizes availability but never hides missing
          records. Review every gap below.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-[240px_1fr]">
        <div className="border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-xs uppercase tracking-[0.1em] text-[var(--muted)]">
            Completeness score
          </p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-5xl tabular-nums">
            {health.score}
            <span className="text-2xl text-[var(--muted)]">%</span>
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {health.availableCount} of {health.scoredCount} checks available
          </p>
        </div>

        <div className="border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-semibold">Open gaps</h2>
          {health.gaps.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">No open gaps.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--border)]">
              {health.gaps.map((g) => (
                <li
                  key={g.id}
                  className="flex items-start justify-between gap-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{g.label}</p>
                    {g.notes ? (
                      <p className="text-xs text-[var(--muted)]">{g.notes}</p>
                    ) : null}
                  </div>
                  <Badge variant={healthVariant(g.status)}>{g.status.replaceAll("_", " ")}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold">All checks</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[var(--surface-hover)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">Year</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Label</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {health.checks.map((c) => (
                <tr key={c.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2 tabular-nums">{c.year ?? "—"}</td>
                  <td className="px-4 py-2">{c.category}</td>
                  <td className="px-4 py-2 font-medium">{c.label}</td>
                  <td className="px-4 py-2">
                    <Badge variant={healthVariant(c.status)}>
                      {c.status.replaceAll("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-[var(--muted)]">
                    {c.notes ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
