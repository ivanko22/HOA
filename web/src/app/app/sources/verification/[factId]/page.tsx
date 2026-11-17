import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { documents, facts } from "@/lib/db/schema";
import { DocumentEvidencePreview } from "@/components/documents/document-evidence-preview";
import { StatusBadge } from "@/components/verification/status-badge";
import { VisualStatusBadge } from "@/components/verification/visual-status-badge";

function moneyLabel(value: string | null) {
  if (value == null) return "Missing";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

export default async function FactEvidenceComparePage({
  params,
}: {
  params: Promise<{ factId: string }>;
}) {
  const ctx = await requireTenantContext();
  const { factId } = await params;
  const [row] = await db
    .select({
      fact: facts,
      documentTitle: documents.title,
      mimeType: documents.mimeType,
    })
    .from(facts)
    .leftJoin(
      documents,
      and(
        eq(documents.id, facts.documentId),
        eq(documents.communityId, ctx.communityId),
      ),
    )
    .where(
      and(
        eq(facts.id, factId),
        eq(facts.communityId, ctx.communityId),
        eq(facts.organizationId, ctx.organizationId),
      ),
    )
    .limit(1);
  if (!row) notFound();
  const fact = row.fact;
  const page = Number(fact.sourcePage) > 0 ? Number(fact.sourcePage) : 1;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-[var(--muted)]">
          <Link href="/app/sources/verification" className="hover:underline">
            Verification report
          </Link>{" "}
          / {fact.label}
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Side-by-side evidence
        </h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="mb-3 text-xs uppercase tracking-wide text-[var(--muted)]">
            Original document page
          </p>
          <DocumentEvidencePreview
            documentId={fact.documentId}
            title={row.documentTitle ?? "Document"}
            initialPage={page}
            excerpt={fact.sourceExcerpt}
            matchText={fact.evidenceMatchText}
            amountLabel={moneyLabel(fact.numericValue)}
            mimeType={row.mimeType}
          />
        </div>
        <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Extracted fact
          </p>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-[var(--muted)]">Metric</dt>
              <dd className="font-medium">
                {fact.label}{" "}
                <span className="text-xs text-[var(--muted)]">({fact.factType})</span>
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Extracted amount</dt>
              <dd className="tabular-nums">{moneyLabel(fact.numericValue)}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Amount found in document</dt>
              <dd className="tabular-nums">{moneyLabel(fact.visualFoundValue)}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Period</dt>
              <dd>
                {fact.periodStart || fact.periodEnd
                  ? `${fact.periodStart ?? "?"} → ${fact.periodEnd ?? "?"}`
                  : fact.asOfDate ?? "Undated"}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Evidence excerpt</dt>
              <dd>{fact.evidenceMatchText ?? fact.sourceExcerpt ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Confidence</dt>
              <dd>{fact.confidence ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Human review status</dt>
              <dd>
                <StatusBadge status={fact.verificationStatus} />
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Visual verification</dt>
              <dd className="space-y-1">
                <VisualStatusBadge status={fact.visualVerificationStatus} />
                {fact.visualVerificationNotes ? (
                  <p className="text-xs text-[var(--muted)]">
                    {fact.visualVerificationNotes}
                  </p>
                ) : null}
              </dd>
            </div>
          </dl>
          <p className="mt-6 text-xs text-[var(--muted)]">
            Visual verification never changes human approval. Only authorized
            reviewers can approve facts in Fact Review.
          </p>
          <p className="mt-3">
            <Link
              href={`/app/documents/${fact.documentId}`}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              Open document record
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
