"use client";

import Link from "next/link";
import { useState } from "react";
import { DocumentThumbnail } from "./document-thumbnail";
import { VisualStatusBadge } from "@/components/verification/visual-status-badge";
import type { VisualVerificationStatus } from "@/lib/domain/enums";

export type ExpandableFact = {
  id: string;
  label: string;
  factType: string;
  numericValue: string | null;
  periodLabel: string;
  sourcePage: string | null;
  sourceExcerpt: string | null;
  evidenceMatchText: string | null;
  visualVerificationStatus: VisualVerificationStatus;
};

type Props = {
  documentId: string;
  title: string;
  mimeType: string | null;
  facts: ExpandableFact[];
};

function moneyLabel(value: string | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

export function DocumentFactsExpand({
  documentId,
  title,
  mimeType,
  facts,
}: Props) {
  const [open, setOpen] = useState(false);
  if (facts.length === 0) {
    return <span className="text-xs text-[var(--muted)]">No amounts</span>;
  }
  const primary = facts[0];

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <DocumentThumbnail
          documentId={documentId}
          title={title}
          page={primary.sourcePage}
          excerpt={primary.sourceExcerpt}
          matchText={primary.evidenceMatchText}
          amountLabel={moneyLabel(primary.numericValue)}
          mimeType={mimeType}
        />
        <div className="min-w-0">
          <p className="tabular-nums font-medium">
            {moneyLabel(primary.numericValue)}
          </p>
          <p className="truncate text-xs text-[var(--muted)]">{primary.label}</p>
          {facts.length > 1 ? (
            <button
              type="button"
              className="mt-1 text-xs text-[var(--accent)] hover:underline"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
            >
              {open ? "Hide" : "Show"} {facts.length} extracted amounts
            </button>
          ) : null}
        </div>
      </div>
      {open ? (
        <ul className="space-y-2 border-l border-[var(--border)] pl-3">
          {facts.map((fact) => (
            <li key={fact.id} className="flex items-start gap-3 text-xs">
              <DocumentThumbnail
                documentId={documentId}
                title={`${title} · ${fact.label}`}
                page={fact.sourcePage}
                excerpt={fact.sourceExcerpt}
                matchText={fact.evidenceMatchText}
                amountLabel={moneyLabel(fact.numericValue)}
                mimeType={mimeType}
                className="shrink-0"
              />
              <div className="min-w-0 space-y-1">
                <p className="font-medium">{fact.label}</p>
                <p className="tabular-nums">{moneyLabel(fact.numericValue)}</p>
                <p className="text-[var(--muted)]">{fact.periodLabel}</p>
                <VisualStatusBadge status={fact.visualVerificationStatus} />
                <p>
                  <Link
                    href={`/app/sources/verification/${fact.id}`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    Side-by-side
                  </Link>
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
