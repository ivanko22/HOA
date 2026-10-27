import { and, eq } from "drizzle-orm";
import { requireTenantContext } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import {
  accounts,
  bankAccounts,
  charges,
  invoices,
  journalEntries,
  journalLines,
  payments,
} from "@/lib/db/schema";
import { assertCan } from "@/lib/domain/permissions";
import { formatMoney, money } from "@/lib/domain/money";
import { StatusBadge } from "@/components/verification/status-badge";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const ctx = await requireTenantContext();
  assertCan(ctx.capabilities, "finance.read");
  const { focus } = await searchParams;

  const [coa, banks, chargeRows, paymentRows, invoiceRows, entries] =
    await Promise.all([
      db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.organizationId, ctx.organizationId),
            eq(accounts.communityId, ctx.communityId),
          ),
        ),
      db
        .select()
        .from(bankAccounts)
        .where(
          and(
            eq(bankAccounts.organizationId, ctx.organizationId),
            eq(bankAccounts.communityId, ctx.communityId),
          ),
        ),
      db
        .select()
        .from(charges)
        .where(
          and(
            eq(charges.organizationId, ctx.organizationId),
            eq(charges.communityId, ctx.communityId),
          ),
        ),
      db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.organizationId, ctx.organizationId),
            eq(payments.communityId, ctx.communityId),
          ),
        ),
      db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, ctx.organizationId),
            eq(invoices.communityId, ctx.communityId),
          ),
        ),
      db
        .select()
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.organizationId, ctx.organizationId),
            eq(journalEntries.communityId, ctx.communityId),
          ),
        ),
    ]);

  const lines =
    entries.length === 0
      ? []
      : await db.select().from(journalLines).where(
          and(
            eq(journalLines.organizationId, ctx.organizationId),
            eq(journalLines.communityId, ctx.communityId),
          ),
        );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Ledger & records
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Drill-down surface for KPIs and charts
          {focus ? ` · focus: ${focus}` : ""}. Posted journals are the books of
          record.
        </p>
      </div>

      <section className="border border-[var(--border)] bg-[var(--surface)]">
        <header className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">
          Bank accounts
        </header>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Institution</th>
              <th className="px-4 py-2">Balance</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">As of</th>
            </tr>
          </thead>
          <tbody>
            {banks.map((b) => (
              <tr key={b.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 font-medium">{b.name}</td>
                <td className="px-4 py-2">{b.institution ?? "Unknown"}</td>
                <td className="px-4 py-2 tabular-nums">
                  {formatMoney(money(b.balance, b.balanceStatus))}
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={b.balanceStatus} />
                </td>
                <td className="px-4 py-2">{b.balanceAsOf ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="border border-[var(--border)] bg-[var(--surface)]">
        <header className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">
          Chart of accounts
        </header>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Reserve</th>
            </tr>
          </thead>
          <tbody>
            {coa.map((a) => (
              <tr key={a.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 tabular-nums">{a.code}</td>
                <td className="px-4 py-2">{a.name}</td>
                <td className="px-4 py-2">{a.type}</td>
                <td className="px-4 py-2">{a.isReserve ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border border-[var(--border)] bg-[var(--surface)]">
          <header className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">
            Charges ({chargeRows.length})
          </header>
          {chargeRows.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--muted)]">
              No charges on file.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-sm">
              {chargeRows.map((c) => (
                <li key={c.id} className="flex justify-between px-4 py-2">
                  <span>{c.description}</span>
                  <span className="tabular-nums">
                    {formatMoney(money(c.amount, c.amountStatus))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="border border-[var(--border)] bg-[var(--surface)]">
          <header className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">
            Payments ({paymentRows.length})
          </header>
          {paymentRows.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--muted)]">
              No payments on file.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-sm">
              {paymentRows.map((p) => (
                <li key={p.id} className="flex justify-between px-4 py-2">
                  <span>{p.paymentDate}</span>
                  <span className="tabular-nums">
                    {formatMoney(money(p.amount, p.amountStatus))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="border border-[var(--border)] bg-[var(--surface)]">
        <header className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">
          Open invoices / AP ({invoiceRows.length})
        </header>
        {invoiceRows.length === 0 ? (
          <p className="px-4 py-3 text-sm text-[var(--muted)]">
            No invoices on file.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] text-sm">
            {invoiceRows.map((i) => (
              <li key={i.id} className="flex justify-between px-4 py-2">
                <span>
                  {i.invoiceNumber} · {i.invoiceDate}
                </span>
                <span className="tabular-nums">
                  {formatMoney(money(i.amount, i.amountStatus))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border border-[var(--border)] bg-[var(--surface)]">
        <header className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">
          Journal entries ({entries.length}) / lines ({lines.length})
        </header>
        {entries.length === 0 ? (
          <p className="px-4 py-3 text-sm text-[var(--muted)]">
            No journal activity yet. Import or post verified transactions to
            populate the books.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] text-sm">
            {entries.map((e) => (
              <li key={e.id} className="px-4 py-2">
                <span className="font-medium">{e.entryDate}</span> · {e.status} ·{" "}
                {e.memo ?? "—"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
