import type { ReactNode } from "react";
import { VerificationBadge } from "@/components/verification/verification-badge";
import type { VerificationStatus } from "@/lib/domain/enums";
import { formatMoney, money } from "@/lib/domain/money";
import { SourceReference } from "./source-reference";

export type FactRowProps = {
  id: string;
  label: string;
  factType: string;
  value: string | null;
  numericValue: string | null;
  unit: string | null;
  verificationStatus: VerificationStatus;
  sourcePage?: string | null;
  sourceReference?: string | null;
  sourceExcerpt?: string | null;
  documentHref?: string;
  periodLabel?: string | null;
  actions?: ReactNode;
};

export function FactRow({
  label,
  factType,
  value,
  numericValue,
  unit,
  verificationStatus,
  sourcePage,
  sourceReference,
  sourceExcerpt,
  documentHref,
  periodLabel,
  actions,
}: FactRowProps) {
  const display =
    numericValue != null
      ? unit === "USD"
        ? formatMoney(money(numericValue, verificationStatus))
        : `${verificationStatus === "estimated" ? "~" : ""}${numericValue}${unit ? ` ${unit}` : ""}`
      : value ?? "Unknown";

  return (
    <tr className="border-t border-[var(--border)] align-top">
      <td className="px-4 py-3">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-[var(--muted)]">{factType}</p>
        {periodLabel ? (
          <p className="text-xs text-[var(--muted)]">{periodLabel}</p>
        ) : null}
      </td>
      <td className="px-4 py-3 tabular-nums">{display}</td>
      <td className="px-4 py-3">
        <VerificationBadge status={verificationStatus} />
      </td>
      <td className="px-4 py-3">
        <SourceReference
          page={sourcePage}
          reference={sourceReference}
          excerpt={sourceExcerpt}
          documentHref={documentHref}
        />
      </td>
      <td className="px-4 py-3">{actions ?? null}</td>
    </tr>
  );
}
