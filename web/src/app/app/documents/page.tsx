import Link from "next/link";
import { requireTenantContext } from "@/lib/auth/config";
import { listDocuments } from "@/lib/services/documents";
import {
  documentCategories,
  documentProcessingStatuses,
  type DocumentCategory,
  type DocumentProcessingStatus,
} from "@/lib/domain/enums";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { Badge } from "@/components/ui/badge";
import { UploadDocumentForm } from "./upload-form";

const categoryLabels: Record<DocumentCategory, string> = {
  meeting_minutes: "Meeting Minutes",
  financial_statement: "Financial Statement",
  bank_statement: "Bank Statement",
  invoice: "Invoice",
  insurance: "Insurance",
  contract: "Contract",
  legal: "Legal",
  inspection: "Inspection",
  quote: "Quote",
  other: "Other",
};

function periodLabel(d: {
  documentDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}) {
  if (d.periodStart || d.periodEnd) {
    return `${d.periodStart ?? "?"} → ${d.periodEnd ?? "?"}`;
  }
  return d.documentDate ?? "Unknown";
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    year?: string;
    status?: string;
    related?: string;
    q?: string;
  }>;
}) {
  const ctx = await requireTenantContext();
  const params = await searchParams;

  const rows = await listDocuments(ctx, {
    category: params.category as DocumentCategory | undefined,
    year: params.year ? Number(params.year) : undefined,
    processingStatus: params.status as DocumentProcessingStatus | undefined,
    relatedEntityType: params.related,
    q: params.q,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
            Documents
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Source-of-truth ingestion. Facts from documents stay reported until
            verified; unknown values are never shown as zero.
          </p>
        </div>
        <UploadDocumentForm />
      </div>

      <form className="grid gap-3 border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-5">
        <label className="text-sm">
          <span className="text-xs text-[var(--muted)]">Search</span>
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Title"
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs text-[var(--muted)]">Category</span>
          <select
            name="category"
            defaultValue={params.category ?? ""}
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          >
            <option value="">All</option>
            {documentCategories.map((c) => (
              <option key={c} value={c}>
                {categoryLabels[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs text-[var(--muted)]">Year</span>
          <input
            name="year"
            type="number"
            min={2000}
            max={2100}
            defaultValue={params.year ?? ""}
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs text-[var(--muted)]">Verification status</span>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          >
            <option value="">All</option>
            {documentProcessingStatuses.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs text-[var(--muted)]">Related entity</span>
          <input
            name="related"
            defaultValue={params.related ?? ""}
            placeholder="e.g. building"
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <div className="md:col-span-5">
          <button
            type="submit"
            className="border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--surface-hover)]"
          >
            Apply filters
          </button>
        </div>
      </form>

      <div className="overflow-x-auto border border-[var(--border)] bg-[var(--surface)]">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-[var(--muted)]">
            No documents match these filters. Upload a source document to begin
            capturing facts.
          </p>
        ) : (
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-[var(--surface-hover)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-2">Document</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Period / Date</th>
                <th className="px-4 py-2">Verification Status</th>
                <th className="px-4 py-2">Facts</th>
                <th className="px-4 py-2">Related To</th>
                <th className="px-4 py-2">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3">
                    <Link
                      href={`/app/documents/${d.id}`}
                      className="font-medium text-[var(--accent)] hover:underline"
                    >
                      {d.title}
                    </Link>
                    {d.byteSize === 0 ? (
                      <p className="text-xs text-[var(--muted)]">
                        Catalog entry (no file bytes)
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="default">{categoryLabels[d.category]}</Badge>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{periodLabel(d)}</td>
                  <td className="px-4 py-3">
                    <DocumentStatusBadge status={d.processingStatus} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">{d.factCount}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {d.relatedSummary.length
                      ? d.relatedSummary.join(", ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">
                    <p>{d.uploadedByName ?? "Unknown"}</p>
                    <p className="tabular-nums">
                      {new Date(d.uploadedAt).toLocaleString("en-US", {
                        timeZone: "America/New_York",
                      })}{" "}
                      ET
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
