import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { journalEntries, journalLines } from "@/lib/db/schema";
import { assertBalanced } from "@/lib/domain/money";
import {
  assertCan,
  type TenantContext,
} from "@/lib/domain/permissions";
import { recordAudit } from "./audit";

export type JournalLineInput = {
  accountId: string;
  debit?: string | number;
  credit?: string | number;
  memo?: string;
  unitId?: string;
  vendorId?: string;
  projectId?: string;
  legalCaseId?: string;
};

export async function createDraftJournal(
  ctx: TenantContext,
  input: {
    periodId: string;
    entryDate: string;
    memo?: string;
    lines: JournalLineInput[];
    provenanceId?: string;
  },
) {
  assertCan(ctx.capabilities, "finance.write");
  assertBalanced(
    input.lines.map((l) => ({
      debit: l.debit ?? 0,
      credit: l.credit ?? 0,
    })),
  );

  const [entry] = await db
    .insert(journalEntries)
    .values({
      organizationId: ctx.organizationId,
      communityId: ctx.communityId,
      periodId: input.periodId,
      entryDate: input.entryDate,
      memo: input.memo,
      status: "draft",
      provenanceId: input.provenanceId,
    })
    .returning();

  await db.insert(journalLines).values(
    input.lines.map((l) => ({
      organizationId: ctx.organizationId,
      communityId: ctx.communityId,
      journalEntryId: entry.id,
      accountId: l.accountId,
      debit: String(l.debit ?? 0),
      credit: String(l.credit ?? 0),
      memo: l.memo,
      unitId: l.unitId,
      vendorId: l.vendorId,
      projectId: l.projectId,
      legalCaseId: l.legalCaseId,
    })),
  );

  await recordAudit({
    ctx,
    action: "journal.create_draft",
    entityType: "journal_entry",
    entityId: entry.id,
    after: { memo: input.memo, lineCount: input.lines.length },
  });

  return entry;
}

export async function postJournal(ctx: TenantContext, journalEntryId: string) {
  assertCan(ctx.capabilities, "finance.post");

  const [entry] = await db
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.id, journalEntryId),
        eq(journalEntries.organizationId, ctx.organizationId),
        eq(journalEntries.communityId, ctx.communityId),
      ),
    )
    .limit(1);

  if (!entry) throw new Error("Journal entry not found");
  if (entry.status === "posted") throw new Error("Already posted");
  if (entry.status === "reversed") throw new Error("Cannot post reversed entry");

  const lines = await db
    .select()
    .from(journalLines)
    .where(eq(journalLines.journalEntryId, entry.id));

  assertBalanced(lines);

  const [updated] = await db
    .update(journalEntries)
    .set({
      status: "posted",
      postedAt: new Date(),
      postedBy: ctx.userId,
      updatedAt: new Date(),
    })
    .where(eq(journalEntries.id, entry.id))
    .returning();

  await recordAudit({
    ctx,
    action: "journal.post",
    entityType: "journal_entry",
    entityId: entry.id,
    before: { status: entry.status },
    after: { status: "posted" },
  });

  return updated;
}

export async function reverseJournal(
  ctx: TenantContext,
  journalEntryId: string,
  entryDate: string,
) {
  assertCan(ctx.capabilities, "finance.post");

  const [entry] = await db
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.id, journalEntryId),
        eq(journalEntries.organizationId, ctx.organizationId),
        eq(journalEntries.communityId, ctx.communityId),
      ),
    )
    .limit(1);

  if (!entry || entry.status !== "posted") {
    throw new Error("Only posted journals can be reversed");
  }

  const lines = await db
    .select()
    .from(journalLines)
    .where(eq(journalLines.journalEntryId, entry.id));

  const reversing = await createDraftJournal(ctx, {
    periodId: entry.periodId,
    entryDate,
    memo: `Reversal of ${entry.id}`,
    lines: lines.map((l) => ({
      accountId: l.accountId,
      debit: l.credit,
      credit: l.debit,
      memo: l.memo ?? undefined,
      unitId: l.unitId ?? undefined,
      vendorId: l.vendorId ?? undefined,
      projectId: l.projectId ?? undefined,
      legalCaseId: l.legalCaseId ?? undefined,
    })),
    provenanceId: entry.provenanceId ?? undefined,
  });

  await db
    .update(journalEntries)
    .set({ reversesEntryId: entry.id, updatedAt: new Date() })
    .where(eq(journalEntries.id, reversing.id));

  await postJournal(ctx, reversing.id);

  await db
    .update(journalEntries)
    .set({ status: "reversed", updatedAt: new Date() })
    .where(eq(journalEntries.id, entry.id));

  await recordAudit({
    ctx,
    action: "journal.reverse",
    entityType: "journal_entry",
    entityId: entry.id,
    after: { reversingEntryId: reversing.id },
  });

  return reversing;
}
