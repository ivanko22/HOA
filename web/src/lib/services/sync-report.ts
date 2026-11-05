import type { SyncReport } from "./drive-sync";

const emptyTotals = (): SyncReport["totals"] => ({
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
});

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asText).filter((item) => item.length > 0);
}

function asPhase(value: unknown): SyncReport["phase"] {
  if (
    value === "listing" ||
    value === "files" ||
    value === "finalize" ||
    value === "done"
  ) {
    return value;
  }
  return undefined;
}

/**
 * A sync run is inserted with `report = {}` and status `running`.
 * If the function dies before the report is saved, that empty object is still
 * truthy. The source page must not read `.totals` or `.tree` off it, and a
 * partial or corrupted report must not throw while rendering.
 */
export function normalizeSyncReport(value: unknown): SyncReport | null {
  const report = asRecord(value);
  if (!report) return null;
  const hasBody =
    report.totals != null ||
    (Array.isArray(report.tree) && report.tree.length > 0) ||
    typeof report.status === "string" ||
    typeof report.phase === "string";
  if (!hasBody) return null;

  const totals = asRecord(report.totals);
  const counts = asRecord(report.categoryCounts);
  const categoryCounts: Record<string, number> = {};
  if (counts) {
    for (const [key, count] of Object.entries(counts)) {
      if (typeof count === "number" && Number.isFinite(count)) {
        categoryCounts[key] = count;
      }
    }
  }

  return {
    sourceName: asText(report.sourceName),
    folderId: asText(report.folderId),
    folderUrl: asText(report.folderUrl) || undefined,
    startedAt: asText(report.startedAt),
    finishedAt: asText(report.finishedAt),
    status: asText(report.status),
    missingCredentials: asStringArray(report.missingCredentials),
    phase: asPhase(report.phase),
    pendingFolders: Array.isArray(report.pendingFolders)
      ? report.pendingFolders.flatMap((item) => {
          const row = asRecord(item);
          if (!row) return [];
          const id = asText(row.id);
          const path = asText(row.path);
          return id && path ? [{ id, path }] : [];
        })
      : undefined,
    resumeFrom:
      typeof report.resumeFrom === "number" && Number.isFinite(report.resumeFrom)
        ? report.resumeFrom
        : undefined,
    tree: Array.isArray(report.tree)
      ? report.tree.flatMap((item) => {
          const row = asRecord(item);
          if (!row) return [];
          const path = asText(row.path);
          if (!path) return [];
          return [
            {
              id: asText(row.id),
              name: asText(row.name),
              path,
              isFolder: row.isFolder === true,
              mimeType: asText(row.mimeType) || undefined,
            },
          ];
        })
      : [],
    totals: {
      ...emptyTotals(),
      ...(totals
        ? Object.fromEntries(
            Object.keys(emptyTotals()).map((key) => [
              key,
              asNumber(totals[key]),
            ]),
          )
        : {}),
    },
    categoryCounts,
    minutesYearsFound: Array.isArray(report.minutesYearsFound)
      ? report.minutesYearsFound.filter(
          (year): year is number => typeof year === "number" && Number.isFinite(year),
        )
      : [],
    missingYears: Array.isArray(report.missingYears)
      ? report.missingYears.flatMap((item) => {
          const row = asRecord(item);
          if (!row || typeof row.year !== "number") return [];
          return [
            {
              year: row.year,
              status: asText(row.status),
              note: asText(row.note),
            },
          ];
        })
      : [],
    discoveries: asStringArray(report.discoveries),
    matchedTargets: Array.isArray(report.matchedTargets)
      ? report.matchedTargets.flatMap((item) => {
          const row = asRecord(item);
          if (!row) return [];
          const key = asText(row.key);
          if (!key) return [];
          return [
            {
              key,
              label: asText(row.label),
              expected: asText(row.expected),
              found: asText(row.found),
            },
          ];
        })
      : [],
    differingTargets: Array.isArray(report.differingTargets)
      ? report.differingTargets.flatMap((item) => {
          const row = asRecord(item);
          if (!row) return [];
          const key = asText(row.key);
          if (!key) return [];
          const found = row.found == null ? null : asText(row.found);
          return [
            {
              key,
              label: asText(row.label),
              expected: asText(row.expected),
              found,
              note: asText(row.note),
            },
          ];
        })
      : [],
    conflicts: [],
    needsManualReview: [],
    fileErrors: Array.isArray(report.fileErrors)
      ? report.fileErrors.flatMap((item) => {
          const row = asRecord(item);
          if (!row) return [];
          return [{ path: asText(row.path), error: asText(row.error) }];
        })
      : [],
  };
}
