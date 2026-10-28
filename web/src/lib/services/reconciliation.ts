import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  facts,
  financialTransactions,
  importBatches,
  importRows,
} from "@/lib/db/schema";
import {
  assertCan,
  type TenantContext,
} from "@/lib/domain/permissions";
import { money, type MoneyAmount } from "@/lib/domain/money";

export type ReconciliationSummary = {
  periodStart: string;
  periodEnd: string;
  importedIncome: MoneyAmount;
  importedExpenses: MoneyAmount;
  uncategorizedAmount: MoneyAmount;
  unreviewedRowCount: number;
  duplicateRowCount: number;
  invalidRowCount: number;
  approvedTransactionCount: number;
  sourceReportedTotals: {
    label: string;
    amount: MoneyAmount;
    factId: string;
    documentId: string;
  }[];
  comparison: {
    reportedExpenses: MoneyAmount;
    importedExpenseTotal: MoneyAmount;
    difference: MoneyAmount;
    note: string;
  } | null;
};

function sumAmounts(
  rows: { amount: string; direction: string; classification: string }[],
  pred: (r: { amount: string; direction: string; classification: string }) => boolean,
): string {
  let total = 0;
  for (const r of rows) {
    if (!pred(r)) continue;
    total += Number(r.amount);
  }
  return total.toFixed(2);
}

export async function getReconciliationSummary(
  ctx: TenantContext,
  period: { start: string; end: string },
): Promise<ReconciliationSummary> {
  assertCan(ctx.capabilities, "finance.read");

  const txs = await db
    .select({
      amount: financialTransactions.amount,
      direction: financialTransactions.direction,
      classification: financialTransactions.classification,
      category: financialTransactions.category,
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.organizationId, ctx.organizationId),
        eq(financialTransactions.communityId, ctx.communityId),
        gte(financialTransactions.transactionDate, period.start),
        lte(financialTransactions.transactionDate, period.end),
        eq(financialTransactions.status, "posted"),
      ),
    );

  const income = sumAmounts(
    txs,
    (r) =>
      r.direction === "inflow" ||
      r.classification === "income" ||
      r.classification === "owner_payment" ||
      r.classification === "assessment" ||
      r.classification === "refund",
  );
  const expenses = sumAmounts(
    txs,
    (r) =>
      r.direction === "outflow" ||
      r.classification === "expense",
  );
  const uncategorizedExact = sumAmounts(
    txs.map((t) => ({
      amount: t.amount,
      direction: t.direction,
      classification:
        !t.category || t.classification === "unknown"
          ? "unknown"
          : t.classification,
    })),
    (r) => r.classification === "unknown",
  );

  const rowStats = await db
    .select({
      status: importRows.status,
      count: sql<number>`count(*)::int`,
    })
    .from(importRows)
    .innerJoin(importBatches, eq(importRows.batchId, importBatches.id))
    .where(
      and(
        eq(importRows.organizationId, ctx.organizationId),
        eq(importRows.communityId, ctx.communityId),
      ),
    )
    .groupBy(importRows.status);

  const countBy = (status: string) =>
    Number(rowStats.find((r) => r.status === status)?.count ?? 0);

  const periodFacts = await db
    .select()
    .from(facts)
    .where(
      and(
        eq(facts.organizationId, ctx.organizationId),
        eq(facts.communityId, ctx.communityId),
        sql`(
          (${facts.periodStart} is not null and ${facts.periodEnd} is not null
            and ${facts.periodStart} <= ${period.end}
            and ${facts.periodEnd} >= ${period.start})
          or (${facts.asOfDate} is not null
            and ${facts.asOfDate} >= ${period.start}
            and ${facts.asOfDate} <= ${period.end})
        )`,
      ),
    );

  const sourceReportedTotals = periodFacts
    .filter(
      (f) =>
        f.numericValue != null &&
        (f.factType.includes("expense") ||
          f.factType.includes("income") ||
          f.factType.includes("revenue") ||
          f.factType.includes("operating")),
    )
    .map((f) => ({
      label: f.label,
      amount: money(f.numericValue, f.verificationStatus),
      factId: f.id,
      documentId: f.documentId,
    }));

  const expenseFacts = periodFacts.filter(
    (f) =>
      f.numericValue != null &&
      (f.factType === "base_operating_expenses" ||
        f.factType === "operating_expenses"),
  );

  let comparison: ReconciliationSummary["comparison"] = null;
  if (expenseFacts.length > 0) {
    // Use the first matching reported/verified expense fact for comparison —
    // difference is informational until reconciled.
    const fact = expenseFacts.sort((a, b) => {
      const rank = (s: string) =>
        s === "verified" ? 0 : s === "reported" ? 1 : 2;
      return rank(a.verificationStatus) - rank(b.verificationStatus);
    })[0];
    const reported = Number(fact.numericValue);
    const imported = Number(expenses);
    const diff = (imported - reported).toFixed(2);
    comparison = {
      reportedExpenses: money(fact.numericValue, fact.verificationStatus),
      importedExpenseTotal: money(expenses, "reported"),
      difference: money(diff, "needs_review"),
      note: "Difference is informational until reconciled — not automatically an error.",
    };
  }

  return {
    periodStart: period.start,
    periodEnd: period.end,
    importedIncome: money(income, txs.length ? "reported" : "unknown"),
    importedExpenses: money(expenses, txs.length ? "reported" : "unknown"),
    uncategorizedAmount: money(
      uncategorizedExact,
      txs.length ? "reported" : "unknown",
    ),
    unreviewedRowCount:
      countBy("needs_review") + countBy("ready") + countBy("duplicate"),
    duplicateRowCount: countBy("duplicate"),
    invalidRowCount: countBy("invalid"),
    approvedTransactionCount: txs.length,
    sourceReportedTotals,
    comparison,
  };
}
