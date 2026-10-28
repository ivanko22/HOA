import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/auth/config";
import { getDocumentDetail } from "@/lib/services/documents";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { FactRow } from "@/components/documents/fact-row";
import { Badge } from "@/components/ui/badge";
import { can } from "@/lib/domain/permissions";
import { AddFactForm } from "./add-fact-form";
import { verifyFactAction } from "../actions";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const detail = await getDocumentDetail(ctx, id);
  if (!detail) notFound();

  const { document: doc, uploaderName, facts, links, verificationHistory, audit } =
    detail;
  const canManage = can(ctx.capabilities, "documents.manage");
  const canVerify = can(ctx.capabilities, "finance.verify");
  const hasFile = doc.byteSize > 0;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/app/documents"
          className="text-xs font-medium text-[var(--accent)] hover:underline"
        >
          ← Documents
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
              {doc.title}
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {doc.description ?? "No description."}
            </p>
          </div>
          <DocumentStatusBadge status={doc.processingStatus} />
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
          <h2 className="font-semibold">Metadata</h2>
          <dl className="mt-3 space-y-2">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Category</dt>
              <dd>{doc.category.replaceAll("_", " ")}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Document date</dt>
              <dd className="tabular-nums">{doc.documentDate ?? "Unknown"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Period</dt>
              <dd className="tabular-nums">
                {doc.periodStart || doc.periodEnd
                  ? `${doc.periodStart ?? "?"} → ${doc.periodEnd ?? "?"}`
                  : "Unknown"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Uploaded by</dt>
              <dd>{uploaderName ?? "Unknown"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Original file</dt>
              <dd>{doc.originalFilename ?? "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
          <h2 className="font-semibold">Source document</h2>
          {hasFile ? (
            <p className="mt-3">
              <a
                href={`/api/documents/${doc.id}/file`}
                className="font-medium text-[var(--accent)] hover:underline"
              >
                Download / open original
              </a>
              <span className="ml-2 text-xs text-[var(--muted)]">
                ({doc.mimeType}, {doc.byteSize} bytes)
              </span>
            </p>
          ) : (
            <p className="mt-3 text-[var(--muted)]">
              Catalog entry only — file bytes are not stored yet. Upload a file
              or attach the original when available.
            </p>
          )}
        </div>
      </section>

      <section className="border border-[var(--border)] bg-[var(--surface)]">
        <header className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold">Extracted / recorded facts</h2>
          <p className="text-xs text-[var(--muted)]">
            Conflicting values are retained side-by-side; nothing is overwritten.
          </p>
        </header>
        {facts.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--muted)]">
            No facts recorded for this document yet.
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
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {facts.map((f) => (
                  <FactRow
                    key={f.id}
                    id={f.id}
                    label={f.label}
                    factType={f.factType}
                    value={f.value}
                    numericValue={f.numericValue}
                    unit={f.unit}
                    verificationStatus={f.verificationStatus}
                    sourcePage={f.sourcePage}
                    sourceReference={f.sourceReference}
                    sourceExcerpt={f.sourceExcerpt}
                    periodLabel={
                      f.periodStart || f.periodEnd || f.asOfDate
                        ? `Period ${f.periodStart ?? f.asOfDate ?? "?"} → ${f.periodEnd ?? f.asOfDate ?? "?"}`
                        : null
                    }
                    actions={
                      canVerify ? (
                        <form action={verifyFactAction} className="flex flex-wrap gap-2">
                          <input type="hidden" name="factId" value={f.id} />
                          <input type="hidden" name="documentId" value={doc.id} />
                          <button
                            name="status"
                            value="verified"
                            className="border border-[var(--border)] px-2 py-1 text-xs hover:bg-white"
                          >
                            Mark verified
                          </button>
                          <button
                            name="status"
                            value="reported"
                            className="border border-[var(--border)] px-2 py-1 text-xs hover:bg-white"
                          >
                            Mark reported
                          </button>
                          <button
                            name="status"
                            value="needs_review"
                            className="border border-[var(--border)] px-2 py-1 text-xs hover:bg-white"
                          >
                            Needs review
                          </button>
                        </form>
                      ) : null
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage ? <AddFactForm documentId={doc.id} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border border-[var(--border)] bg-[var(--surface)]">
          <header className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">
            Related entities
          </header>
          {links.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--muted)]">
              No related entities linked.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-sm">
              {links.map((l) => (
                <li key={l.id} className="flex justify-between px-4 py-2">
                  <span>{l.entityType}</span>
                  <span className="font-mono text-xs text-[var(--muted)]">
                    {l.entityId}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border border-[var(--border)] bg-[var(--surface)]">
          <header className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">
            Verification history
          </header>
          {verificationHistory.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--muted)]">
              No verifications recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-sm">
              {verificationHistory.map((v) => (
                <li key={v.factId} className="px-4 py-2">
                  <p className="font-medium">{v.label}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {v.status} · {v.verifiedAt ?? "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="border border-[var(--border)] bg-[var(--surface)]">
        <header className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">
          Audit history
        </header>
        {audit.length === 0 ? (
          <p className="px-4 py-3 text-sm text-[var(--muted)]">
            No audit events for this document.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] text-sm">
            {audit.map((a) => (
              <li key={a.id} className="px-4 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default">{a.action}</Badge>
                  <span className="text-xs text-[var(--muted)]">
                    {a.createdAt.toISOString()}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-[var(--muted)]">
                  {a.after?.slice(0, 160) ?? "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
