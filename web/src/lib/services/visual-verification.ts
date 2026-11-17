import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { documents, facts } from "@/lib/db/schema";
import type { VisualVerificationStatus } from "@/lib/domain/enums";
import {
  locateEvidenceInDocumentText,
  visualStatusLabel,
  type EvidenceHit,
} from "@/lib/domain/visual-verification";
import { textForExtraction } from "@/lib/domain/extract-text";
import { assertCan, type TenantContext } from "@/lib/domain/permissions";
import { getStorageProvider } from "@/lib/storage";
import { recordAudit } from "./audit";

export type VerificationReportFilters = {
  year?: number | null;
  factType?: string | null;
  visualStatus?: VisualVerificationStatus | null;
  documentId?: string | null;
};

export type VerificationReportRow = {
  id: string;
  label: string;
  factType: string;
  numericValue: string | null;
  visualFoundValue: string | null;
  visualVerificationStatus: VisualVerificationStatus;
  visualVerificationNotes: string | null;
  evidenceMatchText: string | null;
  sourcePage: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  asOfDate: string | null;
  verificationStatus: string;
  documentId: string;
  documentTitle: string | null;
  mimeType: string | null;
  contentHash: string | null;
};

export type VerificationReportSummary = {
  documentsChecked: number;
  documentsWithAmounts: number;
  totalFacts: number;
  visualMatch: number;
  mismatch: number;
  ambiguous: number;
  unable: number;
  unchecked: number;
  documentsWithoutPreview: number;
};

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function listVerificationReport(
  ctx: TenantContext,
  filters: VerificationReportFilters = {},
): Promise<{ summary: VerificationReportSummary; rows: VerificationReportRow[] }> {
  assertCan(ctx.capabilities, "finance.read");
  const rows = await db
    .select({
      id: facts.id,
      label: facts.label,
      factType: facts.factType,
      numericValue: facts.numericValue,
      visualFoundValue: facts.visualFoundValue,
      visualVerificationStatus: facts.visualVerificationStatus,
      visualVerificationNotes: facts.visualVerificationNotes,
      evidenceMatchText: facts.evidenceMatchText,
      sourcePage: facts.sourcePage,
      periodStart: facts.periodStart,
      periodEnd: facts.periodEnd,
      asOfDate: facts.asOfDate,
      verificationStatus: facts.verificationStatus,
      documentId: facts.documentId,
      documentTitle: documents.title,
      mimeType: documents.mimeType,
      contentHash: documents.contentHash,
      byteSize: documents.byteSize,
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
        eq(facts.organizationId, ctx.organizationId),
        eq(facts.communityId, ctx.communityId),
      ),
    )
    .orderBy(desc(facts.updatedAt))
    .limit(2000);

  const filtered = rows.filter((row) => {
    if (filters.documentId && row.documentId !== filters.documentId) return false;
    if (filters.factType && row.factType !== filters.factType) return false;
    if (filters.visualStatus && row.visualVerificationStatus !== filters.visualStatus) {
      return false;
    }
    if (filters.year != null) {
      const start = row.periodStart ?? row.asOfDate;
      if (!start || !start.startsWith(String(filters.year))) return false;
    }
    return row.numericValue != null;
  });

  const documentIds = new Set(filtered.map((row) => row.documentId));
  const summary: VerificationReportSummary = {
    documentsChecked: documentIds.size,
    documentsWithAmounts: documentIds.size,
    totalFacts: filtered.length,
    visualMatch: filtered.filter((row) => row.visualVerificationStatus === "visual_match")
      .length,
    mismatch: filtered.filter((row) => row.visualVerificationStatus === "mismatch").length,
    ambiguous: filtered.filter((row) => row.visualVerificationStatus === "ambiguous").length,
    unable: filtered.filter((row) => row.visualVerificationStatus === "unable").length,
    unchecked: filtered.filter((row) => row.visualVerificationStatus === "unchecked")
      .length,
    documentsWithoutPreview: filtered.filter(
      (row) => !row.byteSize || row.byteSize <= 0,
    ).length,
  };

  return {
    summary,
    rows: filtered.map((row) => ({
      id: row.id,
      label: row.label,
      factType: row.factType,
      numericValue: row.numericValue,
      visualFoundValue: row.visualFoundValue,
      visualVerificationStatus: row.visualVerificationStatus,
      visualVerificationNotes: row.visualVerificationNotes,
      evidenceMatchText: row.evidenceMatchText,
      sourcePage: row.sourcePage,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      asOfDate: row.asOfDate,
      verificationStatus: row.verificationStatus,
      documentId: row.documentId,
      documentTitle: row.documentTitle,
      mimeType: row.mimeType,
      contentHash: row.contentHash,
    })),
  };
}

export async function verifyDocumentFacts(
  ctx: TenantContext,
  documentId: string,
): Promise<{ checked: number; results: EvidenceHit[] }> {
  assertCan(ctx.capabilities, "documents.manage");
  const [doc] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.communityId, ctx.communityId),
        eq(documents.organizationId, ctx.organizationId),
      ),
    )
    .limit(1);
  if (!doc) throw new Error("Document not found");
  if (doc.byteSize <= 0) {
    return { checked: 0, results: [] };
  }

  const stored = await getStorageProvider().getObject(doc.storageKey);
  const hash = sha256(stored.body);
  if (doc.contentHash !== hash) {
    await db
      .update(documents)
      .set({ contentHash: hash, updatedAt: new Date() })
      .where(and(eq(documents.id, doc.id), eq(documents.communityId, ctx.communityId)));
  }

  const text = textForExtraction(
    stored.body,
    doc.mimeType || stored.mimeType || "",
    doc.originalFilename || doc.title,
  );
  const factRows = await db
    .select()
    .from(facts)
    .where(
      and(
        eq(facts.communityId, ctx.communityId),
        eq(facts.documentId, documentId),
        sql`${facts.numericValue} is not null`,
      ),
    );

  const results: EvidenceHit[] = [];
  for (const fact of factRows) {
    const hit = locateEvidenceInDocumentText(text, {
      factType: fact.factType,
      label: fact.label,
      numericValue: fact.numericValue,
      preferredPage: fact.sourcePage,
      periodStart: fact.periodStart,
      periodEnd: fact.periodEnd,
      sourceExcerpt: fact.sourceExcerpt,
    });
    results.push(hit);
    await db
      .update(facts)
      .set({
        visualVerificationStatus: hit.status,
        visualFoundValue: hit.foundValue,
        visualVerificationNotes: hit.reason,
        evidenceMatchText: hit.matchText,
        evidenceBbox: hit.bbox,
        contentHash: hash,
        sourcePage: hit.page != null ? String(hit.page) : fact.sourcePage,
        updatedAt: new Date(),
      })
      .where(and(eq(facts.id, fact.id), eq(facts.communityId, ctx.communityId)));
    await recordAudit({
      ctx,
      action: "fact.visual_verify",
      entityType: "fact",
      entityId: fact.id,
      before: {
        visualVerificationStatus: fact.visualVerificationStatus,
        numericValue: fact.numericValue,
      },
      after: {
        visualVerificationStatus: hit.status,
        foundValue: hit.foundValue,
        reason: hit.reason,
      },
    });
  }
  return { checked: results.length, results };
}

export async function verifyFactsBatch(
  ctx: TenantContext,
  limit = 20,
): Promise<{ documents: number; facts: number }> {
  assertCan(ctx.capabilities, "documents.manage");
  const pending = await db
    .select({ documentId: facts.documentId })
    .from(facts)
    .where(
      and(
        eq(facts.communityId, ctx.communityId),
        inArray(facts.visualVerificationStatus, ["unchecked", "unable"]),
        sql`${facts.numericValue} is not null`,
      ),
    )
    .limit(200);
  const uniqueDocs = [...new Set(pending.map((row) => row.documentId))].slice(0, limit);
  let factCount = 0;
  for (const documentId of uniqueDocs) {
    const result = await verifyDocumentFacts(ctx, documentId);
    factCount += result.checked;
  }
  return { documents: uniqueDocs.length, facts: factCount };
}

export { visualStatusLabel };
export type { EvidenceHit };
