import { and, eq } from "drizzle-orm";
import { requireTenantContext } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { assertCan } from "@/lib/domain/permissions";
import { Badge } from "@/components/ui/badge";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const ctx = await requireTenantContext();
  assertCan(ctx.capabilities, "documents.read");
  const params = await searchParams;

  const rows = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.organizationId, ctx.organizationId),
        eq(documents.communityId, ctx.communityId),
      ),
    );

  const filtered = params.category
    ? rows.filter((d) => d.category === params.category)
    : rows;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Documents
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Repository for minutes, statements, insurance, contracts, and more.
          Extracted values require verification before becoming financial facts.
        </p>
      </div>

      <div className="overflow-x-auto border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[var(--surface-hover)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Tags</th>
              <th className="px-4 py-2">Size</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-3 font-medium">{d.title}</td>
                <td className="px-4 py-3">
                  <Badge variant="default">
                    {d.category.replaceAll("_", " ")}
                  </Badge>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {d.documentDate ?? "Unknown"}
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">
                  {(d.tags ?? []).join(", ") || "—"}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {d.byteSize === 0 ? "Catalog only" : `${d.byteSize} B`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
