import Link from "next/link";
import { requireTenantContext } from "@/lib/auth/config";
import { can } from "@/lib/domain/permissions";
import { listExternalSources } from "@/lib/services/drive-sync";
import { Badge } from "@/components/ui/badge";
import { ensureWillowsSourceAction } from "./actions";

export default async function SourcesPage() {
  const ctx = await requireTenantContext();
  const sources = await listExternalSources(ctx);
  const canManage = can(ctx.capabilities, "documents.manage");
  const hasWillows = sources.some(
    (s) => s.name === "Willows Condos Records" && s.provider === "google_drive",
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
            External sources
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Google Drive and other external folders are mirrored into Community
            OS with full provenance. Synced extractions stay{" "}
            <strong>needs review</strong> — never auto-verified.
          </p>
        </div>
        {canManage && !hasWillows ? (
          <form action={ensureWillowsSourceAction}>
            <button
              type="submit"
              className="bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Add Willows Condos Records
            </button>
          </form>
        ) : null}
      </div>

      <p className="text-sm">
        <Link
          href="/app/sources/reconciliation"
          className="text-[var(--accent)] hover:underline"
        >
          Drive reconciliation view
        </Link>
      </p>

      <div className="overflow-x-auto border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface-hover)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Provider</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last sync</th>
            </tr>
          </thead>
          <tbody>
            {sources.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  No external sources yet.
                </td>
              </tr>
            ) : (
              sources.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/app/sources/${s.id}`}
                      className="font-medium text-[var(--accent)] hover:underline"
                    >
                      {s.name}
                    </Link>
                    {s.config?.folderUrl ? (
                      <p className="text-xs text-[var(--muted)]">
                        {s.config.folderId}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{s.provider}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        s.status === "active"
                          ? "verified"
                          : s.status === "error"
                            ? "conflicting"
                            : "pending"
                      }
                    >
                      {s.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {s.lastSyncAt
                      ? `${s.lastSyncAt.toLocaleString("en-US", {
                          timeZone: "America/New_York",
                        })} ET (${s.lastSyncStatus ?? "—"})`
                      : "Never"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
