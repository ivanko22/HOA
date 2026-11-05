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

/**
 * A sync run is inserted with `report = {}` and status `running`.
 * If the function dies before the report is saved, that empty object is still
 * truthy. The source page must not read `.totals` or `.tree` off it.
 */
export function normalizeSyncReport(value: unknown): SyncReport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const report = value as Partial<SyncReport>;
  const hasBody =
    report.totals != null ||
    (Array.isArray(report.tree) && report.tree.length > 0) ||
    typeof report.status === "string" ||
    typeof report.phase === "string";
  if (!hasBody) return null;

  return {
    sourceName: report.sourceName ?? "",
    folderId: report.folderId ?? "",
    folderUrl: report.folderUrl,
    startedAt: report.startedAt ?? "",
    finishedAt: report.finishedAt ?? "",
    status: report.status ?? "",
    missingCredentials: report.missingCredentials ?? [],
    phase: report.phase,
    pendingFolders: report.pendingFolders,
    resumeFrom: report.resumeFrom,
    tree: report.tree ?? [],
    totals: { ...emptyTotals(), ...report.totals },
    categoryCounts: report.categoryCounts ?? {},
    minutesYearsFound: report.minutesYearsFound ?? [],
    missingYears: report.missingYears ?? [],
    discoveries: report.discoveries ?? [],
    matchedTargets: report.matchedTargets ?? [],
    differingTargets: report.differingTargets ?? [],
    conflicts: report.conflicts ?? [],
    needsManualReview: report.needsManualReview ?? [],
    fileErrors: report.fileErrors ?? [],
  };
}
