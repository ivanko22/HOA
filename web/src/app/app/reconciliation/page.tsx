import Link from "next/link";
import { requireTenantContext } from "@/lib/auth/config";
import { formatMoney } from "@/lib/domain/money";
import { getReconciliationSummary } from "@/lib/services/reconciliation";

function defaultPeriod() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const ctx = await requireTenantContext();
  const params = await searchParams;
  const fallback = defaultPeriod();
  const start = params.start || fallback.start;
  const end = params.end || fallback.end;

  const summary = await getReconciliationSummary(ctx, { start, end });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Reconciliation
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Compare imported transactions to source-reported facts for a period.
          Differences are informational until reconciled — not automatic errors.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 border border-[var(--border)] bg-[var(--surface)] p-4">
        <label className="text-sm">
          <span className="text-xs text-[var(--muted)]">Period start</span>
          <input
            type="date"
            name="start"
            defaultValue={start}
            className="mt-1 block border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs text-[var(--muted)]">Period end</span>
          <input
            type="date"
            name="end"
            defaultValue={end}
            className="mt-1 block border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          Update
        </button>
        <Link
          href="/app/imports"
          className="px-3 py-2 text-sm text-[var(--accent)] hover:underline"
        >
          Open imports
        </Link>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Imported income"
          value={formatMoney(summary.importedIncome)}
        />
        <Stat
          label="Imported expenses"
          value={formatMoney(summary.importedExpenses)}
        />
        <Stat
          label="Uncategorized amount"
          value={formatMoney(summary.uncategorizedAmount)}
        />
        <Stat
          label="Unreviewed rows"
          value={String(summary.unreviewedRowCount)}
        />
        <Stat label="Duplicates" value={String(summary.duplicateRowCount)} />
        <Stat
          label="Approved transactions"
          value={String(summary.approvedTransactionCount)}
        />
      </div>

      {summary.sourceReportedTotals.length > 0 ? (
        <section className="border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold">Source-reported totals</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Facts overlapping this period from uploaded documents.
          </p>
          <ul className="mt-4 divide-y divide-[var(--border)]">
            {summary.sourceReportedTotals.map((t) => (
              <li
                key={t.factId}
                className="flex items-center justify-between gap-4 py-3 text-sm"
              >
                <div>
                  <Link
                    href={`/app/documents/${t.documentId}`}
                    className="font-medium text-[var(--accent)] hover:underline"
                  >
                    {t.label}
                  </Link>
                </div>
                <span className="tabular-nums">{formatMoney(t.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          No overlapping source-reported income/expense facts for this period.
        </p>
      )}

      {summary.comparison ? (
        <section className="border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold">
            Reported expenses vs imported transactions
          </h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Reported expenses
              </dt>
              <dd className="mt-1 text-lg tabular-nums">
                {formatMoney(summary.comparison.reportedExpenses)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Imported transaction total
              </dt>
              <dd className="mt-1 text-lg tabular-nums">
                {formatMoney(summary.comparison.importedExpenseTotal)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Difference
              </dt>
              <dd className="mt-1 text-lg tabular-nums">
                {formatMoney(summary.comparison.difference)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-[var(--muted)]">
            {summary.comparison.note}
          </p>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl tabular-nums tracking-tight">{value}</p>
    </div>
  );
}
