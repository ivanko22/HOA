import { and, eq } from "drizzle-orm";
import { requireTenantContext } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { capitalProjects } from "@/lib/db/schema";
import { assertCan } from "@/lib/domain/permissions";
import { formatMoney, money } from "@/lib/domain/money";
import { StatusBadge } from "@/components/verification/status-badge";
import { Badge } from "@/components/ui/badge";

export default async function ProjectsPage() {
  const ctx = await requireTenantContext();
  assertCan(ctx.capabilities, "projects.read");

  const rows = await db
    .select()
    .from(capitalProjects)
    .where(
      and(
        eq(capitalProjects.organizationId, ctx.organizationId),
        eq(capitalProjects.communityId, ctx.communityId),
      ),
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Capital Projects
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Estimated, approved, and actual costs each carry their own verification
          status.
        </p>
      </div>

      <div className="overflow-x-auto border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[var(--surface-hover)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2">Project</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Priority</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Estimated</th>
              <th className="px-4 py-2">Approved</th>
              <th className="px-4 py-2">Actual</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-[var(--border)] align-top">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3">{p.category ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge variant="default">{p.priority}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="default">{p.status}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <p className="tabular-nums">
                      {formatMoney(money(p.estimatedCost, p.estimatedCostStatus))}
                    </p>
                    <StatusBadge status={p.estimatedCostStatus} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <p className="tabular-nums">
                      {formatMoney(money(p.approvedBudget, p.approvedBudgetStatus))}
                    </p>
                    <StatusBadge status={p.approvedBudgetStatus} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <p className="tabular-nums">
                      {formatMoney(money(p.actualCost, p.actualCostStatus))}
                    </p>
                    <StatusBadge status={p.actualCostStatus} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
