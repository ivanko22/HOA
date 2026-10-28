import Link from "next/link";
import { requireTenantContext } from "@/lib/auth/config";
import { can } from "@/lib/domain/permissions";
import { listImportBatches } from "@/lib/services/imports";
import { Badge } from "@/components/ui/badge";

const statusVariant: Record<
  string,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  uploaded: "pending",
  parsing: "processing",
  needs_mapping: "needs_review",
  needs_review: "needs_review",
  partially_approved: "partially_verified",
  approved: "verified",
  failed: "conflicting",
};

export default async function ImportsPage() {
  const ctx = await requireTenantContext();
  const batches = await listImportBatches(ctx);
  const canImport = can(ctx.capabilities, "import.csv");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
            Imports
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            CSV rows stay raw until mapped, validated, reviewed, and approved.
            Approved rows become transactions — not verified facts.
          </p>
        </div>
        {canImport ? (
          <Link
            href="/app/imports/new"
            className="inline-flex bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            New import
          </Link>
        ) : null}
      </div>

      <div className="overflow-x-auto border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface-hover)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">File</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Rows</th>
              <th className="px-4 py-3 font-medium">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  No import batches yet.
                </td>
              </tr>
            ) : (
              batches.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/app/imports/${b.id}`}
                      className="font-medium text-[var(--accent)] hover:underline"
                    >
                      {b.originalFilename}
                    </Link>
                    {b.uploaderName ? (
                      <p className="text-xs text-[var(--muted)]">
                        by {b.uploaderName}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {b.sourceType}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant[b.status] ?? "default"}>
                      {b.status.replaceAll("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {b.rowCount}
                    <span className="text-[var(--muted)]">
                      {" "}
                      · {b.validRowCount} valid · {b.errorRowCount} err ·{" "}
                      {b.duplicateRowCount} dup
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {b.uploadedAt.toLocaleString("en-US", {
                      timeZone: "America/New_York",
                    })}{" "}
                    ET
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
