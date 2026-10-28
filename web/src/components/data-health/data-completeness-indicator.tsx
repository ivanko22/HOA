import { Badge } from "@/components/ui/badge";
import type { DataHealthStatus } from "@/lib/domain/enums";

export type CompletenessItem = {
  id: string;
  year: number | null;
  label: string;
  status: DataHealthStatus;
  notes?: string | null;
};

function statusCopy(status: DataHealthStatus): string {
  switch (status) {
    case "available":
      return "Records available";
    case "missing":
      return "Not currently available";
    case "needs_reconciliation":
      return "Needs reconciliation";
    case "pending":
      return "Pending";
    default:
      return "Unknown";
  }
}

export function DataCompletenessIndicator({
  title,
  items,
}: {
  title: string;
  items: CompletenessItem[];
}) {
  return (
    <section className="border border-[var(--border)] bg-[var(--surface)]">
      <header className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Absence of a record does not imply it never existed.
        </p>
      </header>
      <ul className="divide-y divide-[var(--border)]">
        {items.length === 0 ? (
          <li className="px-4 py-3 text-sm text-[var(--muted)]">
            No completeness checks configured.
          </li>
        ) : (
          items.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {item.year != null ? `${item.year} — ` : ""}
                  {item.label.replace(/^\d{4}\s*/, "")}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {item.notes ?? statusCopy(item.status)}
                </p>
              </div>
              <Badge variant={item.status}>
                {statusCopy(item.status)}
              </Badge>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
