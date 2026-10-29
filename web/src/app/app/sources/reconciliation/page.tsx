import Link from "next/link";
import { requireTenantContext } from "@/lib/auth/config";
import { getDriveReconciliation } from "@/lib/services/drive-sync";
import { Badge } from "@/components/ui/badge";

export default async function DriveReconciliationPage() {
  const ctx = await requireTenantContext();
  const data = await getDriveReconciliation(ctx);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-[var(--muted)]">
          <Link href="/app/sources" className="hover:underline">
            Sources
          </Link>{" "}
          / Reconciliation
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Drive reconciliation
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Compare newly parsed Drive candidates with existing Community OS facts
          and seeded validation targets. Differences create conflicts — neither
          side is overwritten.
        </p>
      </div>

      {!data.source ? (
        <p className="text-sm text-[var(--muted)]">
          No Google Drive source configured.{" "}
          <Link href="/app/sources" className="text-[var(--accent)] hover:underline">
            Add Willows Condos Records
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Drive documents" value={data.driveDocumentCount} />
            <Stat label="Drive facts" value={data.driveFactCount} />
            <Stat
              label="Txn candidates"
              value={data.transactionCandidateCount}
            />
          </div>

          {data.report?.discoveries?.length ? (
            <div className="border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
              {data.report.discoveries.map((d) => (
                <p key={d}>{d}</p>
              ))}
            </div>
          ) : null}

          <section className="overflow-x-auto border border-[var(--border)] bg-[var(--surface)]">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--surface-hover)] text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Expected</th>
                  <th className="px-4 py-3">Drive</th>
                  <th className="px-4 py-3">Existing COS</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.comparisons.map((c) => (
                  <tr
                    key={c.key}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.label}</div>
                      {c.notes ? (
                        <div className="text-xs text-[var(--muted)]">
                          {c.notes}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {c.expected ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {c.driveValue ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {c.existingValue ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          c.status === "matched"
                            ? "verified"
                            : c.status === "conflict"
                              ? "conflicting"
                              : c.status === "differs"
                                ? "needs_review"
                                : "unknown"
                        }
                      >
                        {c.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {data.latestRun ? (
            <p className="text-sm text-[var(--muted)]">
              Latest sync: {data.latestRun.status} ·{" "}
              <Link
                href={`/app/sources/${data.source.id}`}
                className="text-[var(--accent)] hover:underline"
              >
                Full report
              </Link>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl tabular-nums">{value}</p>
    </div>
  );
}
