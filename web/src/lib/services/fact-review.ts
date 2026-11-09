import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { documents, facts } from "@/lib/db/schema";
import type { VerificationStatus } from "@/lib/domain/enums";
import {
  conflictingFactIds,
  factMatchesReviewFilter,
  type ReviewFilter,
} from "@/lib/domain/fact-review";
import { assertCan, type TenantContext } from "@/lib/domain/permissions";

export type ReviewFactRow = {
  id: string;
  factType: string;
  label: string;
  numericValue: string | null;
  originalNumericValue: string | null;
  unit: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  asOfDate: string | null;
  sourcePage: string | null;
  sourceReference: string | null;
  sourceExcerpt: string | null;
  confidence: string | null;
  verificationStatus: VerificationStatus;
  documentId: string;
  documentTitle: string | null;
  conflicting: boolean;
};

export async function listFactsForReview(
  ctx: TenantContext,
  filter: ReviewFilter,
): Promise<ReviewFactRow[]> {
  assertCan(ctx.capabilities, "finance.read");
  const rows = await db
    .select({
      id: facts.id,
      factType: facts.factType,
      label: facts.label,
      numericValue: facts.numericValue,
      originalNumericValue: facts.originalNumericValue,
      unit: facts.unit,
      periodStart: facts.periodStart,
      periodEnd: facts.periodEnd,
      asOfDate: facts.asOfDate,
      sourcePage: facts.sourcePage,
      sourceReference: facts.sourceReference,
      sourceExcerpt: facts.sourceExcerpt,
      confidence: facts.confidence,
      verificationStatus: facts.verificationStatus,
      documentId: facts.documentId,
      documentTitle: documents.title,
    })
    .from(facts)
    .leftJoin(
      documents,
      and(
        eq(documents.id, facts.documentId),
        eq(documents.communityId, ctx.communityId),
      ),
    )
    .where(
      and(
        eq(facts.organizationId, ctx.organizationId),
        eq(facts.communityId, ctx.communityId),
      ),
    )
    .orderBy(desc(facts.periodStart), desc(facts.createdAt))
    .limit(1000);

  const conflicts = conflictingFactIds(rows);
  return rows
    .filter((row) => factMatchesReviewFilter(row, filter))
    .map((row) => ({
      ...row,
      conflicting: conflicts.has(row.id),
    }));
}
