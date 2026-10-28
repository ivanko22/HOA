import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/auth/config";
import {
  getMetricDetail,
  isMetricId,
} from "@/lib/services/financial-health";
import { StatusBadge } from "@/components/verification/status-badge";
import { SourceReference } from "@/components/documents/source-reference";
import { formatMoney, money } from "@/lib/domain/money";
import { FactRow } from "@/components/documents/fact-row";

export default async function MetricDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ metric: string }>;
  searchParams: Promise<{ factId?: string }>;
}) {
  const { metric } = await params;
  const { factId } = await searchParams;
  if (!isMetricId(metric)) notFound();

  const ctx = await requireTenantContext();
  const detail = await getMetricDetail(ctx, metric);

  const display =
    detail.unit === "%"
      ? detail.value == null
        ? "Unknown"
        : detail.verificationStatus === "conflicting"
          ? "Conflicting"
          : `${detail.value}%`
      : detail.verificationStatus === "conflicting"
        ? "Conflicting"
        : formatMoney(money(detail.value, detail.verificationStatus));

  const highlighted =
    factId != null
      ? detail.candidates.find((c) => c.id === factId)
      : null;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/app"
          className="text-xs font-medium text-[var(--accent)] hover:underline"
        >
          ← Financial Health
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
            {detail.label}
          </h1>
          <StatusBadge status={detail.verificationStatus} />
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
          <h2 className="font-semibold">Resolved value</h2>
          <p className="mt-3 font-[family-name:var(--font-display)] text-3xl tabular-nums">
            {display}
          </p>
          <dl className="mt-4 space-y-2">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Period</dt>
              <dd>
                {detail.period.label}
                {(detail.period.start || detail.period.end) && (
                  <span className="block text-xs text-[var(--muted)]">
                    {detail.period.start ?? "?"} → {detail.period.end ?? "?"}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">As of</dt>
              <dd className="tabular-nums">{detail.asOfDate ?? "Unknown"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Unit</dt>
              <dd>{detail.unit}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Fact ID</dt>
              <dd className="font-mono text-xs">{detail.factId ?? "—"}</dd>
            </div>
          </dl>
          {detail.notes ? (
            <p className="mt-4 text-xs text-[var(--muted)]">{detail.notes}</p>
          ) : null}
        </div>

        <div className="border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
          <h2 className="font-semibold">Source document</h2>
          {detail.documentId ? (
            <div className="mt-3 space-y-3">
              <p className="font-medium">
                {detail.documentTitle ?? "Source document"}
              </p>
              <SourceReference
                page={detail.sourcePage}
                reference={detail.sourceReference}
                excerpt={detail.sourceExcerpt}
                documentHref={`/app/documents/${detail.documentId}`}
              />
            </div>
          ) : (
            <p className="mt-3 text-[var(--muted)]">
              No source document linked for this metric yet.
            </p>
          )}
        </div>
      </section>

      {highlighted ? (
        <section className="border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
          <h2 className="font-semibold">Selected trend point</h2>
          <p className="mt-2">
            {highlighted.label ?? highlighted.factType}:{" "}
            <span className="tabular-nums font-medium">
              {highlighted.numericValue ?? "Unknown"}
            </span>
          </p>
          <StatusBadge status={highlighted.verificationStatus} />
        </section>
      ) : null}

      <section className="border border-[var(--border)] bg-[var(--surface)]">
        <header className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold">Candidate facts</h2>
          <p className="text-xs text-[var(--muted)]">
            Conflicting candidates are listed side-by-side and never overwritten.
          </p>
        </header>
        {detail.candidates.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--muted)]">
            No facts found for this metric in the active period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-[var(--surface-hover)] text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-2">Fact</th>
                  <th className="px-4 py-2">Value</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2">Document</th>
                </tr>
              </thead>
              <tbody>
                {detail.candidates.map((c) => (
                  <FactRow
                    key={c.id}
                    id={c.id}
                    label={c.label ?? c.factType}
                    factType={c.factType}
                    value={c.value}
                    numericValue={c.numericValue}
                    unit={c.unit ?? detail.unit}
                    verificationStatus={c.verificationStatus}
                    sourcePage={c.sourcePage}
                    sourceReference={c.sourceReference}
                    sourceExcerpt={c.sourceExcerpt}
                    documentHref={`/app/documents/${c.documentId}`}
                    periodLabel={
                      c.periodStart || c.periodEnd || c.asOfDate
                        ? `${c.periodStart ?? c.asOfDate ?? "?"} → ${c.periodEnd ?? c.asOfDate ?? "?"}`
                        : null
                    }
                    actions={
                      <Link
                        href={`/app/documents/${c.documentId}`}
                        className="text-xs font-medium text-[var(--accent)] hover:underline"
                      >
                        Open document
                      </Link>
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border border-[var(--border)] bg-[var(--surface)]">
        <header className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">
          Verification history
        </header>
        {detail.verificationHistory.length === 0 ? (
          <p className="px-4 py-3 text-sm text-[var(--muted)]">
            No verification events for the resolved fact.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] text-sm">
            {detail.verificationHistory.map((h, i) => (
              <li key={`${h.at}-${i}`} className="px-4 py-2">
                <p className="font-medium">{h.action}</p>
                <p className="text-xs text-[var(--muted)]">{h.at}</p>
                <p className="font-mono text-xs text-[var(--muted)]">
                  {h.after?.slice(0, 160) ?? "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
