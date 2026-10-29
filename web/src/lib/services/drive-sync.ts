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
  extractYears,
  type ExtractedCandidate,
} from "@/lib/domain/drive-classify";
import {
  assertCan,
  type TenantContext,
} from "@/lib/domain/permissions";
import {
  downloadDriveFile,
  listDriveTree,
} from "@/lib/integrations/google-drive/client";
import { getGoogleDriveCredentialsStatus } from "@/lib/integrations/google-drive/credentials";
import { GoogleDriveConfigError } from "@/lib/integrations/google-drive/types";
import { getStorageProvider } from "@/lib/storage";
import { recordAudit } from "./audit";

export type SyncReport = {
  sourceName: string;
  folderId: string;
  folderUrl?: string;
  startedAt: string;
  finishedAt: string;
  status: string;
  missingCredentials: string[];
  tree: { id: string; name: string; path: string; isFolder: boolean; mimeType?: string }[];
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
  };
  categoryCounts: Record<string, number>;
  minutesYearsFound: number[];
  missingYears: { year: number; status: string; note: string }[];
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
  fileErrors: { path: string; error: string }[];
};

const WILLOWS_FOLDER_ID = "1f_b0P34xEuiDEefrei6m2jNwHu3cxA2Y";

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
    .orderBy(externalSourceFiles.path);
}

export async function getLatestSyncRun(ctx: TenantContext, sourceId: string) {
  assertCan(ctx.capabilities, "documents.read");
  const [run] = await db
    .select()
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

function textFromBytes(bytes: Buffer, mimeType: string): string {
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "text/csv" ||
    mimeType.includes("csv")
  ) {
    return bytes.toString("utf8").slice(0, 500_000);
  }
  // Best-effort: extract printable sequences from PDFs/binary for heuristics.
  const raw = bytes.toString("latin1");
  const printable = raw.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, " ");
  return printable.slice(0, 200_000);
}

async function persistCandidates(params: {
  ctx: TenantContext;
  documentId: string;
  candidates: ExtractedCandidate[];
  report: SyncReport;
}) {
  const { ctx, documentId, candidates, report } = params;
  for (const c of candidates) {
    if (c.kind === "fact" || c.kind === "maintenance_capital") {
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
        verificationStatus: "needs_review",
      });

      // Also create a needs_review fact so it appears in fact/reconciliation UIs.
      if (c.numericValue != null || c.kind === "maintenance_capital") {
        // Conflict check against existing verified/reported facts of same type
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

        let status: "needs_review" | "conflicting" = "needs_review";
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
            // Flag the existing fact as conflicting too (retain both).
            await db
              .update(facts)
              .set({
                verificationStatus: "conflicting",
                updatedAt: new Date(),
              })
              .where(eq(facts.id, ex.id));
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
          sourceExcerpt: c.sourceExcerpt ?? null,
          sourceReference: "google_drive_sync",
          verificationStatus: status,
          notes: "Auto-extracted from Drive sync — needs review",
          createdBy: ctx.userId,
        });
      }
    } else if (c.kind === "transaction") {
      report.totals.candidateTransactions += 1;
      await db.insert(documentExtractions).values({
        organizationId: ctx.organizationId,
        communityId: ctx.communityId,
        documentId,
        fieldPath: "transaction_candidate",
        rawValue: c.rawValue ?? null,
        parsedValue: c,
        verificationStatus: "needs_review",
      });
      // Do not auto-post financial_transactions — keep as extraction only until reviewed.
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

export async function syncExternalSource(
  ctx: TenantContext,
  sourceId: string,
): Promise<{ runId: string; report: SyncReport }> {
  assertCan(ctx.capabilities, "documents.manage");
  const source = await getExternalSource(ctx, sourceId);
  const folderId = source.config?.folderId;
  if (!folderId) throw new Error("External source is missing folderId in config");

  const [run] = await db
    .insert(externalSyncRuns)
    .values({
      organizationId: ctx.organizationId,
      communityId: ctx.communityId,
      sourceId: source.id,
      status: "running",
      startedBy: ctx.userId,
    })
    .returning();

  const report: SyncReport = {
    sourceName: source.name,
    folderId,
    folderUrl: source.config?.folderUrl,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    status: "running",
    missingCredentials: [],
    tree: [],
    totals: {
      discovered: 0,
      folders: 0,
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
  };

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

  try {
    const tree = await listDriveTree(
      folderId,
      source.config?.folderName ?? source.name,
    );
    report.tree = tree.map((n) => ({
      id: n.id,
      name: n.name,
      path: n.path,
      isFolder: n.isFolder,
      mimeType: n.mimeType,
    }));
    report.totals.discovered = tree.length;
    report.totals.folders = tree.filter((n) => n.isFolder).length;
    report.totals.files = tree.filter((n) => !n.isFolder).length;

    const minutesYears = new Set<number>();

    for (const node of tree) {
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

      if (classification.label === "Meeting Minutes") {
        for (const y of extractYears(`${node.path} ${node.name}`)) {
          minutesYears.add(y);
        }
      }

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

      if (unchanged && existing.documentId) {
        await db
          .update(externalSourceFiles)
          .set({
            name: node.name,
            path: node.path,
            mimeType: node.mimeType,
            classificationLabel: classification.label,
            mappedCategory: classification.category,
            syncStatus: "unchanged",
            lastSyncedAt: new Date(),
            lastSyncRunId: run.id,
            updatedAt: new Date(),
          })
          .where(eq(externalSourceFiles.id, existing.id));
        report.totals.unchanged += 1;
        continue;
      }

      try {
        const downloaded = await downloadDriveFile({
          id: node.id,
          mimeType: node.mimeType,
          name: node.name,
        });
        const contentHash = sha256(downloaded.bytes);
        const stored = await getStorageProvider().putObject({
          communityId: ctx.communityId,
          originalFilename: downloaded.filename,
          mimeType: downloaded.mimeType,
          body: downloaded.bytes,
        });

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
            const text = textFromBytes(downloaded.bytes, downloaded.mimeType);
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
            report.needsManualReview.push({
              documentId,
              filename: node.name,
              reason: "Synced from Drive — processingStatus=needs_review",
            });
          } catch (parseErr) {
            report.totals.parsingFailures += 1;
            report.fileErrors.push({
              path: node.path,
              error:
                parseErr instanceof Error
                  ? parseErr.message
                  : String(parseErr),
            });
            report.needsManualReview.push({
              documentId,
              filename: node.name,
              reason: "Parsing failure during candidate extraction",
            });
          }
        }
      } catch (err) {
        report.totals.errors += 1;
        const message = err instanceof Error ? err.message : String(err);
        report.fileErrors.push({ path: node.path, error: message });
        if (existing) {
          await db
            .update(externalSourceFiles)
            .set({
              syncStatus: "error",
              syncError: message,
              lastSyncRunId: run.id,
              updatedAt: new Date(),
            })
            .where(eq(externalSourceFiles.id, existing.id));
        } else {
          await db.insert(externalSourceFiles).values({
            organizationId: ctx.organizationId,
            communityId: ctx.communityId,
            sourceId: source.id,
            externalFileId: node.id,
            name: node.name,
            mimeType: node.mimeType,
            path: node.path,
            syncStatus: "error",
            syncError: message,
            classificationLabel: classification.label,
            mappedCategory: classification.category,
            lastSyncRunId: run.id,
          });
        }
      }
    }

    report.minutesYearsFound = [...minutesYears].sort();
    for (const year of [2024, 2025, 2026]) {
      if (minutesYears.has(year)) {
        report.missingYears.push({
          year,
          status: "available",
          note:
            year === 2025
              ? "IMPORTANT: 2025 meeting minutes were found in Drive (previously believed unavailable)."
              : `${year} minutes found in Drive sync`,
        });
        if (year === 2025) {
          report.discoveries.push(
            "2025 meeting minutes discovered in Google Drive — previously believed unavailable.",
          );
        }
      } else {
        report.missingYears.push({
          year,
          status: year === 2025 ? "missing_expected" : "not_found_in_sync",
          note:
            year === 2025
              ? "2025 minutes still not found — believed unavailable"
              : `${year} minutes not detected in synced filenames/paths`,
        });
      }
    }

    await compareValidationTargets(ctx, report);

    report.status = "completed";
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
        snapshotted: report.totals.snapshotted,
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
    throw err;
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
