import { and, desc, eq } from "drizzle-orm";
import { requireTenantContext } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { auditEvents } from "@/lib/db/schema";
import { assertCan } from "@/lib/domain/permissions";

export default async function AuditPage() {
  const ctx = await requireTenantContext();
  assertCan(ctx.capabilities, "audit.read");

  const rows = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, ctx.organizationId),
        eq(auditEvents.communityId, ctx.communityId),
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Audit log
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Append-only events. Financial history must remain reconstructable.
        </p>
      </div>

      <div className="overflow-x-auto border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-[var(--surface-hover)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2">When (UTC)</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Entity</th>
              <th className="px-4 py-2">Actor</th>
              <th className="px-4 py-2">After</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--border)] align-top">
                <td className="px-4 py-2 tabular-nums text-xs">
                  {r.createdAt.toISOString()}
                </td>
                <td className="px-4 py-2 font-medium">{r.action}</td>
                <td className="px-4 py-2">
                  {r.entityType}
                  {r.entityId ? (
                    <span className="block text-xs text-[var(--muted)]">
                      {r.entityId}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-xs">{r.actorUserId ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs text-[var(--muted)]">
                  {r.after ? r.after.slice(0, 120) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
