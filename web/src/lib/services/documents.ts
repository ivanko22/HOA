import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  auditEvents,
  documentLinks,
  documents,
  facts,
  provenanceRecords,
  users,
} from "@/lib/db/schema";
import type {
  DocumentCategory,
  DocumentProcessingStatus,
  VerificationStatus,
} from "@/lib/domain/enums";
import {
  createFactInputSchema,
  detectConflicts,
  resolveDocumentProcessingStatus,
  type CreateFactInput,
} from "@/lib/domain/facts";
import {
  assertCan,
  type TenantContext,
} from "@/lib/domain/permissions";
import { getStorageProvider } from "@/lib/storage";
import { recordAudit } from "./audit";

export type DocumentListFilters = {
  category?: DocumentCategory;
  year?: number;
  processingStatus?: DocumentProcessingStatus;
  relatedEntityType?: string;
  q?: string;
};

export type DocumentListItem = {
  id: string;
  title: string;
  category: DocumentCategory;
  documentDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  processingStatus: DocumentProcessingStatus;
  factCount: number;
  relatedSummary: string[];
  uploadedAt: string;
  uploadedByName: string | null;
  byteSize: number;
};

function tenantDocFilter(ctx: TenantContext) {
  return and(
    eq(documents.organizationId, ctx.organizationId),
    eq(documents.communityId, ctx.communityId),
  );
}

export async function listDocuments(
  ctx: TenantContext,
  filters: DocumentListFilters = {},
): Promise<DocumentListItem[]> {
  assertCan(ctx.capabilities, "documents.read");

  const rows = await db
    .select({
      document: documents,
      uploaderName: users.name,
    })
    .from(documents)
    .leftJoin(users, eq(documents.uploadedBy, users.id))
    .where(tenantDocFilter(ctx))
    .orderBy(desc(documents.documentDate), desc(documents.createdAt));

  const allFacts = await db
    .select({
      id: facts.id,
      documentId: facts.documentId,
    })
    .from(facts)
    .where(
      and(
        eq(facts.organizationId, ctx.organizationId),
        eq(facts.communityId, ctx.communityId),
      ),
    );

  const allLinks = await db
    .select()
    .from(documentLinks)
    .where(
      and(
        eq(documentLinks.organizationId, ctx.organizationId),
        eq(documentLinks.communityId, ctx.communityId),
      ),
    );

  const factCountByDoc = new Map<string, number>();
  for (const f of allFacts) {
    factCountByDoc.set(f.documentId, (factCountByDoc.get(f.documentId) ?? 0) + 1);
  }

  const linksByDoc = new Map<string, string[]>();
  for (const l of allLinks) {
    const list = linksByDoc.get(l.documentId) ?? [];
    list.push(l.entityType);
    linksByDoc.set(l.documentId, list);
  }

  return rows
    .map(({ document: d, uploaderName }) => {
      const related = [...new Set(linksByDoc.get(d.id) ?? [])];
      return {
        id: d.id,
        title: d.title,
        category: d.category,
        documentDate: d.documentDate,
        periodStart: d.periodStart,
        periodEnd: d.periodEnd,
        processingStatus: d.processingStatus,
        factCount: factCountByDoc.get(d.id) ?? 0,
        relatedSummary: related,
        uploadedAt: d.createdAt.toISOString(),
        uploadedByName: uploaderName,
        byteSize: d.byteSize,
      } satisfies DocumentListItem;
    })
    .filter((d) => {
      if (filters.category && d.category !== filters.category) return false;
      if (filters.processingStatus && d.processingStatus !== filters.processingStatus) {
        return false;
      }
      if (filters.year) {
        const y = d.documentDate?.slice(0, 4) ?? d.periodStart?.slice(0, 4);
        if (y !== String(filters.year)) return false;
      }
      if (filters.relatedEntityType) {
        if (!d.relatedSummary.includes(filters.relatedEntityType)) return false;
      }
      if (filters.q) {
        const q = filters.q.toLowerCase();
        if (!d.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
}

export async function getDocumentDetail(ctx: TenantContext, documentId: string) {
  assertCan(ctx.capabilities, "documents.read");

  const [row] = await db
    .select({
      document: documents,
      uploaderName: users.name,
    })
    .from(documents)
    .leftJoin(users, eq(documents.uploadedBy, users.id))
    .where(and(tenantDocFilter(ctx), eq(documents.id, documentId)))
    .limit(1);

  if (!row) return null;

  const factRows = await db
    .select()
    .from(facts)
    .where(
      and(
        eq(facts.documentId, documentId),
        eq(facts.organizationId, ctx.organizationId),
        eq(facts.communityId, ctx.communityId),
      ),
    )
    .orderBy(desc(facts.createdAt));

  const links = await db
    .select()
    .from(documentLinks)
    .where(
      and(
        eq(documentLinks.documentId, documentId),
        eq(documentLinks.organizationId, ctx.organizationId),
      ),
    );

  const verificationHistory = factRows
    .filter((f) => f.verifiedAt != null)
    .map((f) => ({
      factId: f.id,
      label: f.label,
      status: f.verificationStatus,
      verifiedBy: f.verifiedBy,
      verifiedAt: f.verifiedAt?.toISOString() ?? null,
    }));

  const audit = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, ctx.organizationId),
        eq(auditEvents.communityId, ctx.communityId),
        or(
          and(
            eq(auditEvents.entityType, "document"),
            eq(auditEvents.entityId, documentId),
          ),
          sql`${auditEvents.after}::text like ${"%" + documentId + "%"}`,
        ),
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(50);

  return {
    document: row.document,
    uploaderName: row.uploaderName,
    facts: factRows,
    links,
    verificationHistory,
    audit,
  };
}

export async function uploadDocument(
  ctx: TenantContext,
  input: {
    title: string;
    category: DocumentCategory;
    documentDate?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    description?: string | null;
    file: { name: string; type: string; bytes: Buffer };
  },
) {
  assertCan(ctx.capabilities, "documents.manage");

  const stored = await getStorageProvider().putObject({
    communityId: ctx.communityId,
    originalFilename: input.file.name,
    mimeType: input.file.type || "application/octet-stream",
    body: input.file.bytes,
  });

  const [doc] = await db
    .insert(documents)
    .values({
      organizationId: ctx.organizationId,
      communityId: ctx.communityId,
      title: input.title,
      category: input.category,
      description: input.description ?? null,
      storageProvider: stored.storageProvider,
      storageKey: stored.storageKey,
      originalFilename: stored.originalFilename,
      mimeType: stored.mimeType,
      byteSize: stored.size,
      documentDate: input.documentDate ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      processingStatus: "needs_review",
      uploadedBy: ctx.userId,
      tags: [],
    })
    .returning();

  await recordAudit({
    ctx,
    action: "document.upload",
    entityType: "document",
    entityId: doc.id,
    after: {
      title: doc.title,
      category: doc.category,
      storageKey: doc.storageKey,
      byteSize: doc.byteSize,
    },
  });

  return doc;
}

async function refreshDocumentProcessingStatus(
  ctx: TenantContext,
  documentId: string,
) {
  const factRows = await db
    .select({ verificationStatus: facts.verificationStatus })
    .from(facts)
    .where(eq(facts.documentId, documentId));

  const status = resolveDocumentProcessingStatus(factRows);
  await db
    .update(documents)
    .set({ processingStatus: status, updatedAt: new Date() })
    .where(
      and(eq(documents.id, documentId), eq(documents.communityId, ctx.communityId)),
    );
  return status;
}

export async function addManualFact(ctx: TenantContext, raw: CreateFactInput) {
  assertCan(ctx.capabilities, "documents.manage");
  const input = createFactInputSchema.parse(raw);

  const [doc] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, input.documentId),
        eq(documents.organizationId, ctx.organizationId),
        eq(documents.communityId, ctx.communityId),
      ),
    )
    .limit(1);
  if (!doc) throw new Error("Document not found");

  const peers = await db
    .select()
    .from(facts)
    .where(
      and(
        eq(facts.communityId, ctx.communityId),
        eq(facts.factType, input.factType),
      ),
    );

  const conflict = detectConflicts(
    {
      factType: input.factType,
      numericValue: input.numericValue ?? null,
      value: input.value ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      asOfDate: input.asOfDate ?? null,
    },
    peers.map((p) => ({
      id: p.id,
      factType: p.factType,
      numericValue: p.numericValue,
      value: p.value,
      verificationStatus: p.verificationStatus,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      asOfDate: p.asOfDate,
      documentId: p.documentId,
    })),
  );

  let status: VerificationStatus = input.verificationStatus;
  if (conflict.isConflict) {
    status = "conflicting";
    if (conflict.conflictingIds.length) {
      await db
        .update(facts)
        .set({
          verificationStatus: "conflicting",
          updatedAt: new Date(),
        })
        .where(inArray(facts.id, conflict.conflictingIds));
    }
  }

  const [provenance] = await db
    .insert(provenanceRecords)
    .values({
      organizationId: ctx.organizationId,
      communityId: ctx.communityId,
      sourceDocumentId: doc.id,
      sourcePage: input.sourcePage ?? null,
      sourceReference: input.sourceReference ?? null,
      sourceExcerpt: input.sourceExcerpt ?? null,
      verificationStatus: status,
      confidence: input.confidence ?? null,
      enteredBy: ctx.userId,
      notes: input.notes ?? null,
    })
    .returning();

  const [fact] = await db
    .insert(facts)
    .values({
      organizationId: ctx.organizationId,
      communityId: ctx.communityId,
      documentId: doc.id,
      factType: input.factType,
      label: input.label,
      value: input.value ?? null,
      numericValue: input.numericValue ?? null,
      unit: input.unit ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      asOfDate: input.asOfDate ?? null,
      sourcePage: input.sourcePage ?? null,
      sourceReference: input.sourceReference ?? null,
      sourceExcerpt: input.sourceExcerpt ?? null,
      verificationStatus: status,
      confidence: input.confidence ?? null,
      notes: input.notes ?? null,
      provenanceId: provenance.id,
      createdBy: ctx.userId,
    })
    .returning();

  await refreshDocumentProcessingStatus(ctx, doc.id);

  await recordAudit({
    ctx,
    action: "fact.create",
    entityType: "fact",
    entityId: fact.id,
    after: {
      documentId: doc.id,
      factType: fact.factType,
      numericValue: fact.numericValue,
      verificationStatus: fact.verificationStatus,
      conflictingWith: conflict.conflictingIds,
    },
  });

  return fact;
}

export async function verifyFact(
  ctx: TenantContext,
  factId: string,
  nextStatus: Extract<VerificationStatus, "verified" | "reported" | "needs_review">,
) {
  assertCan(ctx.capabilities, "finance.verify");

  const [existing] = await db
    .select()
    .from(facts)
    .where(
      and(
        eq(facts.id, factId),
        eq(facts.organizationId, ctx.organizationId),
        eq(facts.communityId, ctx.communityId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Fact not found");

  const [updated] = await db
    .update(facts)
    .set({
      verificationStatus: nextStatus,
      verifiedBy: ctx.userId,
      verifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(facts.id, factId))
    .returning();

  if (existing.provenanceId) {
    await db
      .update(provenanceRecords)
      .set({
        verificationStatus: nextStatus,
        verifiedBy: ctx.userId,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(provenanceRecords.id, existing.provenanceId));
  }

  await refreshDocumentProcessingStatus(ctx, existing.documentId);

  await recordAudit({
    ctx,
    action: "fact.verify",
    entityType: "fact",
    entityId: factId,
    before: { verificationStatus: existing.verificationStatus },
    after: { verificationStatus: nextStatus },
  });

  return updated;
}
