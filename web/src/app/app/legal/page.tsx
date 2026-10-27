import { and, eq } from "drizzle-orm";
import { requireTenantContext } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { legalCases } from "@/lib/db/schema";
import { assertCan } from "@/lib/domain/permissions";
import { formatMoney, money } from "@/lib/domain/money";
import { StatusBadge } from "@/components/verification/status-badge";
import { Badge } from "@/components/ui/badge";

export default async function LegalPage() {
  const ctx = await requireTenantContext();
  assertCan(ctx.capabilities, "legal.read");

  const rows = await db
    .select()
    .from(legalCases)
    .where(
      and(
        eq(legalCases.organizationId, ctx.organizationId),
        eq(legalCases.communityId, ctx.communityId),
      ),
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Legal Cases
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Compare collection spend vs recovery once verified invoices and
          settlements are linked. Unverified figures stay Unknown.
        </p>
      </div>

      <div className="overflow-x-auto border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-[var(--surface-hover)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2">Case #</th>
              <th className="px-4 py-2">Court</th>
              <th className="px-4 py-2">Owner</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Original bal.</th>
              <th className="px-4 py-2">Legal expenses</th>
              <th className="px-4 py-2">Recovery</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-[var(--border)] align-top">
                <td className="px-4 py-3 font-medium">{c.caseNumber}</td>
                <td className="px-4 py-3">{c.court ?? "Unknown"}</td>
                <td className="px-4 py-3">{c.ownerDisplay ?? "Unknown"}</td>
                <td className="px-4 py-3">
                  <Badge variant="default">{c.status}</Badge>
                </td>
                <td className="px-4 py-3">
                  <p className="tabular-nums">
                    {formatMoney(money(c.originalBalance, c.originalBalanceStatus))}
                  </p>
                  <StatusBadge status={c.originalBalanceStatus} />
                </td>
                <td className="px-4 py-3">
                  <p className="tabular-nums">
                    {formatMoney(money(c.legalExpenses, c.legalExpensesStatus))}
                  </p>
                  <StatusBadge status={c.legalExpensesStatus} />
                </td>
                <td className="px-4 py-3">
                  <p className="tabular-nums">
                    {formatMoney(money(c.recovery, c.recoveryStatus))}
                  </p>
                  <StatusBadge status={c.recoveryStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
