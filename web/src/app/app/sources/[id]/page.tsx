import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { requireTenantContext } from "@/lib/auth/config";
import { can } from "@/lib/domain/permissions";
import {
  getExternalSource,
  getLatestSyncRun,
  listSourceFiles,
} from "@/lib/services/drive-sync";
import { minutesAvailability } from "@/lib/domain/minutes-availability";
import { normalizeSyncReport } from "@/lib/services/sync-report";
import { Badge } from "@/components/ui/badge";
import { SyncRunButton } from "../continue-sync";

const TREE_PREVIEW_LIMIT = 250;

export default async function SourceDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string; continue?: string; syncError?: string }>;
}) {
  try {
    return await renderSourceDetail(props);
  } catch (err) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : String(err);
    return (
      <div
        className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950"
        role="alert"
      >
        <p className="font-semibold">This source page hit an error</p>
        <p className="mt-1 break-words">{message}</p>
      </div>
    );
  }
}

async function renderSourceDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string; continue?: string; syncError?: string }>;
}) {
  const ctx = await requireTenantContext();
  const { id } = await params;
  const sp = await searchParams;
  const autoContinue = sp.continue === "1";
  const source = await getExternalSource(ctx, id);
  const files = await listSourceFiles(ctx, id);
  const latest = await getLatestSyncRun(ctx, id);
  const report = normalizeSyncReport(latest?.report);
  const canSync = can(ctx.capabilities, "documents.manage");
  const minutes = minutesAvailability(
    files.map((file) => ({
      id: file.externalFileId,
      name: file.name,
      path: file.path,
      isFolder: file.isFolder,
      mimeType: file.mimeType,
      webViewLink: file.webViewLink,
      documentId: file.documentId,
    })),
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-[var(--muted)]">
            <Link href="/app/sources" className="hover:underline">
              Sources
            </Link>{" "}
            / {source.name}
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl tracking-tight">
            {source.name}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {source.provider} · folder{" "}
            <a
              href={source.config?.folderUrl}
              className="text-[var(--accent)] hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              {source.config?.folderId}
            </a>
          </p>
        </div>
        {canSync ? (
          <SyncRunButton sourceId={source.id} label="Sync now" flush />
        ) : null}
      </div>

      {sp.syncError === "1" ? (
        <div
          className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950"
          role="alert"
        >
          Sync could not finish in this request. Use Continue sync if a run is
          still in progress, or Sync now to start again.
        </div>
      ) : null}

      {latest?.status === "running" ? (
        <div className="border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <p className="font-semibold">Sync in progress</p>
          <p className="mt-1">
            {report == null
              ? "This run stopped before a report was saved. Continue sync to list the Drive folder."
              : report.phase === "listing"
                ? "Listing the Drive folder. Each step stays short so the host does not return a 502."
                : "Saving files from Drive. Each step stays short so the host does not return a 502."}
          </p>
          <SyncRunButton
            key={`${latest.id}:${report?.phase ?? ""}:${report?.resumeFrom ?? 0}:${report?.totals.discovered ?? 0}:${report?.totals.snapshotted ?? 0}:${report?.totals.errors ?? 0}`}
            sourceId={source.id}
            resumeRunId={latest.id}
            autoStart={autoContinue}
            label="Continue sync"
          />
        </div>
      ) : null}

      {latest?.status === "failed" && latest.errorMessage ? (
        <div
          className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950"
          role="alert"
        >
          <p className="font-semibold">Sync failed</p>
          <p className="mt-1">{latest.errorMessage}</p>
        </div>
      ) : null}

      {latest?.status === "needs_credentials" ||
      (report?.missingCredentials?.length ?? 0) > 0 ? (
        <div
          className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="alert"
        >
          <p className="font-semibold">Google Drive credentials missing</p>
          <p className="mt-1">
            Set one of:{" "}
            <code>
              {(report?.missingCredentials ?? latest?.missingCredentials ?? []).join(
                ", ",
              )}
            </code>
          </p>
          <p className="mt-1 text-[var(--muted)]">
            Prefer <code>GOOGLE_DRIVE_API_KEY</code> for public-link folders, or
            a service account via{" "}
            <code>GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON</code> /{" "}
            <code>GOOGLE_APPLICATION_CREDENTIALS</code>.
          </p>
        </div>
      ) : null}

      {report ? (
        <section className="space-y-4 border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold">Latest sync report</h2>
          <p className="text-sm text-[var(--muted)]">
            Status: {report.status} · finished {report.finishedAt}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <Stat label="Discovered" value={report.totals.discovered} />
            <Stat
              label="Downloaded"
              value={
                report.totals.downloaded > 0
                  ? report.totals.downloaded
                  : report.totals.snapshotted + report.totals.changed
              }
            />
            <Stat label="Unchanged" value={report.totals.unchanged} />
            <Stat label="Skipped" value={report.totals.skipped} />
            <Stat label="Unsupported" value={report.totals.unsupported} />
            <Stat label="Oversized" value={report.totals.oversized} />
            <Stat
              label="Failed"
              value={
                report.totals.failed > 0
                  ? report.totals.failed
                  : report.totals.errors
              }
            />
            <Stat label="Parsed" value={report.totals.parsed} />
            <Stat
              label="Facts extracted"
              value={
                report.totals.factsExtracted > 0
                  ? report.totals.factsExtracted
                  : report.totals.candidateFacts +
                    report.totals.candidateMaintenanceCapital
              }
            />
            <Stat
              label="Facts requiring review"
              value={
                report.totals.factsNeedingReview > 0
                  ? report.totals.factsNeedingReview
                  : report.totals.factsExtracted > 0
                    ? report.totals.factsExtracted
                    : report.totals.candidateFacts +
                      report.totals.candidateMaintenanceCapital
              }
            />
            <Stat
              label="Transcription later"
              value={report.totals.pendingTranscription}
            />
          </div>
          <p className="text-sm text-[var(--muted)]">
            Extracted figures stay in needs review until someone verifies them.
            Audio recordings stay on Google Drive for later transcription.
          </p>

          {report.discoveries.length ? (
            <div className="border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
              {report.discoveries.map((d) => (
                <p key={d}>{d}</p>
              ))}
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="font-medium">Category counts</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {Object.entries(report.categoryCounts).map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-4">
                    <span>{k}</span>
                    <span className="tabular-nums">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-medium">Minutes years</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">
                A year is available only when a minutes document is identified.
                Recordings do not count.
              </p>
              <ul className="mt-2 space-y-3 text-sm">
                {minutes.years.map((y) => (
                  <li key={y.year} id={`minutes-${y.year}`}>
                    <a href={`#minutes-${y.year}`} className="hover:underline">
                      <Badge variant={y.status === "available" ? "verified" : "missing"}>
                        {y.year}: {y.status === "available" ? "available" : y.status.replaceAll("_", " ")}
                      </Badge>
                    </a>
                    <p className="mt-1 text-[var(--muted)]">{y.note}</p>
                    {y.documents.length ? (
                      <ul className="mt-1 space-y-1">
                        {y.documents.map((doc) => (
                          <li key={`${doc.driveFileId}:${doc.kind}`}>
                            <span className="text-[var(--muted)]">
                              {doc.kind === "recording" ? "Recording" : "Minutes"}:
                            </span>{" "}
                            {doc.path}{" "}
                            <a
                              href={doc.webViewLink}
                              className="text-[var(--accent)] hover:underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open in Drive
                            </a>
                            {doc.documentId ? (
                              <>
                                {" "}
                                ·{" "}
                                <Link
                                  href={`/app/documents/${doc.documentId}`}
                                  className="text-[var(--accent)] hover:underline"
                                >
                                  Open document
                                </Link>
                              </>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
              {minutes.undated.length ? (
                <div className="mt-3">
                  <p className="font-medium">Minutes without a year in the name</p>
                  <ul className="mt-1 space-y-1">
                    {minutes.undated.map((doc) => (
                      <li key={doc.driveFileId}>
                        {doc.path}{" "}
                        <a
                          href={doc.webViewLink}
                          className="text-[var(--accent)] hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open in Drive
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="font-medium">Matched validation targets</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {report.matchedTargets.length === 0 ? (
                  <li className="text-[var(--muted)]">None yet</li>
                ) : (
                  report.matchedTargets.map((m) => (
                    <li key={m.key}>
                      {m.label}: expected {m.expected}, found {m.found}
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div>
              <h3 className="font-medium">Differing / missing targets</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {report.differingTargets.length === 0 ? (
                  <li className="text-[var(--muted)]">None</li>
                ) : (
                  report.differingTargets.map((m) => (
                    <li key={m.key}>
                      {m.label}: expected {m.expected}, found{" "}
                      {m.found ?? "—"} — {m.note}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>

          <div>
            <h3 className="font-medium">Folder / file tree</h3>
            <pre className="mt-2 max-h-64 overflow-auto bg-[var(--surface-hover)] p-3 text-xs">
              {report.tree
                .slice(0, TREE_PREVIEW_LIMIT)
                .map((n) => `${n.isFolder ? "📁" : "📄"} ${n.path}`)
                .join("\n")}
              {report.tree.length > TREE_PREVIEW_LIMIT
                ? `\n… ${report.tree.length - TREE_PREVIEW_LIMIT} more`
                : ""}
            </pre>
          </div>

          {report.fileErrors?.length ? (
            <div>
              <h3 className="font-medium">Files that need attention</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Each row names the Drive file and why it was skipped or failed.
                Open the original, or the stored document when one exists.
              </p>
              <ul className="mt-2 space-y-2 text-sm">
                {report.fileErrors.slice(0, 20).map((err) => (
                  <li key={`${err.path}:${err.status ?? ""}:${err.error}`}>
                    <Badge variant={issueVariant(err.status)}>{issueLabel(err.status)}</Badge>{" "}
                    {err.webViewLink ? (
                      <a
                        href={err.webViewLink}
                        className="text-[var(--accent)] hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {err.path}
                      </a>
                    ) : (
                      err.path
                    )}
                    {err.documentId ? (
                      <>
                        {" "}
                        ·{" "}
                        <Link
                          href={`/app/documents/${err.documentId}`}
                          className="text-[var(--accent)] hover:underline"
                        >
                          Open document
                        </Link>
                      </>
                    ) : null}
                    <p className="mt-1 text-[var(--muted)]">{err.error}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-sm">
            <Link
              href="/app/sources/reconciliation"
              className="text-[var(--accent)] hover:underline"
            >
              Open Drive reconciliation
            </Link>
          </p>
        </section>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          No sync has been run yet. Use Sync now to enumerate the Drive folder.
        </p>
      )}

      <section>
        <h2 className="text-lg font-semibold">Mirrored files</h2>
        <div className="mt-3 overflow-x-auto border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--surface-hover)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">Path</th>
                <th className="px-3 py-2">Class</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Document</th>
              </tr>
            </thead>
            <tbody>
              {files.filter((f) => !f.isFolder).length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-[var(--muted)]"
                  >
                    No files mirrored yet.
                  </td>
                </tr>
              ) : null}
              {files.length === 200 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-2 text-xs text-[var(--muted)]"
                  >
                    Showing the first 200 mirrored files.
                  </td>
                </tr>
              ) : null}
              {files
                .filter((f) => !f.isFolder)
                .map((f) => (
                  <tr
                    key={f.id}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-3 py-2">
                      <div>{f.path}</div>
                      <div className="text-xs text-[var(--muted)]">
                        {f.externalFileId}
                        {f.externalFileId ? (
                          <>
                            {" "}
                            ·{" "}
                            <a
                              href={
                                f.webViewLink ??
                                `https://drive.google.com/file/d/${f.externalFileId}/view`
                              }
                              className="text-[var(--accent)] hover:underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open in Drive
                            </a>
                          </>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {f.classificationLabel ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={syncStatusVariant(f.syncStatus)}>
                        {syncStatusLabel(f.syncStatus)}
                      </Badge>
                      {f.syncError ? (
                        <p className="mt-1 max-w-sm text-xs text-[var(--muted)]">
                          {f.syncError}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {f.documentId ? (
                        <Link
                          href={`/app/documents/${f.documentId}`}
                          className="text-[var(--accent)] hover:underline"
                        >
                          Open
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function syncStatusLabel(status: string) {
  switch (status) {
    case "pending_transcription":
      return "Transcription later";
    case "oversized":
      return "Oversized";
    case "unsupported":
      return "Unsupported";
    case "error":
      return "Failed";
    case "unchanged":
      return "Unchanged";
    case "downloaded":
      return "Downloaded";
    case "linked":
      return "Linked";
    case "skipped":
      return "Skipped";
    default:
      return status;
  }
}

function syncStatusVariant(
  status: string,
): "pending" | "missing" | "unknown" | "conflicting" | "verified" | "available" | "source_only" | "needs_review" {
  switch (status) {
    case "pending_transcription":
      return "pending";
    case "oversized":
      return "missing";
    case "unsupported":
      return "unknown";
    case "error":
      return "conflicting";
    case "unchanged":
    case "downloaded":
      return "available";
    case "linked":
      return "verified";
    case "skipped":
      return "source_only";
    default:
      return "needs_review";
  }
}

function issueLabel(status: string | undefined) {
  switch (status) {
    case "pending_transcription":
      return "Transcription later";
    case "oversized":
      return "Oversized";
    case "unsupported":
      return "Unsupported";
    default:
      return "Failed";
  }
}

function issueVariant(
  status: string | undefined,
): "pending" | "missing" | "unknown" | "conflicting" {
  switch (status) {
    case "pending_transcription":
      return "pending";
    case "oversized":
      return "missing";
    case "unsupported":
      return "unknown";
    default:
      return "conflicting";
  }
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-[var(--border)] px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-xl tabular-nums">{value}</p>
    </div>
  );
}
