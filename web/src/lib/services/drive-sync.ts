import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  documentExtractions,
  documents,
  documentVersions,
  externalSourceFiles,
  externalSources,
  externalSyncRuns,
  facts,
  financialTransactions,
  validationTargets,
} from "@/lib/db/schema";
import {
  classifyDriveDocument,
  extractCandidatesFromText,
  isLooseRepairGuess,
  isSameFinancialMetric,
  reviewStatusForExtractedFact,
  uniqueFinancialMetrics,
  type ExtractedCandidate,
} from "@/lib/domain/drive-classify";
import { textForExtraction } from "@/lib/domain/extract-text";
import { minutesAvailability } from "@/lib/domain/minutes-availability";
import {
  classifySyncFile,
  driveWebViewLink,
  type SyncSkipStatus,
} from "@/lib/domain/sync-file";
import {
  assertCan,
  type TenantContext,
} from "@/lib/domain/permissions";
import {
  downloadDriveFile,
  FOLDER_MIME,
  listDriveChildren,
  MAX_SYNC_FILE_BYTES,
} from "@/lib/integrations/google-drive/client";
import { getGoogleDriveCredentialsStatus } from "@/lib/integrations/google-drive/credentials";
import { GoogleDriveConfigError } from "@/lib/integrations/google-drive/types";
import { getStorageProvider, isFatalStorageError } from "@/lib/storage";
import { recordAudit } from "./audit";

export type SyncReport = {
  sourceName: string;
  folderId: string;
  folderUrl?: string;
  startedAt: string;
  finishedAt: string;
  status: string;
  missingCredentials: string[];
  tree: {
    id: string;
    name: string;
    path: string;
    isFolder: boolean;
    mimeType?: string;
    parents?: string[];
    modifiedTime?: string;
    size?: string;
    md5Checksum?: string;
    version?: string;
    webViewLink?: string;
  }[];
  totals: {
    discovered: number;
    folders: number;
    files: number;
    snapshotted: number;
    skipped: number;
    unchanged: number;
    changed: number;
    errors: number;
    parsingFailures: number;
    candidateFacts: number;
    candidateTransactions: number;
    candidateMaintenanceCapital: number;
    conflicts: number;
    /** Bytes stored in this run. */
    downloaded: number;
    unsupported: number;
    oversized: number;
    /** Real synchronization failures. Unsupported and oversized files are not failures. */
    failed: number;
    parsed: number;
    factsExtracted: number;
    /** Extracted facts left at needs_review or conflicting. Never verified by sync. */
    factsNeedingReview: number;
    pendingTranscription: number;
  };
  categoryCounts: Record<string, number>;
  minutesYearsFound: number[];
  missingYears: {
    year: number;
    status: string;
    note: string;
    documents?: {
      name: string;
      path: string;
      driveFileId: string;
      webViewLink: string;
      documentId?: string;
      kind: "minutes" | "recording";
    }[];
  }[];
  discoveries: string[];
  matchedTargets: {
    key: string;
    label: string;
    expected: string;
    found: string;
  }[];
  differingTargets: {
    key: string;
    label: string;
    expected: string;
    found: string | null;
    note: string;
  }[];
  conflicts: {
    factType: string;
    label: string;
    existingValue: string | null;
    existingStatus: string;
    candidateValue: string | null;
    documentId: string | null;
  }[];
  needsManualReview: {
    documentId: string | null;
    filename: string;
    reason: string;
  }[];
  fileErrors: {
    path: string;
    error: string;
    /** failed is a real sync error. The other values explain a deliberate skip. */
    status?: "failed" | SyncSkipStatus;
    driveFileId?: string;
    webViewLink?: string;
    documentId?: string;
  }[];
  /** listing → files → finalize. Absent on runs saved before chunked sync. */
  phase?: "listing" | "files" | "finalize" | "done";
  pendingFolders?: { id: string; path: string }[];
  /**
   * Stored documents that still have no facts. Drained one at a time so a
   * reread does not download the file again or blow the function time limit.
   */
  pendingFactDocs?: {
    documentId: string;
    filename: string;
    path: string;
    category: string;
    webViewLink?: string;
    driveFileId?: string;
  }[];
  /** Next `tree` index to snapshot. */
  resumeFrom?: number;
};

const WILLOWS_FOLDER_ID = "1f_b0P34xEuiDEefrei6m2jNwHu3cxA2Y";

/**
 * Stay under Netlify's synchronous function limit (10s on the free tier).
 * A full folder sync that runs longer is killed and the browser shows 502.
 */
const SYNC_CHUNK_BUDGET_MS = 7_000;
/**
 * One file per chunk: download, store, then the database writes.
 * The reply to the browser is a short result, not the rendered page, so this
 * reserve only has to finish the file. Rendering the source page in the same
 * request was cut off by the host and the browser reported
 * "An unexpected response was received from the server."
 */
const DOWNLOAD_RESERVE_MS = 6_000;
const STORE_TIMEOUT_MS = 2_500;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function syncProgressSignature(report: SyncReport) {
  return [
    report.phase ?? "",
    report.pendingFolders?.length ?? 0,
    report.pendingFactDocs?.length ?? 0,
    report.resumeFrom ?? 0,
    report.tree.length,
  ].join(":");
}

function initialSyncReport(
  sourceName: string,
  folderId: string,
  folderUrl: string | undefined,
  rootName: string,
): SyncReport {
  return {
    sourceName,
    folderId,
    folderUrl,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    status: "running",
    missingCredentials: [],
    phase: "listing",
    pendingFolders: [{ id: folderId, path: `/${rootName}` }],
    resumeFrom: 0,
    tree: [
      {
        id: folderId,
        name: rootName,
        path: `/${rootName}`,
        isFolder: true,
        mimeType: FOLDER_MIME,
      },
    ],
    totals: {
      discovered: 1,
      folders: 1,
      files: 0,
      snapshotted: 0,
      skipped: 0,
      unchanged: 0,
      changed: 0,
      errors: 0,
      parsingFailures: 0,
      candidateFacts: 0,
      candidateTransactions: 0,
      candidateMaintenanceCapital: 0,
      conflicts: 0,
      downloaded: 0,
      unsupported: 0,
      oversized: 0,
      failed: 0,
      parsed: 0,
      factsExtracted: 0,
      factsNeedingReview: 0,
      pendingTranscription: 0,
    },
    categoryCounts: {},
    minutesYearsFound: [],
    missingYears: [],
    discoveries: [],
    matchedTargets: [],
    differingTargets: [],
    conflicts: [],
    needsManualReview: [],
    fileErrors: [],
    pendingFactDocs: [],
  };
}

function hydrateSyncReport(
  stored: SyncReport | null | undefined,
  initial: SyncReport,
): SyncReport {
  if (!stored?.phase) return initial;
  return {
    ...initial,
    ...stored,
    tree: stored.tree ?? initial.tree,
    pendingFolders: stored.pendingFolders ?? [],
    resumeFrom: stored.resumeFrom ?? 0,
    totals: { ...initial.totals, ...stored.totals },
    categoryCounts: stored.categoryCounts ?? {},
    fileErrors: stored.fileErrors ?? [],
    pendingFactDocs: stored.pendingFactDocs ?? [],
    needsManualReview: stored.needsManualReview ?? [],
    discoveries: stored.discoveries ?? [],
    matchedTargets: stored.matchedTargets ?? [],
    differingTargets: stored.differingTargets ?? [],
    conflicts: stored.conflicts ?? [],
    missingYears: stored.missingYears ?? [],
    minutesYearsFound: stored.minutesYearsFound ?? [],
    missingCredentials: stored.missingCredentials ?? [],
  };
}

export async function listExternalSources(ctx: TenantContext) {
  assertCan(ctx.capabilities, "documents.read");
  return db
    .select()
    .from(externalSources)
    .where(
      and(
        eq(externalSources.organizationId, ctx.organizationId),
        eq(externalSources.communityId, ctx.communityId),
      ),
    )
    .orderBy(desc(externalSources.updatedAt));
}

export async function getExternalSource(ctx: TenantContext, sourceId: string) {
  assertCan(ctx.capabilities, "documents.read");
  const [source] = await db
    .select()
    .from(externalSources)
    .where(
      and(
        eq(externalSources.id, sourceId),
        eq(externalSources.organizationId, ctx.organizationId),
        eq(externalSources.communityId, ctx.communityId),
      ),
    )
    .limit(1);
  if (!source) throw new Error("External source not found");
  return source;
}

export async function listSourceFiles(ctx: TenantContext, sourceId: string) {
  assertCan(ctx.capabilities, "documents.read");
  await getExternalSource(ctx, sourceId);
  return db
    .select()
    .from(externalSourceFiles)
    .where(eq(externalSourceFiles.sourceId, sourceId))
    .orderBy(externalSourceFiles.path)
    .limit(200);
}

export async function getLatestSyncRun(ctx: TenantContext, sourceId: string) {
  assertCan(ctx.capabilities, "documents.read");
  const [run] = await db
    .select({
      id: externalSyncRuns.id,
      status: externalSyncRuns.status,
      errorMessage: externalSyncRuns.errorMessage,
      missingCredentials: externalSyncRuns.missingCredentials,
      startedAt: externalSyncRuns.startedAt,
      finishedAt: externalSyncRuns.finishedAt,
      report: sql<Record<string, unknown>>`
        (
          CASE
            WHEN jsonb_typeof(COALESCE(${externalSyncRuns.report}, '{}'::jsonb)) = 'object'
            THEN COALESCE(${externalSyncRuns.report}, '{}'::jsonb)
            ELSE '{}'::jsonb
          END
          - 'tree'
          - 'fileErrors'
          - 'pendingFolders'
        ) || jsonb_build_object(
          'tree', COALESCE((
            SELECT jsonb_agg(elem) FROM (
              SELECT elem
              FROM jsonb_array_elements(
                CASE
                  WHEN jsonb_typeof(COALESCE(${externalSyncRuns.report}->'tree', '[]'::jsonb)) = 'array'
                  THEN COALESCE(${externalSyncRuns.report}->'tree', '[]'::jsonb)
                  ELSE '[]'::jsonb
                END
              ) AS elem
              LIMIT 250
            ) limited_tree
          ), '[]'::jsonb),
          'fileErrors', COALESCE((
            SELECT jsonb_agg(elem) FROM (
              SELECT elem
              FROM jsonb_array_elements(
                CASE
                  WHEN jsonb_typeof(COALESCE(${externalSyncRuns.report}->'fileErrors', '[]'::jsonb)) = 'array'
                  THEN COALESCE(${externalSyncRuns.report}->'fileErrors', '[]'::jsonb)
                  ELSE '[]'::jsonb
                END
              ) AS elem
              LIMIT 20
            ) limited_errors
          ), '[]'::jsonb)
        )
      `,
    })
    .from(externalSyncRuns)
    .where(
      and(
        eq(externalSyncRuns.sourceId, sourceId),
        eq(externalSyncRuns.communityId, ctx.communityId),
      ),
    )
    .orderBy(desc(externalSyncRuns.startedAt))
    .limit(1);
  return run ?? null;
}

export async function ensureWillowsDriveSource(ctx: TenantContext) {
  assertCan(ctx.capabilities, "documents.manage");
  const existing = await db
    .select()
    .from(externalSources)
    .where(
      and(
        eq(externalSources.communityId, ctx.communityId),
        eq(externalSources.provider, "google_drive"),
        eq(externalSources.name, "Willows Condos Records"),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(externalSources)
    .values({
      organizationId: ctx.organizationId,
      communityId: ctx.communityId,
      provider: "google_drive",
      name: "Willows Condos Records",
      status: "active",
      config: {
        folderId: WILLOWS_FOLDER_ID,
        folderUrl: `https://drive.google.com/drive/folders/${WILLOWS_FOLDER_ID}`,
        folderName: "Willows Condos Records",
      },
    })
    .returning();
  return created;
}

function sha256(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

async function nextDocumentVersion(documentId: string) {
  const [row] = await db
    .select({
      max: sql<number>`coalesce(max(${documentVersions.version}), 0)`,
    })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId));
  return Number(row?.max ?? 0) + 1;
}

function textFromBytes(bytes: Buffer, mimeType: string, filename = ""): string {
  return textForExtraction(bytes, mimeType, filename);
}

/** Save progress before a download so a killed function does not retry that file. */
async function checkpointReport(runId: string, report: SyncReport) {
  await db
    .update(externalSyncRuns)
    .set({
      status: "running",
      report,
    })
    .where(eq(externalSyncRuns.id, runId));
}

function sameStoredMetric(
  row: {
    factType: string;
    label: string;
    numericValue: string | null;
    periodStart: string | null;
    periodEnd: string | null;
  },
  candidate: ExtractedCandidate,
): boolean {
  return isSameFinancialMetric(
    {
      kind: candidate.kind,
      factType: row.factType,
      label: row.label,
      numericValue: row.numericValue,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
    },
    candidate,
  );
}

function sameTransaction(parsed: unknown, candidate: ExtractedCandidate): boolean {
  if (!parsed || typeof parsed !== "object") return false;
  const row = parsed as Partial<ExtractedCandidate>;
  return (
    row.kind === "transaction" &&
    row.label === candidate.label &&
    row.numericValue === candidate.numericValue &&
    row.asOfDate === candidate.asOfDate
  );
}

async function persistCandidates(params: {
  ctx: TenantContext;
  documentId: string;
  candidates: ExtractedCandidate[];
  report: SyncReport;
}) {
  const { ctx, documentId, report } = params;
  const candidates = uniqueFinancialMetrics(params.candidates);
  const existingFacts = await db
    .select({
      id: facts.id,
      factType: facts.factType,
      label: facts.label,
      numericValue: facts.numericValue,
      periodStart: facts.periodStart,
      periodEnd: facts.periodEnd,
      verificationStatus: facts.verificationStatus,
      sourceExcerpt: facts.sourceExcerpt,
      sourceReference: facts.sourceReference,
    })
    .from(facts)
    .where(
      and(eq(facts.communityId, ctx.communityId), eq(facts.documentId, documentId)),
    );
  const known: {
    factType: string;
    label: string;
    numericValue: string | null;
    periodStart: string | null;
    periodEnd: string | null;
  }[] = existingFacts.map((row) => ({
    factType: row.factType,
    label: row.label,
    numericValue: row.numericValue,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
  }));
  const invoice = candidates.find(
    (candidate) => candidate.factType === "invoice_amount" && candidate.numericValue,
  );
  const looseGuesses = existingFacts.filter((row) => isLooseRepairGuess(row));
  if (looseGuesses.length > 0) {
    const [primary, ...rest] = looseGuesses;
    if (invoice) {
      await db
        .update(facts)
        .set({
          factType: invoice.factType ?? "invoice_amount",
          label: invoice.label,
          numericValue: invoice.numericValue,
          unit: "USD",
          periodStart: invoice.periodStart ?? null,
          periodEnd: invoice.periodEnd ?? null,
          asOfDate: invoice.asOfDate ?? null,
          sourcePage: invoice.sourcePage ?? null,
          sourceExcerpt: invoice.sourceExcerpt ?? null,
          sourceReference: "google_drive_sync",
          confidence: invoice.confidence ?? null,
          notes: "Corrected from an unlabeled file number to the invoice amount due.",
          updatedAt: new Date(),
        })
        .where(and(eq(facts.id, primary.id), eq(facts.communityId, ctx.communityId)));
      known.push({
        factType: invoice.factType ?? "invoice_amount",
        label: invoice.label,
        numericValue: invoice.numericValue ?? null,
        periodStart: invoice.periodStart ?? null,
        periodEnd: invoice.periodEnd ?? null,
      });
      await recordAudit({
        ctx,
        action: "fact.reextract",
        entityType: "fact",
        entityId: primary.id,
        before: {
          label: primary.label,
          numericValue: primary.numericValue,
          sourceExcerpt: primary.sourceExcerpt,
        },
        after: {
          label: invoice.label,
          numericValue: invoice.numericValue,
          sourceExcerpt: invoice.sourceExcerpt,
        },
      });
    } else {
      await db
        .update(facts)
        .set({
          label: "Amount due",
          numericValue: null,
          unit: null,
          sourceExcerpt: null,
          notes: "Removed an unlabeled number. No invoice amount due was found in the document text.",
          updatedAt: new Date(),
        })
        .where(and(eq(facts.id, primary.id), eq(facts.communityId, ctx.communityId)));
      await recordAudit({
        ctx,
        action: "fact.reextract",
        entityType: "fact",
        entityId: primary.id,
        before: {
          label: primary.label,
          numericValue: primary.numericValue,
        },
        after: { label: "Amount due", numericValue: null },
      });
    }
    for (const extra of rest) {
      await db
        .update(facts)
        .set({
          verificationStatus: "rejected",
          notes: "Duplicate unlabeled repair amount.",
          updatedAt: new Date(),
        })
        .where(and(eq(facts.id, extra.id), eq(facts.communityId, ctx.communityId)));
    }
  }
  if (candidates.some((candidate) => candidate.numericValue)) {
    const looseIds = new Set(looseGuesses.map((row) => row.id));
    for (const row of existingFacts) {
      if (looseIds.has(row.id)) continue;
      if (row.verificationStatus !== "needs_review") continue;
      if (row.sourceReference !== "google_drive_sync") continue;
      const next = candidates.find(
        (candidate) => candidate.factType === row.factType && candidate.numericValue,
      );
      if (next) {
        const unchanged =
          next.numericValue === row.numericValue &&
          next.label === row.label &&
          (next.periodStart ?? null) === row.periodStart &&
          (next.periodEnd ?? null) === row.periodEnd &&
          (next.sourceExcerpt ?? null) === row.sourceExcerpt;
        if (!unchanged) {
          await db
            .update(facts)
            .set({
              label: next.label,
              numericValue: next.numericValue,
              unit: next.unit ?? "USD",
              periodStart: next.periodStart ?? null,
              periodEnd: next.periodEnd ?? null,
              asOfDate: next.asOfDate ?? null,
              sourcePage: next.sourcePage ?? null,
              sourceExcerpt: next.sourceExcerpt ?? null,
              confidence: next.confidence ?? null,
              notes: "Re-read from the labeled amount on the document.",
              updatedAt: new Date(),
            })
            .where(and(eq(facts.id, row.id), eq(facts.communityId, ctx.communityId)));
          await recordAudit({
            ctx,
            action: "fact.reextract",
            entityType: "fact",
            entityId: row.id,
            before: {
              label: row.label,
              numericValue: row.numericValue,
              sourceExcerpt: row.sourceExcerpt,
            },
            after: {
              label: next.label,
              numericValue: next.numericValue,
              sourceExcerpt: next.sourceExcerpt,
            },
          });
        }
        const idx = known.findIndex(
          (item) =>
            item.factType === row.factType &&
            item.numericValue === row.numericValue &&
            item.periodStart === row.periodStart &&
            item.periodEnd === row.periodEnd,
        );
        if (idx >= 0) {
          known[idx] = {
            factType: next.factType ?? row.factType,
            label: next.label,
            numericValue: next.numericValue ?? null,
            periodStart: next.periodStart ?? null,
            periodEnd: next.periodEnd ?? null,
          };
        }
        continue;
      }
      await db
        .update(facts)
        .set({
          verificationStatus: "rejected",
          numericValue: null,
          notes: "Removed because the document does not show this labeled amount.",
          updatedAt: new Date(),
        })
        .where(and(eq(facts.id, row.id), eq(facts.communityId, ctx.communityId)));
      await recordAudit({
        ctx,
        action: "fact.reextract",
        entityType: "fact",
        entityId: row.id,
        before: { label: row.label, numericValue: row.numericValue },
        after: { label: row.label, numericValue: null, verificationStatus: "rejected" },
      });
    }
  }
  const existingTransactions = await db
    .select({ parsedValue: documentExtractions.parsedValue })
    .from(documentExtractions)
    .where(
      and(
        eq(documentExtractions.communityId, ctx.communityId),
        eq(documentExtractions.documentId, documentId),
        eq(documentExtractions.fieldPath, "transaction_candidate"),
      ),
    );

  for (const c of candidates) {
    if (c.kind === "fact" || c.kind === "maintenance_capital") {
      if (known.some((row) => sameStoredMetric(row, c))) continue;

      report.totals.candidateFacts += c.kind === "fact" ? 1 : 0;
      report.totals.candidateMaintenanceCapital +=
        c.kind === "maintenance_capital" ? 1 : 0;

      await db.insert(documentExtractions).values({
        organizationId: ctx.organizationId,
        communityId: ctx.communityId,
        documentId,
        fieldPath: c.factType ?? c.label,
        rawValue: c.rawValue ?? c.numericValue ?? null,
        parsedValue: c,
        verificationStatus: reviewStatusForExtractedFact(),
      });

      if (c.numericValue != null || c.kind === "maintenance_capital") {
        const existing = await db
          .select()
          .from(facts)
          .where(
            and(
              eq(facts.communityId, ctx.communityId),
              eq(facts.factType, c.factType ?? "other"),
              inArray(facts.verificationStatus, ["verified", "reported"]),
            ),
          );

        let status: "needs_review" | "conflicting" = reviewStatusForExtractedFact();
        for (const ex of existing) {
          if (
            ex.numericValue != null &&
            c.numericValue != null &&
            Number(ex.numericValue) !== Number(c.numericValue)
          ) {
            status = "conflicting";
            report.totals.conflicts += 1;
            report.conflicts.push({
              factType: c.factType ?? "other",
              label: c.label,
              existingValue: ex.numericValue,
              existingStatus: ex.verificationStatus,
              candidateValue: c.numericValue,
              documentId,
            });
            await db
              .update(facts)
              .set({
                verificationStatus: "conflicting",
                updatedAt: new Date(),
              })
              .where(
                and(eq(facts.id, ex.id), eq(facts.communityId, ctx.communityId)),
              );
          }
        }

        await db.insert(facts).values({
          organizationId: ctx.organizationId,
          communityId: ctx.communityId,
          documentId,
          factType: c.factType ?? "other",
          label: c.label,
          numericValue: c.numericValue ?? null,
          unit: c.unit ?? "USD",
          periodStart: c.periodStart ?? null,
          periodEnd: c.periodEnd ?? null,
          asOfDate: c.asOfDate ?? null,
          sourcePage: c.sourcePage ?? null,
          sourceExcerpt: c.sourceExcerpt ?? null,
          sourceReference: "google_drive_sync",
          verificationStatus: status,
          confidence: c.confidence ?? null,
          notes: "Auto-extracted from Drive sync — needs review",
          createdBy: ctx.userId,
        });
        report.totals.factsExtracted += 1;
        report.totals.factsNeedingReview += 1;
        known.push({
          factType: c.factType ?? "other",
          label: c.label,
          numericValue: c.numericValue ?? null,
          periodStart: c.periodStart ?? null,
          periodEnd: c.periodEnd ?? null,
        });
      }
    } else if (c.kind === "transaction") {
      if (existingTransactions.some((row) => sameTransaction(row.parsedValue, c))) {
        continue;
      }
      report.totals.candidateTransactions += 1;
      await db.insert(documentExtractions).values({
        organizationId: ctx.organizationId,
        communityId: ctx.communityId,
        documentId,
        fieldPath: "transaction_candidate",
        rawValue: c.rawValue ?? null,
        parsedValue: c,
        verificationStatus: reviewStatusForExtractedFact(),
      });
    }
  }
}

async function compareValidationTargets(
  ctx: TenantContext,
  report: SyncReport,
) {
  const targets = await db
    .select()
    .from(validationTargets)
    .where(eq(validationTargets.communityId, ctx.communityId));

  const recentFacts = await db
    .select()
    .from(facts)
    .where(eq(facts.communityId, ctx.communityId));

  for (const t of targets) {
    if (t.expectedNumeric == null) continue;
    const expected = Number(t.expectedNumeric);
    const tol = Number(t.tolerance ?? "1");
    const matches = recentFacts.filter((f) => {
      if (t.factType && f.factType !== t.factType) return false;
      if (f.numericValue == null) return false;
      return Math.abs(Number(f.numericValue) - expected) <= tol;
    });
    if (matches.length) {
      report.matchedTargets.push({
        key: t.key,
        label: t.label,
        expected: expected.toFixed(2),
        found: matches[0].numericValue!,
      });
    } else {
      const near = recentFacts.find(
        (f) => t.factType && f.factType === t.factType && f.numericValue != null,
      );
      report.differingTargets.push({
        key: t.key,
        label: t.label,
        expected: expected.toFixed(2),
        found: near?.numericValue ?? null,
        note: near
          ? "Found related fact with different value — conflict/review"
          : "Expected validation target not found in extracted candidates",
      });
    }
  }
}

const FACT_CATEGORIES = new Set([
  "financial_statement",
  "meeting_minutes",
  "bank_statement",
  "invoice",
]);
const EXTRACTION_MARKER = "drive-text-v3";

function noteDiscovery(report: SyncReport, message: string) {
  if (!report.discoveries.includes(message)) report.discoveries.push(message);
}

function queueFactDoc(
  report: SyncReport,
  item: NonNullable<SyncReport["pendingFactDocs"]>[number],
) {
  report.pendingFactDocs ??= [];
  if (report.pendingFactDocs.some((row) => row.documentId === item.documentId)) {
    return;
  }
  if (report.pendingFactDocs.length >= 80) return;
  if (item.category === "financial_statement" || item.category === "bank_statement") {
    const firstMinutes = report.pendingFactDocs.findIndex(
      (row) => row.category === "meeting_minutes",
    );
    if (firstMinutes >= 0) report.pendingFactDocs.splice(firstMinutes, 0, item);
    else report.pendingFactDocs.push(item);
  } else {
    report.pendingFactDocs.push(item);
  }
}

async function alreadyExtracted(
  ctx: TenantContext,
  documentId: string,
): Promise<boolean> {
  const [marker] = await db
    .select({ id: documentExtractions.id })
    .from(documentExtractions)
    .where(
      and(
        eq(documentExtractions.communityId, ctx.communityId),
        eq(documentExtractions.documentId, documentId),
        eq(documentExtractions.fieldPath, "extraction_attempt"),
        eq(documentExtractions.rawValue, EXTRACTION_MARKER),
      ),
    )
    .limit(1);
  if (!marker) return false;
  const factRows = await db
    .select({
      label: facts.label,
      verificationStatus: facts.verificationStatus,
    })
    .from(facts)
    .where(
      and(eq(facts.communityId, ctx.communityId), eq(facts.documentId, documentId)),
    );
  if (factRows.length > 0 && factRows.every((row) => isLooseRepairGuess(row))) {
    return false;
  }
  return true;
}

async function markExtractionAttempt(ctx: TenantContext, documentId: string) {
  if (await alreadyExtracted(ctx, documentId)) return;
  await db.insert(documentExtractions).values({
    organizationId: ctx.organizationId,
    communityId: ctx.communityId,
    documentId,
    fieldPath: "extraction_attempt",
    rawValue: EXTRACTION_MARKER,
    parsedValue: { version: EXTRACTION_MARKER },
    verificationStatus: reviewStatusForExtractedFact(),
  });
}

async function saveSourceFileStatus(params: {
  ctx: TenantContext;
  sourceId: string;
  runId: string;
  node: SyncReport["tree"][number];
  existingId?: string;
  status: SyncSkipStatus | "error";
  message: string;
  classification: ReturnType<typeof classifyDriveDocument>;
  documentId?: string | null;
}) {
  const link = driveWebViewLink(params.node.id, params.node.webViewLink);
  const size = Number(params.node.size ?? "");
  const sizeBytes =
    Number.isFinite(size) && size > 0 && size < 2_000_000_000
      ? Math.round(size)
      : null;
  const patch = {
    name: params.node.name,
    path: params.node.path,
    mimeType: params.node.mimeType,
    modifiedTime: params.node.modifiedTime
      ? new Date(params.node.modifiedTime)
      : null,
    sizeBytes,
    md5Checksum: params.node.md5Checksum ?? null,
    version: params.node.version ?? null,
    webViewLink: link,
    classificationLabel: params.classification.label,
    mappedCategory: params.classification.category,
    syncStatus: params.status,
    syncError: params.message,
    lastSyncedAt: new Date(),
    lastSyncRunId: params.runId,
    updatedAt: new Date(),
    ...(params.documentId ? { documentId: params.documentId } : {}),
  };
  if (params.existingId) {
    await db
      .update(externalSourceFiles)
      .set(patch)
      .where(
        and(
          eq(externalSourceFiles.id, params.existingId),
          eq(externalSourceFiles.communityId, params.ctx.communityId),
        ),
      );
  } else {
    await db.insert(externalSourceFiles).values({
      organizationId: params.ctx.organizationId,
      communityId: params.ctx.communityId,
      sourceId: params.sourceId,
      externalFileId: params.node.id,
      parentExternalId: params.node.parents?.[0] ?? null,
      isFolder: 0,
      ...patch,
    });
  }
  return link;
}

async function extractStoredFacts(params: {
  ctx: TenantContext;
  report: SyncReport;
  documentId: string;
  filename: string;
  path: string;
  allowRead: boolean;
  webViewLink?: string;
  driveFileId?: string;
}): Promise<"extracted" | "failed" | "has_facts" | "deferred"> {
  if (await alreadyExtracted(params.ctx, params.documentId)) return "has_facts";
  if (!params.allowRead) return "deferred";
  try {
    const [doc] = await db
      .select({
        id: documents.id,
        storageKey: documents.storageKey,
        mimeType: documents.mimeType,
        originalFilename: documents.originalFilename,
      })
      .from(documents)
      .where(
        and(
          eq(documents.id, params.documentId),
          eq(documents.communityId, params.ctx.communityId),
        ),
      )
      .limit(1);
    if (!doc) return "has_facts";
    const obj = await withTimeout(
      getStorageProvider().getObject(doc.storageKey),
      STORE_TIMEOUT_MS,
      "Reading the stored file",
    );
    const filename = doc.originalFilename || params.filename;
    const text = textFromBytes(obj.body, doc.mimeType || obj.mimeType || "", filename);
    const candidates = extractCandidatesFromText(text, {
      filename,
      path: params.path,
    });
    await persistCandidates({
      ctx: params.ctx,
      documentId: doc.id,
      candidates,
      report: params.report,
    });
    await markExtractionAttempt(params.ctx, doc.id);
    params.report.totals.parsed += 1;
    return "extracted";
  } catch (err) {
    if (isFatalStorageError(err)) throw err;
    params.report.totals.parsingFailures += 1;
    params.report.totals.failed += 1;
    params.report.totals.errors += 1;
    params.report.fileErrors.push({
      path: params.path,
      error:
        err instanceof Error
          ? `Stored file could not be reread for fact extraction. ${err.message}`
          : "Stored file could not be reread for fact extraction.",
      status: "failed",
      driveFileId: params.driveFileId,
      webViewLink: params.webViewLink,
      documentId: params.documentId,
    });
    return "failed";
  }
}

export async function syncExternalSource(
  ctx: TenantContext,
  sourceId: string,
  opts?: { resumeRunId?: string },
): Promise<{ runId: string; report: SyncReport }> {
  assertCan(ctx.capabilities, "documents.manage");
  const source = await getExternalSource(ctx, sourceId);
  const folderId = source.config?.folderId;
  if (!folderId) throw new Error("External source is missing folderId in config");

  const rootName = source.config?.folderName ?? source.name;
  const initial = initialSyncReport(
    source.name,
    folderId,
    source.config?.folderUrl,
    rootName,
  );

  let run: { id: string };
  let report: SyncReport;
  if (opts?.resumeRunId) {
    const [existing] = await db
      .select()
      .from(externalSyncRuns)
      .where(
        and(
          eq(externalSyncRuns.id, opts.resumeRunId),
          eq(externalSyncRuns.sourceId, source.id),
          eq(externalSyncRuns.communityId, ctx.communityId),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("Sync run not found");
    if (existing.status !== "running") {
      return {
        runId: existing.id,
        report: hydrateSyncReport(existing.report as SyncReport | null, initial),
      };
    }
    run = existing;
    report = hydrateSyncReport(existing.report as SyncReport | null, initial);
  } else {
    const [created] = await db
      .insert(externalSyncRuns)
      .values({
        organizationId: ctx.organizationId,
        communityId: ctx.communityId,
        sourceId: source.id,
        status: "running",
        startedBy: ctx.userId,
        report: initial,
      })
      .returning();
    run = created;
    report = initial;
  }

  const creds = getGoogleDriveCredentialsStatus();
  if (!creds.ok) {
    report.status = "needs_credentials";
    report.missingCredentials = creds.missing;
    report.finishedAt = new Date().toISOString();
    await db
      .update(externalSyncRuns)
      .set({
        status: "needs_credentials",
        finishedAt: new Date(),
        missingCredentials: creds.missing,
        report,
        errorMessage: `Missing credentials: ${creds.missing.join(", ")}`,
      })
      .where(eq(externalSyncRuns.id, run.id));
    await db
      .update(externalSources)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: "needs_credentials",
        lastError: `Missing: ${creds.missing.join(", ")}`,
        updatedAt: new Date(),
      })
      .where(eq(externalSources.id, source.id));
    return { runId: run.id, report };
  }

  const deadline = Date.now() + SYNC_CHUNK_BUDGET_MS;
  let yielded = false;
  const progressBefore = syncProgressSignature(report);

  try {
    if ((report.phase ?? "listing") === "listing") {
      report.pendingFolders ??= [];
      while (report.pendingFolders.length > 0) {
        if (report.tree.length > 1 && Date.now() >= deadline) {
          yielded = true;
          break;
        }
        const folder = report.pendingFolders.shift()!;
        const children = await listDriveChildren(folder.id);
        for (const child of children) {
          const isFolder = child.mimeType === FOLDER_MIME;
          const path = `${folder.path}/${child.name}`.replace(/\/+/g, "/");
          report.tree.push({
            id: child.id,
            name: child.name,
            path,
            isFolder,
            mimeType: child.mimeType,
            parents: child.parents,
            modifiedTime: child.modifiedTime,
            size: child.size,
            md5Checksum: child.md5Checksum,
            version: child.version,
            webViewLink: child.webViewLink,
          });
          if (isFolder) report.pendingFolders.push({ id: child.id, path });
        }
      }
      report.totals.discovered = report.tree.length;
      report.totals.folders = report.tree.filter((n) => n.isFolder).length;
      report.totals.files = report.tree.filter((n) => !n.isFolder).length;
      if (!yielded) report.phase = "files";
    }

    if (!yielded && report.phase === "files") {
      const start = report.resumeFrom ?? 0;
      let downloadsStarted = 0;
      let extractsThisChunk = 0;
      report.pendingFactDocs ??= [];

      const drainOneStoredFact = async () => {
        while (
          report.pendingFactDocs!.length > 0 &&
          extractsThisChunk < 1 &&
          Date.now() + 2_500 < deadline
        ) {
          const pending = report.pendingFactDocs!.shift()!;
          const outcome = await extractStoredFacts({
            ctx,
            report,
            documentId: pending.documentId,
            filename: pending.filename,
            path: pending.path,
            allowRead: true,
            webViewLink: pending.webViewLink,
            driveFileId: pending.driveFileId,
          });
          if (outcome === "extracted" || outcome === "failed") extractsThisChunk += 1;
        }
      };
      await drainOneStoredFact();
      for (
        let fileIndex = start;
        fileIndex < report.tree.length;
        fileIndex++
      ) {
        if (fileIndex > start && Date.now() >= deadline) {
          report.resumeFrom = fileIndex;
          yielded = true;
          break;
        }
        const node = report.tree[fileIndex];
        report.resumeFrom = fileIndex + 1;
      if (node.isFolder) {
        // Upsert folder rows for tree fidelity, no download.
        const existingFolder = await db
          .select()
          .from(externalSourceFiles)
          .where(
            and(
              eq(externalSourceFiles.sourceId, source.id),
              eq(externalSourceFiles.externalFileId, node.id),
            ),
          )
          .limit(1);
        if (existingFolder[0]) {
          await db
            .update(externalSourceFiles)
            .set({
              name: node.name,
              path: node.path,
              mimeType: node.mimeType,
              isFolder: 1,
              syncStatus: "skipped",
              lastSyncedAt: new Date(),
              lastSyncRunId: run.id,
              updatedAt: new Date(),
            })
            .where(eq(externalSourceFiles.id, existingFolder[0].id));
        } else {
          await db.insert(externalSourceFiles).values({
            organizationId: ctx.organizationId,
            communityId: ctx.communityId,
            sourceId: source.id,
            externalFileId: node.id,
            parentExternalId: node.parents?.[0] ?? null,
            name: node.name,
            mimeType: node.mimeType,
            path: node.path,
            isFolder: 1,
            webViewLink: node.webViewLink ?? null,
            syncStatus: "skipped",
            lastSyncedAt: new Date(),
            lastSyncRunId: run.id,
          });
        }
        report.totals.skipped += 1;
        continue;
      }

      const classification = classifyDriveDocument({
        name: node.name,
        path: node.path,
        mimeType: node.mimeType,
      });
      report.categoryCounts[classification.label] =
        (report.categoryCounts[classification.label] ?? 0) + 1;

      const [existing] = await db
        .select()
        .from(externalSourceFiles)
        .where(
          and(
            eq(externalSourceFiles.sourceId, source.id),
            eq(externalSourceFiles.externalFileId, node.id),
          ),
        )
        .limit(1);

      const unchanged =
        existing &&
        ((node.md5Checksum && existing.md5Checksum === node.md5Checksum) ||
          (existing.modifiedTime &&
            node.modifiedTime &&
            existing.modifiedTime.toISOString() ===
              new Date(node.modifiedTime).toISOString() &&
            existing.sizeBytes === Number(node.size ?? existing.sizeBytes)));

      const plan = classifySyncFile({
        name: node.name,
        mimeType: node.mimeType,
        sizeBytes: Number(node.size ?? "") || null,
        maxBytes: MAX_SYNC_FILE_BYTES,
      });
      const keepStoredOversized =
        plan.action === "skip" &&
        plan.status === "oversized" &&
        Boolean(unchanged && existing?.documentId);
      if (plan.action === "skip" && !keepStoredOversized) {
        const link = await saveSourceFileStatus({
          ctx,
          sourceId: source.id,
          runId: run.id,
          node,
          existingId: existing?.id,
          status: plan.status,
          message: plan.reason,
          classification,
          documentId: existing?.documentId,
        });
        if (plan.status === "unsupported") report.totals.unsupported += 1;
        else if (plan.status === "oversized") report.totals.oversized += 1;
        else report.totals.pendingTranscription += 1;
        report.fileErrors.push({
          path: node.path,
          error: plan.reason,
          status: plan.status,
          driveFileId: node.id,
          webViewLink: link,
          documentId: existing?.documentId ?? undefined,
        });
        continue;
      }

      if (unchanged && existing?.documentId) {
        const link = driveWebViewLink(node.id, node.webViewLink ?? existing.webViewLink);
        await db
          .update(externalSourceFiles)
          .set({
            name: node.name,
            path: node.path,
            mimeType: node.mimeType,
            webViewLink: link,
            classificationLabel: classification.label,
            mappedCategory: classification.category,
            syncStatus: "unchanged",
            syncError: null,
            lastSyncedAt: new Date(),
            lastSyncRunId: run.id,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(externalSourceFiles.id, existing.id),
              eq(externalSourceFiles.communityId, ctx.communityId),
            ),
          );
        report.totals.unchanged += 1;
        if (classification.category === "invoice") {
          await db
            .update(documents)
            .set({ category: "invoice", updatedAt: new Date() })
            .where(
              and(
                eq(documents.id, existing.documentId),
                eq(documents.communityId, ctx.communityId),
                eq(documents.category, "other"),
              ),
            );
        }
        if (FACT_CATEGORIES.has(classification.category)) {
          const outcome = await extractStoredFacts({
            ctx,
            report,
            documentId: existing.documentId,
            filename: node.name,
            path: node.path,
            allowRead: false,
            webViewLink: link,
            driveFileId: node.id,
          });
          if (outcome === "deferred") {
            queueFactDoc(report, {
              documentId: existing.documentId,
              filename: node.name,
              path: node.path,
              category: classification.category,
              webViewLink: link,
              driveFileId: node.id,
            });
          }
        }
        continue;
      }

      try {
        if (downloadsStarted > 0 || Date.now() + DOWNLOAD_RESERVE_MS > deadline) {
          report.resumeFrom = fileIndex;
          yielded = true;
          break;
        }
        downloadsStarted += 1;
        report.resumeFrom = fileIndex + 1;
        await checkpointReport(run.id, report);
        const downloaded = await downloadDriveFile({
          id: node.id,
          mimeType: node.mimeType || "application/octet-stream",
          name: node.name,
        });
        const contentHash = sha256(downloaded.bytes);
        const stored = await withTimeout(
          getStorageProvider().putObject({
            communityId: ctx.communityId,
            originalFilename: downloaded.filename,
            mimeType: downloaded.mimeType,
            body: downloaded.bytes,
          }),
          STORE_TIMEOUT_MS,
          "Saving the file",
        );
        report.totals.downloaded += 1;

        let documentId = existing?.documentId ?? null;
        let changed = false;

        if (documentId) {
          // New version for updated remote file
          const version = await nextDocumentVersion(documentId);
          await db.insert(documentVersions).values({
            organizationId: ctx.organizationId,
            communityId: ctx.communityId,
            documentId,
            version,
            storageProvider: stored.storageProvider,
            storageKey: stored.storageKey,
            originalFilename: downloaded.filename,
            mimeType: downloaded.mimeType,
            byteSize: downloaded.bytes.length,
            contentHash,
            externalFileId: node.id,
            sourceModifiedTime: node.modifiedTime
              ? new Date(node.modifiedTime)
              : null,
            sourceMd5Checksum: node.md5Checksum ?? null,
            notes: "Drive sync version",
          });
          await db
            .update(documents)
            .set({
              storageProvider: stored.storageProvider,
              storageKey: stored.storageKey,
              originalFilename: downloaded.filename,
              mimeType: downloaded.mimeType,
              byteSize: downloaded.bytes.length,
              category: classification.category,
              processingStatus: "needs_review",
              tags: [
                "google_drive",
                classification.label,
                `drive:${node.id}`,
              ],
              updatedAt: new Date(),
            })
            .where(eq(documents.id, documentId));
          changed = true;
          report.totals.changed += 1;
        } else {
          // Reuse existing document with same content hash if present
          const [byHash] = await db
            .select()
            .from(documentVersions)
            .where(
              and(
                eq(documentVersions.communityId, ctx.communityId),
                eq(documentVersions.contentHash, contentHash),
              ),
            )
            .limit(1);

          if (byHash) {
            documentId = byHash.documentId;
            report.totals.skipped += 1;
          } else {
            const [doc] = await db
              .insert(documents)
              .values({
                organizationId: ctx.organizationId,
                communityId: ctx.communityId,
                category: classification.category,
                title: node.name,
                description: `Synced from Google Drive path ${node.path}`,
                storageProvider: stored.storageProvider,
                storageKey: stored.storageKey,
                originalFilename: downloaded.filename,
                mimeType: downloaded.mimeType,
                byteSize: downloaded.bytes.length,
                processingStatus: "needs_review",
                tags: [
                  "google_drive",
                  classification.label,
                  `drive:${node.id}`,
                ],
                uploadedBy: ctx.userId,
              })
              .returning();
            documentId = doc.id;
            await db.insert(documentVersions).values({
              organizationId: ctx.organizationId,
              communityId: ctx.communityId,
              documentId,
              version: 1,
              storageProvider: stored.storageProvider,
              storageKey: stored.storageKey,
              originalFilename: downloaded.filename,
              mimeType: downloaded.mimeType,
              byteSize: downloaded.bytes.length,
              contentHash,
              externalFileId: node.id,
              sourceModifiedTime: node.modifiedTime
                ? new Date(node.modifiedTime)
                : null,
              sourceMd5Checksum: node.md5Checksum ?? null,
              notes: "Initial Drive snapshot",
            });
            report.totals.snapshotted += 1;
            changed = true;
          }
        }

        let fileRowId = existing?.id;
        if (existing) {
          await db
            .update(externalSourceFiles)
            .set({
              name: node.name,
              path: node.path,
              mimeType: node.mimeType,
              modifiedTime: node.modifiedTime
                ? new Date(node.modifiedTime)
                : null,
              sizeBytes: node.size ? Number(node.size) : downloaded.bytes.length,
              md5Checksum: node.md5Checksum ?? null,
              version: node.version ?? null,
              webViewLink:
                node.webViewLink ??
                `https://drive.google.com/file/d/${node.id}/view`,
              classificationLabel: classification.label,
              mappedCategory: classification.category,
              documentId,
              syncStatus: changed ? "downloaded" : "linked",
              lastSyncedAt: new Date(),
              lastSyncRunId: run.id,
              updatedAt: new Date(),
            })
            .where(eq(externalSourceFiles.id, existing.id));
        } else {
          const [row] = await db
            .insert(externalSourceFiles)
            .values({
              organizationId: ctx.organizationId,
              communityId: ctx.communityId,
              sourceId: source.id,
              externalFileId: node.id,
              parentExternalId: node.parents?.[0] ?? null,
              name: node.name,
              mimeType: node.mimeType,
              path: node.path,
              modifiedTime: node.modifiedTime
                ? new Date(node.modifiedTime)
                : null,
              sizeBytes: node.size ? Number(node.size) : downloaded.bytes.length,
              md5Checksum: node.md5Checksum ?? null,
              version: node.version ?? null,
              webViewLink:
                node.webViewLink ??
                `https://drive.google.com/file/d/${node.id}/view`,
              classificationLabel: classification.label,
              mappedCategory: classification.category,
              documentId,
              syncStatus: "downloaded",
              lastSyncedAt: new Date(),
              lastSyncRunId: run.id,
            })
            .returning();
          fileRowId = row.id;
        }

        if (documentId && fileRowId) {
          await db
            .update(documentVersions)
            .set({ externalSourceFileId: fileRowId })
            .where(
              and(
                eq(documentVersions.documentId, documentId),
                eq(documentVersions.contentHash, contentHash),
              ),
            );
        }

        if (documentId && changed) {
          try {
            const text = textFromBytes(
              downloaded.bytes,
              downloaded.mimeType,
              downloaded.filename,
            );
            const candidates = extractCandidatesFromText(text, {
              filename: downloaded.filename,
              path: node.path,
            });
            await persistCandidates({
              ctx,
              documentId,
              candidates,
              report,
            });
            await markExtractionAttempt(ctx, documentId);
            report.totals.parsed += 1;
            report.needsManualReview.push({
              documentId,
              filename: node.name,
              reason: "Synced from Drive — extracted facts stay needs_review until a person verifies them",
            });
          } catch (parseErr) {
            report.totals.parsingFailures += 1;
            report.totals.failed += 1;
            report.totals.errors += 1;
            report.fileErrors.push({
              path: node.path,
              error:
                parseErr instanceof Error
                  ? parseErr.message
                  : String(parseErr),
              status: "failed",
              driveFileId: node.id,
              webViewLink: driveWebViewLink(node.id, node.webViewLink),
              documentId,
            });
            report.needsManualReview.push({
              documentId,
              filename: node.name,
              reason: "Parsing failure during candidate extraction",
            });
          }
        }
      } catch (err) {
        if (isFatalStorageError(err)) {
          const detail = err instanceof Error ? err.message : String(err);
          throw new Error(
            `Cannot store files on this server (${detail}). Netlify keeps documents in Netlify Blobs, not the function disk.`,
          );
        }
        const message = err instanceof Error ? err.message : String(err);
        const overLimit = /sync limit|over the \d+ MB/i.test(message);
        if (overLimit) report.totals.oversized += 1;
        else {
          report.totals.errors += 1;
          report.totals.failed += 1;
        }
        const link = await saveSourceFileStatus({
          ctx,
          sourceId: source.id,
          runId: run.id,
          node,
          existingId: existing?.id,
          status: overLimit ? "oversized" : "error",
          message,
          classification,
          documentId: existing?.documentId,
        });
        report.fileErrors.push({
          path: node.path,
          error: message,
          status: overLimit ? "oversized" : "failed",
          driveFileId: node.id,
          webViewLink: link,
          documentId: existing?.documentId ?? undefined,
        });
      }
    }
    if (!yielded) {
      await drainOneStoredFact();
      if ((report.pendingFactDocs?.length ?? 0) > 0) {
        yielded = true;
      } else {
        report.resumeFrom = report.tree.length;
        report.phase = "finalize";
      }
    }
  }

    if (yielded) {
      if (syncProgressSignature(report) === progressBefore) {
        throw new Error(
          "Drive sync made no progress in this step. Try again.",
        );
      }
      report.status = "running";
      report.finishedAt = "";
      await db
        .update(externalSyncRuns)
        .set({
          status: "running",
          report,
          errorMessage: null,
        })
        .where(eq(externalSyncRuns.id, run.id));
      await db
        .update(externalSources)
        .set({
          lastSyncAt: new Date(),
          lastSyncStatus: "running",
          lastError: null,
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(externalSources.id, source.id));
      return { runId: run.id, report };
    }

    const minutes = minutesAvailability(
      report.tree.map((node) => ({
        id: node.id,
        name: node.name,
        path: node.path,
        isFolder: node.isFolder,
        mimeType: node.mimeType,
        webViewLink: node.webViewLink,
      })),
    );
    report.missingYears = minutes.years;
    report.minutesYearsFound = minutes.years
      .filter((year) => year.status === "available")
      .map((year) => year.year);
    const found2025 = minutes.years.find((year) => year.year === 2025);
    if (found2025?.status === "available") {
      noteDiscovery(
        report,
        "2025 meeting minutes documents were identified. Open the year on this report to see each file.",
      );
    }

    if (report.totals.pendingTranscription > 0) {
      noteDiscovery(
        report,
        `${report.totals.pendingTranscription} audio recording${report.totals.pendingTranscription === 1 ? "" : "s"} stayed on Google Drive for later transcription and ${report.totals.pendingTranscription === 1 ? "was" : "were"} not downloaded.`,
      );
    }
    if (report.totals.oversized > 0) {
      noteDiscovery(
        report,
        `${report.totals.oversized} file${report.totals.oversized === 1 ? "" : "s"} exceeded the 12 MB sync limit and stayed on Google Drive.`,
      );
    }
    if (report.totals.unsupported > 0) {
      noteDiscovery(
        report,
        `${report.totals.unsupported} file${report.totals.unsupported === 1 ? "" : "s"} used a format Community OS does not import. Each one still links to Google Drive.`,
      );
    }
    if (report.totals.factsExtracted === 0) {
      noteDiscovery(
        report,
        report.totals.parsed > 0
          ? "Documents were read, but no financial figures were found in the extracted text. Nothing was marked verified."
          : "No new financial facts were extracted. Unchanged documents that already have facts were left as they are. Statements stored without facts are reread from storage. Extracted facts stay in needs review until someone verifies them.",
      );
    }

    await compareValidationTargets(ctx, report);

    report.status = "completed";
    report.phase = "done";
    report.finishedAt = new Date().toISOString();

    await db
      .update(externalSyncRuns)
      .set({
        status: "completed",
        finishedAt: new Date(),
        report,
      })
      .where(eq(externalSyncRuns.id, run.id));

    await db
      .update(externalSources)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: "completed",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(externalSources.id, source.id));

    await recordAudit({
      ctx,
      action: "external_source.sync",
      entityType: "external_source",
      entityId: source.id,
      after: {
        runId: run.id,
        discovered: report.totals.discovered,
        downloaded: report.totals.downloaded,
        snapshotted: report.totals.snapshotted,
        unchanged: report.totals.unchanged,
        unsupported: report.totals.unsupported,
        oversized: report.totals.oversized,
        failed: report.totals.failed,
        parsed: report.totals.parsed,
        factsExtracted: report.totals.factsExtracted,
        factsNeedingReview: report.totals.factsNeedingReview,
        conflicts: report.totals.conflicts,
      },
    });

    return { runId: run.id, report };
  } catch (err) {
    const message =
      err instanceof GoogleDriveConfigError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    report.status = "failed";
    report.finishedAt = new Date().toISOString();
    if (err instanceof GoogleDriveConfigError) {
      report.missingCredentials = err.missing;
    }
    await db
      .update(externalSyncRuns)
      .set({
        status: err instanceof GoogleDriveConfigError ? "needs_credentials" : "failed",
        finishedAt: new Date(),
        report,
        errorMessage: message,
        missingCredentials:
          err instanceof GoogleDriveConfigError ? err.missing : [],
      })
      .where(eq(externalSyncRuns.id, run.id));
    await db
      .update(externalSources)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: "failed",
        lastError: message,
        status: "error",
        updatedAt: new Date(),
      })
      .where(eq(externalSources.id, source.id));
    return { runId: run.id, report };
  }
}

/** Drive reconciliation: compare recent needs_review/conflicting facts to validation targets + existing facts. */
export async function getDriveReconciliation(ctx: TenantContext) {
  assertCan(ctx.capabilities, "finance.read");

  const [source] = await db
    .select()
    .from(externalSources)
    .where(
      and(
        eq(externalSources.communityId, ctx.communityId),
        eq(externalSources.provider, "google_drive"),
      ),
    )
    .limit(1);

  const latestRun = source
    ? await getLatestSyncRun(ctx, source.id)
    : null;

  const driveDocs = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.communityId, ctx.communityId),
        sql`'google_drive' = any(${documents.tags})`,
      ),
    );

  const driveDocIds = driveDocs.map((d) => d.id);
  const driveFacts =
    driveDocIds.length === 0
      ? []
      : await db
          .select()
          .from(facts)
          .where(
            and(
              eq(facts.communityId, ctx.communityId),
              inArray(facts.documentId, driveDocIds),
            ),
          );

  const existingFacts = await db
    .select()
    .from(facts)
    .where(
      and(
        eq(facts.communityId, ctx.communityId),
        inArray(facts.verificationStatus, ["verified", "reported"]),
      ),
    );

  const targets = await db
    .select()
    .from(validationTargets)
    .where(eq(validationTargets.communityId, ctx.communityId));

  const comparisons = targets.map((t) => {
    const expected = t.expectedNumeric != null ? Number(t.expectedNumeric) : null;
    const driveMatch = driveFacts.find((f) => {
      if (t.factType && f.factType !== t.factType) return false;
      if (expected == null || f.numericValue == null) return false;
      return (
        Math.abs(Number(f.numericValue) - expected) <=
        Number(t.tolerance ?? "1")
      );
    });
    const existingMatch = existingFacts.find((f) => {
      if (t.factType && f.factType !== t.factType) return false;
      if (expected == null || f.numericValue == null) return false;
      return (
        Math.abs(Number(f.numericValue) - expected) <=
        Number(t.tolerance ?? "1")
      );
    });
    const driveAlt = driveFacts.find(
      (f) => t.factType && f.factType === t.factType && f.numericValue != null,
    );
    const existingAlt = existingFacts.find(
      (f) => t.factType && f.factType === t.factType && f.numericValue != null,
    );
    let status: "matched" | "differs" | "missing" | "conflict" = "missing";
    if (driveMatch && existingMatch) status = "matched";
    else if (driveAlt && existingAlt && driveAlt.numericValue !== existingAlt.numericValue)
      status = "conflict";
    else if (driveAlt || existingAlt) status = "differs";
    return {
      key: t.key,
      label: t.label,
      expected: t.expectedNumeric,
      driveValue: driveMatch?.numericValue ?? driveAlt?.numericValue ?? null,
      existingValue:
        existingMatch?.numericValue ?? existingAlt?.numericValue ?? null,
      status,
      notes: t.notes,
    };
  });

  // Candidate transactions stay in extractions
  const txnCandidates =
    driveDocIds.length === 0
      ? []
      : await db
          .select()
          .from(documentExtractions)
          .where(
            and(
              eq(documentExtractions.communityId, ctx.communityId),
              inArray(documentExtractions.documentId, driveDocIds),
              eq(documentExtractions.fieldPath, "transaction_candidate"),
            ),
          );

  void financialTransactions;

  return {
    source,
    latestRun,
    report: (latestRun?.report ?? null) as SyncReport | null,
    driveDocumentCount: driveDocs.length,
    driveFactCount: driveFacts.length,
    transactionCandidateCount: txnCandidates.length,
    comparisons,
  };
}
