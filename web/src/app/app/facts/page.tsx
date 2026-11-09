import Link from "next/link";
import { requireTenantContext } from "@/lib/auth/config";
import { verificationStatuses, type VerificationStatus } from "@/lib/domain/enums";
import { can } from "@/lib/domain/permissions";
import { listFactsForReview } from "@/lib/services/fact-review";
import { StatusBadge } from "@/components/verification/status-badge";
import {
  approveFactAction,
  correctFactAction,
  rejectFactAction,
} from "./actions";

const METRICS = [
  { id: "operating_income", label: "Monthly HOA income" },
  { id: "monthly_dues_collected", label: "Regular dues" },
  { id: "special_assessment_collected", label: "Assessments" },
  { id: "operating_expenses", label: "Operating expenses" },
  { id: "net_income", label: "Net operating result" },
  { id: "cash_balance", label: "Cash balance" },
  { id: "reserve_balance", label: "Reserve balance" },
  { id: "total_assets", label: "Total assets" },
  { id: "total_liabilities", label: "Total liabilities" },
  { id: "accounts_receivable", label: "Accounts receivable" },
];

const YEARS = [2024, 2025, 2026, 2027];
const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function periodLabel(fact: {
  periodStart: string | null;
  periodEnd: string | null;
  asOfDate: string | null;
}) {
  if (fact.periodStart || fact.periodEnd) {
    return `${fact.periodStart ?? "?"} → ${fact.periodEnd ?? "?"}`;
  }
  return fact.asOfDate ?? "Undated";
}

function moneyLabel(value: string | null) {
  if (value == null) return "Missing";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

export default async function FactReviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    month?: string;
    metric?: string;
    status?: string;
  }>;
}) {
  const ctx = await requireTenantContext();
  const sp = await searchParams;
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : null;
  const month = sp.month && /^(?:[1-9]|1[0-2])$/.test(sp.month) ? Number(sp.month) : null;
  const factType = sp.metric && METRICS.some((m) => m.id === sp.metric) ? sp.metric : null;
  const status = verificationStatuses.includes(sp.status as VerificationStatus)
    ? (sp.status as VerificationStatus)
    : null;
  const canReview = can(ctx.capabilities, "finance.verify");
  const rows = await listFactsForReview(ctx, { year, month, factType, status });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Fact Review
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Extracted figures stay out of Financial Health until they are approved.
          A correction keeps the original amount and the evidence excerpt.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Year</span>
          <select name="year" defaultValue={sp.year ?? ""} className="border border-[var(--border)] bg-white px-2 py-1">
            <option value="">All</option>
            {YEARS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Month</span>
          <select name="month" defaultValue={sp.month ?? ""} className="border border-[var(--border)] bg-white px-2 py-1">
            <option value="">All</option>
            {MONTHS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Metric</span>
          <select name="metric" defaultValue={sp.metric ?? ""} className="border border-[var(--border)] bg-white px-2 py-1">
            <option value="">All</option>
            {METRICS.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Status</span>
          <select name="status" defaultValue={sp.status ?? ""} className="border border-[var(--border)] bg-white px-2 py-1">
            <option value="">All</option>
            {verificationStatuses.map((item) => (
              <option key={item} value={item}>{item.replaceAll("_", " ")}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="border border-[var(--border)] bg-[var(--surface)] px-3 py-1">
          Filter
        </button>
      </form>

      <div className="overflow-x-auto border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface-hover)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Metric</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Evidence</th>
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Review</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-[var(--muted)]">
                  No facts match these filters.
                </td>
              </tr>
            ) : null}
            {rows.map((fact) => (
              <tr key={fact.id} className="border-b border-[var(--border)] align-top last:border-0">
                <td className="px-3 py-3">
                  <p className="font-medium">{fact.label}</p>
                  <p className="text-xs text-[var(--muted)]">{fact.factType}</p>
                  {fact.conflicting ? (
                    <p className="mt-1 text-xs text-rose-800">
                      Conflicts with another fact for this metric and period.
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  <p>{moneyLabel(fact.numericValue)}</p>
                  {fact.originalNumericValue &&
                  fact.originalNumericValue !== fact.numericValue ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Extracted {moneyLabel(fact.originalNumericValue)}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-3">{periodLabel(fact)}</td>
                <td className="px-3 py-3">
                  <Link
                    href={`/app/documents/${fact.documentId}`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    {fact.documentTitle ?? "Open document"}
                  </Link>
                </td>
                <td className="px-3 py-3 max-w-xs">
                  {fact.sourcePage ? <p>Page {fact.sourcePage}</p> : null}
                  <p className="text-xs text-[var(--muted)]">
                    {fact.sourceExcerpt ?? "No excerpt stored"}
                  </p>
                </td>
                <td className="px-3 py-3 tabular-nums">{fact.confidence ?? "—"}</td>
                <td className="px-3 py-3">
                  <StatusBadge status={fact.verificationStatus} />
                </td>
                <td className="px-3 py-3">
                  {canReview ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <form action={approveFactAction}>
                          <input type="hidden" name="factId" value={fact.id} />
                          <button type="submit" className="text-xs font-medium text-[var(--accent)] hover:underline">
                            Approve
                          </button>
                        </form>
                        <form action={rejectFactAction}>
                          <input type="hidden" name="factId" value={fact.id} />
                          <button type="submit" className="text-xs font-medium text-rose-800 hover:underline">
                            Reject
                          </button>
                        </form>
                      </div>
                      <form action={correctFactAction} className="flex gap-2">
                        <input type="hidden" name="factId" value={fact.id} />
                        <input
                          name="amount"
                          defaultValue={fact.numericValue ?? ""}
                          inputMode="decimal"
                          aria-label={`Corrected amount for ${fact.label}`}
                          className="w-28 border border-[var(--border)] px-2 py-1 text-xs"
                        />
                        <button type="submit" className="text-xs font-medium hover:underline">
                          Save correction
                        </button>
                      </form>
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--muted)]">View only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
