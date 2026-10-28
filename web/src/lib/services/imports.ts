import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  documents,
  financialTransactions,
  importBatches,
  importProfiles,
  importRows,
  users,
} from "@/lib/db/schema";
import {
  applyMapping,
  duplicateFingerprint,
  mappingSchema,
  parseCsv,
  suggestMapping,
  validateNormalized,
  type ImportClassification,
  type ImportSourceType,
  type NormalizedImportValues,
} from "@/lib/domain/import-csv";
import {
  assertCan,
  assertSameTenant,
  type TenantContext,
} from "@/lib/domain/permissions";
import { getStorageProvider } from "@/lib/storage";
import { recordAudit } from "./audit";

export type ImportRowFilter =
  | "needs_review"
  | "invalid"
  | "duplicate"
  | "ready"
  | "approved"
  | "all";

function tenantBatchFilter(ctx: TenantContext) {
  return and(
    eq(importBatches.organizationId, ctx.organizationId),
    eq(importBatches.communityId, ctx.communityId),
  );
}

async function getBatchOrThrow(ctx: TenantContext, batchId: string) {
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, batchId), tenantBatchFilter(ctx)))
    .limit(1);
  if (!batch) throw new Error("Import batch not found");
  assertSameTenant(ctx, batch.organizationId, batch.communityId);
  return batch;
}

export async function listImportBatches(ctx: TenantContext) {
  assertCan(ctx.capabilities, "finance.read");

  const rows = await db
    .select({
      batch: importBatches,
      uploaderName: users.name,
    })
    .from(importBatches)
    .leftJoin(users, eq(importBatches.uploadedBy, users.id))
    .where(tenantBatchFilter(ctx))
    .orderBy(desc(importBatches.uploadedAt));

  return rows.map(({ batch, uploaderName }) => ({
    ...batch,
    uploaderName,
  }));
}

export async function listImportProfiles(ctx: TenantContext) {
  assertCan(ctx.capabilities, "finance.read");
  return db
    .select()
    .from(importProfiles)
    .where(
      and(
        eq(importProfiles.organizationId, ctx.organizationId),
        eq(importProfiles.communityId, ctx.communityId),
      ),
    )
    .orderBy(desc(importProfiles.updatedAt));
}

export async function uploadImportCsv(
  ctx: TenantContext,
  input: {
    sourceType: ImportSourceType;
    file: { name: string; type: string; bytes: Buffer };
    profileId?: string | null;
  },
) {
  assertCan(ctx.capabilities, "import.csv");

  const text = input.file.bytes.toString("utf8");
  let parsed;
  try {
    parsed = parseCsv(text);
  } catch (err) {
    throw new Error(
      `Failed to parse CSV: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const stored = await getStorageProvider().putObject({
    communityId: ctx.communityId,
    originalFilename: input.file.name,
    mimeType: input.file.type || "text/csv",
    body: input.file.bytes,
  });

  const [doc] = await db
    .insert(documents)
    .values({
      organizationId: ctx.organizationId,
      communityId: ctx.communityId,
      title: `Import: ${input.file.name}`,
      category:
        input.sourceType === "bank_csv" ? "bank_statement" : "other",
      description: `CSV import source (${input.sourceType})`,
      storageProvider: stored.storageProvider,
      storageKey: stored.storageKey,
      originalFilename: stored.originalFilename,
      mimeType: stored.mimeType,
      byteSize: stored.size,
      processingStatus: "needs_review",
      uploadedBy: ctx.userId,
      tags: ["import", input.sourceType],
    })
    .returning();

  let mapping: Record<string, string> = suggestMapping(
    parsed.headers,
    input.sourceType,
  );
  let profileId: string | null = input.profileId ?? null;

  if (profileId) {
    const [profile] = await db
      .select()
      .from(importProfiles)
      .where(
        and(
          eq(importProfiles.id, profileId),
          eq(importProfiles.organizationId, ctx.organizationId),
          eq(importProfiles.communityId, ctx.communityId),
        ),
      )
      .limit(1);
    if (profile) {
      mapping = profile.mapping;
    } else {
      profileId = null;
    }
  }

  const [batch] = await db
    .insert(importBatches)
    .values({
      organizationId: ctx.organizationId,
      communityId: ctx.communityId,
      documentId: doc.id,
      sourceType: input.sourceType,
      originalFilename: input.file.name,
      storageProvider: stored.storageProvider,
      storageKey: stored.storageKey,
      mimeType: stored.mimeType,
      byteSize: stored.size,
      status: "needs_mapping",
      rowCount: parsed.rows.length,
      detectedColumns: parsed.headers,
      mapping,
      profileId,
      uploadedBy: ctx.userId,
    })
    .returning();

  if (parsed.rows.length) {
    await db.insert(importRows).values(
      parsed.rows.map((raw, i) => ({
        organizationId: ctx.organizationId,
        communityId: ctx.communityId,
        batchId: batch.id,
        rowNumber: i + 1,
        raw,
        mappingStatus: "unmapped",
        status: "needs_review" as const,
        classification: "unknown" as const,
        validationErrors: [],
      })),
    );
  }

  await recordAudit({
    ctx,
    action: "import.batch.upload",
    entityType: "import_batch",
    entityId: batch.id,
    after: {
      filename: batch.originalFilename,
      sourceType: batch.sourceType,
      rowCount: batch.rowCount,
      documentId: doc.id,
    },
  });

  return {
    batch,
    previewRows: parsed.rows.slice(0, 10),
    headers: parsed.headers,
  };
}

export async function getImportBatchDetail(
  ctx: TenantContext,
  batchId: string,
  filter: ImportRowFilter = "all",
) {
  assertCan(ctx.capabilities, "finance.read");
  const batch = await getBatchOrThrow(ctx, batchId);

  const conditions = [
    eq(importRows.batchId, batchId),
    eq(importRows.organizationId, ctx.organizationId),
    eq(importRows.communityId, ctx.communityId),
  ];
  if (filter !== "all") {
    conditions.push(eq(importRows.status, filter));
  }

  const rows = await db
    .select()
    .from(importRows)
    .where(and(...conditions))
    .orderBy(asc(importRows.rowNumber));

  const profiles = await listImportProfiles(ctx);

  return { batch, rows, profiles };
}

export async function saveImportMapping(
  ctx: TenantContext,
  input: {
    batchId: string;
    mapping: Record<string, string>;
    saveAsProfileName?: string | null;
  },
) {
  assertCan(ctx.capabilities, "import.csv");
  const batch = await getBatchOrThrow(ctx, input.batchId);

  const parsed = mappingSchema.safeParse(input.mapping);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  let profileId = batch.profileId;
  if (input.saveAsProfileName?.trim()) {
    const name = input.saveAsProfileName.trim();
    const existing = await db
      .select()
      .from(importProfiles)
      .where(
        and(
          eq(importProfiles.communityId, ctx.communityId),
          eq(importProfiles.name, name),
        ),
      )
      .limit(1);

    if (existing[0]) {
      const [updated] = await db
        .update(importProfiles)
        .set({
          mapping: parsed.data,
          sourceType: batch.sourceType,
          updatedAt: new Date(),
        })
        .where(eq(importProfiles.id, existing[0].id))
        .returning();
      profileId = updated.id;
    } else {
      const [created] = await db
        .insert(importProfiles)
        .values({
          organizationId: ctx.organizationId,
          communityId: ctx.communityId,
          name,
          sourceType: batch.sourceType,
          mapping: parsed.data,
          createdBy: ctx.userId,
        })
        .returning();
      profileId = created.id;
    }
  }

  await db
    .update(importBatches)
    .set({
      mapping: parsed.data,
      profileId,
      status: "parsing",
      updatedAt: new Date(),
    })
    .where(eq(importBatches.id, batch.id));

  await applyMappingAndValidate(ctx, batch.id);

  await recordAudit({
    ctx,
    action: "import.batch.map",
    entityType: "import_batch",
    entityId: batch.id,
    after: { mapping: parsed.data, profileId },
  });

  return getImportBatchDetail(ctx, batch.id);
}

async function applyMappingAndValidate(ctx: TenantContext, batchId: string) {
  const batch = await getBatchOrThrow(ctx, batchId);
  const mapping = (batch.mapping ?? {}) as Record<string, string>;

  const rows = await db
    .select()
    .from(importRows)
    .where(
      and(
        eq(importRows.batchId, batchId),
        eq(importRows.organizationId, ctx.organizationId),
        eq(importRows.communityId, ctx.communityId),
      ),
    );

  // Existing fingerprints from other batches / already-approved transactions
  const existingFingerprints = new Set<string>();
  const priorRows = await db
    .select({
      fingerprint: importRows.duplicateFingerprint,
    })
    .from(importRows)
    .where(
      and(
        eq(importRows.communityId, ctx.communityId),
        ne(importRows.batchId, batchId),
        sql`${importRows.duplicateFingerprint} is not null`,
      ),
    );
  for (const r of priorRows) {
    if (r.fingerprint) existingFingerprints.add(r.fingerprint);
  }

  const priorTx = await db
    .select({ fingerprint: financialTransactions.duplicateFingerprint })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.communityId, ctx.communityId),
        sql`${financialTransactions.duplicateFingerprint} is not null`,
      ),
    );
  for (const r of priorTx) {
    if (r.fingerprint) existingFingerprints.add(r.fingerprint);
  }

  const seenInBatch = new Map<string, number>();
  let valid = 0;
  let errors = 0;
  let duplicates = 0;

  for (const row of rows) {
    const normalized = applyMapping(
      row.raw as Record<string, string>,
      mapping,
    );
    const validationErrors = validateNormalized(normalized);
    const fingerprint = duplicateFingerprint({
      communityId: ctx.communityId,
      date: normalized.date,
      amount: normalized.amount,
      description: normalized.description,
      externalId: normalized.externalId,
      reference: normalized.reference,
    });

    let status: (typeof importRows.$inferSelect)["status"] = "ready";
    let isDuplicate = 0;

    if (validationErrors.length) {
      status = "invalid";
      errors += 1;
    } else {
      const priorCount = seenInBatch.get(fingerprint) ?? 0;
      const isDup =
        priorCount > 0 || existingFingerprints.has(fingerprint);
      seenInBatch.set(fingerprint, priorCount + 1);
      if (isDup) {
        status = "duplicate";
        isDuplicate = 1;
        duplicates += 1;
        validationErrors.push("Probable duplicate (fingerprint match)");
      } else {
        status = "ready";
        valid += 1;
      }
    }

    await db
      .update(importRows)
      .set({
        normalized,
        validationErrors,
        mappingStatus: "mapped",
        status,
        classification: normalized.classification,
        duplicateFingerprint: fingerprint,
        isDuplicate,
        updatedAt: new Date(),
      })
      .where(eq(importRows.id, row.id));
  }

  await db
    .update(importBatches)
    .set({
      status: "needs_review",
      validRowCount: valid,
      errorRowCount: errors,
      duplicateRowCount: duplicates,
      updatedAt: new Date(),
    })
    .where(eq(importBatches.id, batchId));
}

export async function bulkUpdateImportRows(
  ctx: TenantContext,
  input: {
    batchId: string;
    rowIds: string[];
    action: "approve" | "reject" | "mark_ready" | "set_classification";
    classification?: ImportClassification;
  },
) {
  const batch = await getBatchOrThrow(ctx, input.batchId);

  if (input.action === "approve") {
    assertCan(ctx.capabilities, "import.approve");
    return approveImportRows(ctx, {
      batchId: batch.id,
      rowIds: input.rowIds,
    });
  }

  assertCan(ctx.capabilities, "import.csv");

  if (!input.rowIds.length) return { updated: 0 };

  const rows = await db
    .select()
    .from(importRows)
    .where(
      and(
        eq(importRows.batchId, batch.id),
        eq(importRows.organizationId, ctx.organizationId),
        eq(importRows.communityId, ctx.communityId),
        inArray(importRows.id, input.rowIds),
      ),
    );

  let updated = 0;
  for (const row of rows) {
    if (input.action === "reject") {
      if (row.status === "approved") continue;
      await db
        .update(importRows)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(eq(importRows.id, row.id));
      updated += 1;
    } else if (input.action === "mark_ready") {
      if (row.status === "approved" || row.status === "invalid") continue;
      await db
        .update(importRows)
        .set({ status: "ready", updatedAt: new Date() })
        .where(eq(importRows.id, row.id));
      updated += 1;
    } else if (input.action === "set_classification" && input.classification) {
      await db
        .update(importRows)
        .set({
          classification: input.classification,
          updatedAt: new Date(),
        })
        .where(eq(importRows.id, row.id));
      updated += 1;
    }
  }

  await refreshBatchApprovalStatus(ctx, batch.id);
  return { updated };
}

export async function approveImportRows(
  ctx: TenantContext,
  input: { batchId: string; rowIds?: string[] },
) {
  assertCan(ctx.capabilities, "import.approve");
  const batch = await getBatchOrThrow(ctx, input.batchId);

  const conditions = [
    eq(importRows.batchId, batch.id),
    eq(importRows.organizationId, ctx.organizationId),
    eq(importRows.communityId, ctx.communityId),
    inArray(importRows.status, ["ready", "duplicate", "needs_review"]),
  ];
  if (input.rowIds?.length) {
    conditions.push(inArray(importRows.id, input.rowIds));
  }

  const candidates = await db
    .select()
    .from(importRows)
    .where(and(...conditions));

  // Only approve rows that are valid (no hard validation errors other than duplicate flag)
  const approvable = candidates.filter((r) => {
    const errs = (r.validationErrors ?? []).filter(
      (e) => e !== "Probable duplicate (fingerprint match)",
    );
    return errs.length === 0 && r.normalized != null;
  });

  let created = 0;
  for (const row of approvable) {
    const n = row.normalized as NormalizedImportValues;
    if (!n.date || !n.description || n.amount == null) continue;

    const [tx] = await db
      .insert(financialTransactions)
      .values({
        organizationId: ctx.organizationId,
        communityId: ctx.communityId,
        importRowId: row.id,
        importBatchId: batch.id,
        sourceDocumentId: batch.documentId,
        transactionDate: n.date,
        description: n.description,
        amount: n.amount,
        direction: n.direction,
        category: n.category,
        classification: row.classification,
        vendorName: n.vendor,
        ownerDisplay: n.owner,
        externalId: n.externalId,
        reference: n.reference,
        status: "posted",
        verificationStatus: "reported",
        duplicateFingerprint: row.duplicateFingerprint,
      })
      .returning();

    await db
      .update(importRows)
      .set({ status: "approved", updatedAt: new Date() })
      .where(eq(importRows.id, row.id));

    created += 1;
    void tx;
  }

  await db
    .update(importBatches)
    .set({
      reviewedBy: ctx.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(importBatches.id, batch.id));

  await refreshBatchApprovalStatus(ctx, batch.id);

  await recordAudit({
    ctx,
    action: "import.rows.approve",
    entityType: "import_batch",
    entityId: batch.id,
    after: { approved: created, requested: input.rowIds?.length ?? "all_ready" },
  });

  return { approved: created };
}

async function refreshBatchApprovalStatus(
  ctx: TenantContext,
  batchId: string,
) {
  const rows = await db
    .select({ status: importRows.status })
    .from(importRows)
    .where(
      and(
        eq(importRows.batchId, batchId),
        eq(importRows.communityId, ctx.communityId),
      ),
    );

  const counts = {
    approved: 0,
    rejected: 0,
    other: 0,
    total: rows.length,
  };
  for (const r of rows) {
    if (r.status === "approved") counts.approved += 1;
    else if (r.status === "rejected") counts.rejected += 1;
    else counts.other += 1;
  }

  let status: (typeof importBatches.$inferSelect)["status"] = "needs_review";
  if (counts.total === 0) {
    status = "needs_review";
  } else if (counts.approved === counts.total) {
    status = "approved";
  } else if (counts.approved > 0) {
    status = "partially_approved";
  } else {
    status = "needs_review";
  }

  await db
    .update(importBatches)
    .set({ status, updatedAt: new Date() })
    .where(eq(importBatches.id, batchId));
}

export async function getTransactionProvenance(
  ctx: TenantContext,
  transactionId: string,
) {
  assertCan(ctx.capabilities, "finance.read");

  const [tx] = await db
    .select()
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.id, transactionId),
        eq(financialTransactions.organizationId, ctx.organizationId),
        eq(financialTransactions.communityId, ctx.communityId),
      ),
    )
    .limit(1);
  if (!tx) throw new Error("Transaction not found");

  let row = null;
  let batch = null;
  let document = null;

  if (tx.importRowId) {
    const [r] = await db
      .select()
      .from(importRows)
      .where(eq(importRows.id, tx.importRowId))
      .limit(1);
    row = r ?? null;
  }
  if (tx.importBatchId) {
    const [b] = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, tx.importBatchId))
      .limit(1);
    batch = b ?? null;
  }
  if (tx.sourceDocumentId) {
    const [d] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, tx.sourceDocumentId))
      .limit(1);
    document = d ?? null;
  }

  return { transaction: tx, importRow: row, importBatch: batch, document };
}
