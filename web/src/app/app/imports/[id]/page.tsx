import Link from "next/link";
import { requireTenantContext } from "@/lib/auth/config";
import {
  canonicalImportFields,
  importClassifications,
} from "@/lib/domain/import-csv";
import { can } from "@/lib/domain/permissions";
import { getImportBatchDetail } from "@/lib/services/imports";
import { Badge } from "@/components/ui/badge";
import { bulkReviewAction, saveMappingAction } from "../actions";

const fieldLabels: Record<(typeof canonicalImportFields)[number], string> = {
  date: "Date",
  description: "Description",
  amount: "Amount",
  debit: "Debit",
  credit: "Credit",
  unit: "Unit",
  owner: "Owner",
  vendor: "Vendor",
  category: "Category",
  reference: "Reference",
  externalId: "External ID",
};

const rowStatusVariant: Record<
  string,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  needs_review: "needs_review",
  invalid: "conflicting",
  duplicate: "estimated",
  ready: "reported",
  approved: "verified",
  rejected: "unknown",
};

type Normalized = {
  date?: string | null;
  description?: string | null;
  amount?: string | null;
  category?: string | null;
  unit?: string | null;
  owner?: string | null;
  vendor?: string | null;
};

export default async function ImportBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const ctx = await requireTenantContext();
  const { id } = await params;
  const sp = await searchParams;
  const filter =
    sp.filter === "needs_review" ||
    sp.filter === "invalid" ||
    sp.filter === "duplicate" ||
    sp.filter === "ready" ||
    sp.filter === "approved"
      ? sp.filter
      : "all";

  const { batch, rows, profiles } = await getImportBatchDetail(
    ctx,
    id,
    filter,
  );
  const canMap = can(ctx.capabilities, "import.csv");
  const canApprove = can(ctx.capabilities, "import.approve");
  const columns = (batch.detectedColumns as string[] | null) ?? [];
  const mapping = (batch.mapping as Record<string, string> | null) ?? {};
  const preview = rows.slice(0, 5);

  const filters = [
    "all",
    "needs_review",
    "invalid",
    "duplicate",
    "ready",
    "approved",
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-[var(--muted)]">
          <Link href="/app/imports" className="hover:underline">
            Imports
          </Link>{" "}
          / {batch.originalFilename}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
            {batch.originalFilename}
          </h1>
          <Badge variant="needs_review">
            {batch.status.replaceAll("_", " ")}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {batch.sourceType} · {batch.rowCount} rows · {batch.validRowCount}{" "}
          valid · {batch.errorRowCount} invalid · {batch.duplicateRowCount}{" "}
          duplicate
          {batch.documentId ? (
            <>
              {" "}
              ·{" "}
              <Link
                href={`/app/documents/${batch.documentId}`}
                className="text-[var(--accent)] hover:underline"
              >
                Source file
              </Link>
            </>
          ) : null}
        </p>
      </div>

      {(batch.status === "needs_mapping" ||
        batch.status === "uploaded" ||
        batch.status === "needs_review" ||
        batch.status === "parsing") &&
      canMap ? (
        <section className="space-y-4 border border-[var(--border)] bg-[var(--surface)] p-5">
          <div>
            <h2 className="text-lg font-semibold">Column mapping</h2>
            <p className="text-sm text-[var(--muted)]">
              Map source columns to canonical fields. Use amount or
              debit/credit. Invalid rows are kept with errors — never dropped.
            </p>
          </div>

          {preview.length > 0 ? (
            <div className="overflow-x-auto">
              <p className="mb-2 text-xs uppercase tracking-wide text-[var(--muted)]">
                Preview (first rows, raw)
              </p>
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-2 py-1">#</th>
                    {columns.map((c) => (
                      <th key={c} className="px-2 py-1 font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--border)]">
                      <td className="px-2 py-1 tabular-nums">{r.rowNumber}</td>
                      {columns.map((c) => (
                        <td key={c} className="px-2 py-1">
                          {(r.raw as Record<string, string>)[c] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <form action={saveMappingAction} className="space-y-4">
            <input type="hidden" name="batchId" value={batch.id} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {canonicalImportFields.map((field) => (
                <label key={field} className="block text-sm">
                  <span className="text-[var(--muted)]">
                    {fieldLabels[field]}
                    {field === "date" || field === "description"
                      ? " *"
                      : field === "amount"
                        ? " (or debit/credit)"
                        : ""}
                  </span>
                  <select
                    name={`map_${field}`}
                    className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
                    defaultValue={mapping[field] ?? ""}
                  >
                    <option value="">—</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <label className="block max-w-md text-sm">
              <span className="text-[var(--muted)]">
                Save as mapping profile (optional)
              </span>
              <input
                name="saveAsProfileName"
                placeholder={
                  profiles[0] ? `e.g. ${profiles[0].name}` : "e.g. Folio GL export"
                }
                className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className="bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Apply mapping &amp; validate
            </button>
          </form>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Review workspace</h2>
            <p className="text-sm text-[var(--muted)]">
              Classification suggestions are not authoritative. Unknown stays
              unknown until a human decides.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {filters.map((f) => (
              <Link
                key={f}
                href={`/app/imports/${batch.id}?filter=${f}`}
                className={
                  filter === f
                    ? "border border-[var(--accent)] bg-[var(--accent-soft)] px-2 py-1 text-[var(--accent)]"
                    : "border border-[var(--border)] px-2 py-1 text-[var(--muted)] hover:bg-[var(--surface-hover)]"
                }
              >
                {f === "all" ? "All" : f.replaceAll("_", " ")}
              </Link>
            ))}
          </div>
        </div>

        <form action={bulkReviewAction}>
          <input type="hidden" name="batchId" value={batch.id} />
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {canApprove ? (
              <>
                <button
                  type="submit"
                  name="action"
                  value="approve"
                  className="bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110"
                >
                  Approve selected
                </button>
                <button
                  type="submit"
                  name="action"
                  value="approve_all_ready"
                  className="border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface-hover)]"
                >
                  Approve all ready
                </button>
              </>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                Read-only: only Treasurer/Admin may approve imports.
              </p>
            )}
            {canMap ? (
              <>
                <button
                  type="submit"
                  name="action"
                  value="mark_ready"
                  className="border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface-hover)]"
                >
                  Mark ready
                </button>
                <button
                  type="submit"
                  name="action"
                  value="reject"
                  className="border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface-hover)]"
                >
                  Reject
                </button>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-[var(--muted)]">Set class</span>
                  <select
                    name="classification"
                    className="border border-[var(--border)] bg-white px-2 py-1"
                    defaultValue="unknown"
                  >
                    {importClassifications.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    name="action"
                    value="set_classification"
                    className="border border-[var(--border)] px-2 py-1 text-sm hover:bg-[var(--surface-hover)]"
                  >
                    Apply
                  </button>
                </label>
              </>
            ) : null}
          </div>

          <div className="overflow-x-auto border border-[var(--border)] bg-[var(--surface)]">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--surface-hover)] text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Source cat.</th>
                  <th className="px-3 py-2 font-medium">Mapped / class</th>
                  <th className="px-3 py-2 font-medium">Unit / Owner</th>
                  <th className="px-3 py-2 font-medium">Vendor</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-8 text-center text-[var(--muted)]"
                    >
                      No rows for this filter.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const n = (r.normalized ?? {}) as Normalized;
                    const errs = r.validationErrors ?? [];
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-[var(--border)] align-top last:border-0"
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            name="rowId"
                            value={r.id}
                            disabled={r.status === "approved"}
                          />
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {n.date ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <div>{n.description ?? "—"}</div>
                          {errs.length ? (
                            <ul className="mt-1 list-disc pl-4 text-xs text-rose-700">
                              {errs.map((e) => (
                                <li key={e}>{e}</li>
                              ))}
                            </ul>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {n.amount ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-[var(--muted)]">
                          {(r.raw as Record<string, string>)[
                            mapping.category ?? ""
                          ] ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <div>{n.category ?? "—"}</div>
                          <div className="text-xs text-[var(--muted)]">
                            {r.classification}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-[var(--muted)]">
                          {[n.unit, n.owner].filter(Boolean).join(" / ") || "—"}
                        </td>
                        <td className="px-3 py-2 text-[var(--muted)]">
                          {n.vendor ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            variant={rowStatusVariant[r.status] ?? "default"}
                          >
                            {r.status.replaceAll("_", " ")}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </form>
      </section>
    </div>
  );
}
