import Link from "next/link";
import { requireTenantContext } from "@/lib/auth/config";
import {
  visualVerificationStatuses,
  type VisualVerificationStatus,
} from "@/lib/domain/enums";
import { can } from "@/lib/domain/permissions";
import { listVerificationReport } from "@/lib/services/visual-verification";
import { DocumentThumbnail } from "@/components/documents/document-thumbnail";
import { VisualStatusBadge } from "@/components/verification/visual-status-badge";
import {
  runVisualVerificationBatchAction,
  runVisualVerificationForDocumentAction,
} from "./actions";

function moneyLabel(value: string | null) {
  if (value == null) return "Missing";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

export default async function DocumentVerificationReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    metric?: string;
    status?: string;
    documentId?: string;
  }>;
}) {
  const ctx = await requireTenantContext();
  const sp = await searchParams;
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : null;
  const visualStatus = visualVerificationStatuses.includes(
    sp.status as VisualVerificationStatus,
  )
    ? (sp.status as VisualVerificationStatus)
    : null;
  const canRun = can(ctx.capabilities, "documents.manage");
  const { summary, rows } = await listVerificationReport(ctx, {
    year,
    factType: sp.metric || null,
    visualStatus,
    documentId: sp.documentId || null,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-[var(--muted)]">
            <Link href="/app/sources" className="hover:underline">
              Sources
            </Link>{" "}
            / Verification
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl tracking-tight">
            Document Verification Report
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Automated visual evidence checks stay separate from human approval.
            A visual match never marks a fact verified by itself.
          </p>
        </div>
        {canRun ? (
          <form action={runVisualVerificationBatchAction}>
            <button
              type="submit"
              className="bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Run verification batch
            </button>
          </form>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Documents with amounts", summary.documentsWithAmounts],
          ["Financial facts", summary.totalFacts],
          ["Visual matches", summary.visualMatch],
          ["Mismatches", summary.mismatch],
          ["Ambiguous", summary.ambiguous],
          ["Unable to verify", summary.unable],
          ["Not yet checked", summary.unchecked],
          ["No renderable file", summary.documentsWithoutPreview],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
          >
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              {label}
            </p>
            <p className="mt-1 text-2xl tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Year
          </span>
          <input
            name="year"
            defaultValue={sp.year ?? ""}
            className="border border-[var(--border)] bg-white px-2 py-1"
            placeholder="2026"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Metric
          </span>
          <input
            name="metric"
            defaultValue={sp.metric ?? ""}
            className="border border-[var(--border)] bg-white px-2 py-1"
            placeholder="monthly_dues_collected"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Visual status
          </span>
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            className="border border-[var(--border)] bg-white px-2 py-1"
          >
            <option value="">All</option>
            {visualVerificationStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="border border-[var(--border)] bg-[var(--surface)] px-3 py-1"
        >
          Filter
        </button>
      </form>

      <div className="overflow-x-auto border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface-hover)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Preview</th>
              <th className="px-3 py-2">Document</th>
              <th className="px-3 py-2">Extracted</th>
              <th className="px-3 py-2">Found in document</th>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2">Visual status</th>
              <th className="px-3 py-2">Compare</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-[var(--muted)]">
                  No financial facts match these filters.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[var(--border)] align-top last:border-0"
              >
                <td className="px-3 py-3">
                  <DocumentThumbnail
                    documentId={row.documentId}
                    title={row.documentTitle ?? "Document"}
                    page={row.sourcePage}
                    excerpt={row.evidenceMatchText}
                    matchText={row.evidenceMatchText}
                    amountLabel={moneyLabel(row.numericValue)}
                    mimeType={row.mimeType}
                  />
                </td>
                <td className="px-3 py-3">
                  <Link
                    href={`/app/documents/${row.documentId}`}
                    className="font-medium text-[var(--accent)] hover:underline"
                  >
                    {row.documentTitle ?? "Document"}
                  </Link>
                  <p className="text-xs text-[var(--muted)]">{row.label}</p>
                  {canRun ? (
                    <form
                      action={runVisualVerificationForDocumentAction}
                      className="mt-2"
                    >
                      <input type="hidden" name="documentId" value={row.documentId} />
                      <button
                        type="submit"
                        className="text-xs text-[var(--accent)] hover:underline"
                      >
                        Re-check document
                      </button>
                    </form>
                  ) : null}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {moneyLabel(row.numericValue)}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {moneyLabel(row.visualFoundValue)}
                  {row.visualVerificationNotes ? (
                    <p className="mt-1 max-w-xs text-xs text-[var(--muted)]">
                      {row.visualVerificationNotes}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  {row.periodStart || row.periodEnd
                    ? `${row.periodStart ?? "?"} → ${row.periodEnd ?? "?"}`
                    : row.asOfDate ?? "Undated"}
                </td>
                <td className="px-3 py-3">
                  <VisualStatusBadge status={row.visualVerificationStatus} />
                </td>
                <td className="px-3 py-3">
                  <Link
                    href={`/app/sources/verification/${row.id}`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    Side-by-side
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
