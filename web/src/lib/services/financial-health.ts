import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  bankAccounts,
  charges,
  financialPeriods,
  invoices,
  payments,
} from "@/lib/db/schema";
import type { VerificationStatus } from "@/lib/domain/enums";
import { worstVerification } from "@/lib/domain/enums";
import { formatMoney, money, sumMoney, type MoneyAmount } from "@/lib/domain/money";
import {
  assertCan,
  type TenantContext,
} from "@/lib/domain/permissions";

/** Fact query boundary for future KPI wiring — see fact-metrics.ts */
export { getFactsForMetric } from "./fact-metrics";

export type KpiCard = {
  id: string;
  label: string;
  value: MoneyAmount;
  displayValue: string;
  period: { start: string; end: string; label: string };
  lastVerifiedAt: string | null;
  verificationStatus: VerificationStatus;
  drilldownHref: string;
};

export type FinancialHealthDashboard = {
  period: { start: string; end: string; label: string };
  kpis: KpiCard[];
  charts: {
    incomeVsExpenses: { label: string; income: number | null; expenses: number | null; status: VerificationStatus }[];
    duesBilledVsCollected: { label: string; billed: number | null; collected: number | null; status: VerificationStatus }[];
    expenseBreakdown: { category: string; amount: number | null; status: VerificationStatus }[];
    cashHistory: { label: string; balance: number | null; status: VerificationStatus }[];
    arAging: { bucket: string; amount: number | null; status: VerificationStatus }[];
    apAging: { bucket: string; amount: number | null; status: VerificationStatus }[];
    specialAssessment: { label: string; progress: number | null; status: VerificationStatus }[];
    capitalSpending: { project: string; amount: number | null; status: VerificationStatus }[];
    insuranceHistory: { label: string; amount: number | null; status: VerificationStatus }[];
    legalHistory: { label: string; amount: number | null; status: VerificationStatus }[];
  };
};

function toNumberOrNull(m: MoneyAmount): number | null {
  if (m.amount == null || m.status === "unknown") return null;
  return Number(m.amount);
}

export async function getFinancialHealth(
  ctx: TenantContext,
): Promise<FinancialHealthDashboard> {
  assertCan(ctx.capabilities, "transparency.read");

  const periods = await db
    .select()
    .from(financialPeriods)
    .where(
      and(
        eq(financialPeriods.organizationId, ctx.organizationId),
        eq(financialPeriods.communityId, ctx.communityId),
      ),
    );

  const period =
    periods.find((p) => !p.isClosed) ??
    periods[0] ?? {
      name: "Current (unconfigured)",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    };

  const periodMeta = {
    start: period.startDate,
    end: period.endDate,
    label: period.name,
  };

  const banks = await db
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.organizationId, ctx.organizationId),
        eq(bankAccounts.communityId, ctx.communityId),
      ),
    );

  const cashParts = banks.map((b) =>
    money(b.balance, b.balanceStatus),
  );
  const cash = sumMoney(cashParts);

  const reserveParts = banks
    .filter((b) => /reserve/i.test(b.name))
    .map((b) => money(b.balance, b.balanceStatus));
  const reserves = sumMoney(
    reserveParts.length ? reserveParts : [money(null, "unknown")],
  );

  const chargeRows = await db
    .select()
    .from(charges)
    .where(
      and(
        eq(charges.organizationId, ctx.organizationId),
        eq(charges.communityId, ctx.communityId),
      ),
    );
  const billed = sumMoney(
    chargeRows.map((c) => money(c.amount, c.amountStatus)),
  );

  const paymentRows = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.organizationId, ctx.organizationId),
        eq(payments.communityId, ctx.communityId),
      ),
    );
  const collected = sumMoney(
    paymentRows.map((p) => money(p.amount, p.amountStatus)),
  );

  const invoiceRows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, ctx.organizationId),
        eq(invoices.communityId, ctx.communityId),
        eq(invoices.status, "open"),
      ),
    );
  const ap = sumMoney(
    invoiceRows.map((i) => money(i.amount, i.amountStatus)),
  );

  const openCharges = chargeRows.filter(
    (c) => c.status === "posted" || c.status === "partially_paid" || c.status === "pending",
  );
  const ar = sumMoney(
    openCharges.map((c) => money(c.amount, c.amountStatus)),
  );

  // Operating expenses / collection rate — unknown until verified books exist
  const operatingExpenses = money(null, "unknown");
  let collectionRate: MoneyAmount = money(null, "unknown");
  if (billed.amount != null && collected.amount != null && Number(billed.amount) !== 0) {
    const rate = (Number(collected.amount) / Number(billed.amount)) * 100;
    collectionRate = money(rate.toFixed(2), worstVerification([billed.status, collected.status]));
  } else if (billed.status === "unknown" || collected.status === "unknown") {
    collectionRate = money(null, "unknown");
  }

  const lastVerifiedAt =
    banks
      .map((b) => b.balanceAsOf)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  const kpi = (
    id: string,
    label: string,
    value: MoneyAmount,
    href: string,
    asPercent = false,
  ): KpiCard => ({
    id,
    label,
    value,
    displayValue: asPercent
      ? value.amount == null || value.status === "unknown"
        ? "Unknown"
        : `${value.status === "estimated" ? "~" : ""}${value.amount}%`
      : formatMoney(value),
    period: periodMeta,
    lastVerifiedAt,
    verificationStatus: value.status,
    drilldownHref: href,
  });

  return {
    period: periodMeta,
    kpis: [
      kpi("cash", "Cash", cash, "/app/ledger?focus=cash"),
      kpi("dues_collected", "Dues Collected", collected, "/app/ledger?focus=dues"),
      kpi("opex", "Base Operating Expenses", operatingExpenses, "/app/ledger?focus=expenses"),
      kpi("ar", "Accounts Receivable", ar, "/app/ledger?focus=ar"),
      kpi("ap", "Accounts Payable", ap, "/app/ledger?focus=ap"),
      kpi("reserves", "Reserve Balance", reserves, "/app/ledger?focus=reserves"),
      {
        ...kpi("collection_rate", "Collection Rate", collectionRate, "/app/ledger?focus=collections", true),
      },
    ],
    charts: {
      incomeVsExpenses: [
        {
          label: periodMeta.label,
          income: toNumberOrNull(collected),
          expenses: null,
          status: worstVerification([collected.status, "unknown"]),
        },
      ],
      duesBilledVsCollected: [
        {
          label: periodMeta.label,
          billed: toNumberOrNull(billed),
          collected: toNumberOrNull(collected),
          status: worstVerification([billed.status, collected.status]),
        },
      ],
      expenseBreakdown: [
        "Utilities",
        "Insurance",
        "Legal",
        "Maintenance",
        "Management",
      ].map((category) => ({
        category,
        amount: null,
        status: "unknown" as const,
      })),
      cashHistory: banks.length
        ? banks.map((b) => ({
            label: b.name,
            balance: toNumberOrNull(money(b.balance, b.balanceStatus)),
            status: b.balanceStatus,
          }))
        : [{ label: "Operating", balance: null, status: "unknown" }],
      arAging: [
        { bucket: "Current", amount: toNumberOrNull(ar), status: ar.status },
        { bucket: "31–60", amount: null, status: "unknown" },
        { bucket: "61–90", amount: null, status: "unknown" },
        { bucket: "90+", amount: null, status: "unknown" },
      ],
      apAging: [
        { bucket: "Current", amount: toNumberOrNull(ap), status: ap.status },
        { bucket: "31–60", amount: null, status: "unknown" },
        { bucket: "61–90", amount: null, status: "unknown" },
        { bucket: "90+", amount: null, status: "unknown" },
      ],
      specialAssessment: [
        { label: "No verified special assessment on file", progress: null, status: "unknown" },
      ],
      capitalSpending: [
        { project: "No verified capital spend on file", amount: null, status: "unknown" },
      ],
      insuranceHistory: ["2024", "2025", "2026"].map((label) => ({
        label,
        amount: null,
        status: "unknown" as const,
      })),
      legalHistory: ["2024", "2025", "2026"].map((label) => ({
        label,
        amount: null,
        status: "unknown" as const,
      })),
    },
  };
}
