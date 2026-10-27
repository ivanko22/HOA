import Decimal from "decimal.js";
import type { VerificationStatus } from "./enums";
import { worstVerification } from "./enums";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export type MoneyAmount = {
  /** Null means unknown — never treat as zero. */
  amount: string | null;
  status: VerificationStatus;
  currency: "USD";
};

export function money(
  amount: string | number | null | undefined,
  status: VerificationStatus = amount == null ? "unknown" : "reported",
): MoneyAmount {
  if (amount == null || amount === "") {
    return { amount: null, status: "unknown", currency: "USD" };
  }
  return {
    amount: new Decimal(amount).toFixed(2),
    status,
    currency: "USD",
  };
}

export function parseMoney(value: string | number): Decimal {
  return new Decimal(value);
}

export function formatMoney(value: MoneyAmount | null | undefined): string {
  if (!value || value.amount == null || value.status === "unknown") {
    return "Unknown";
  }
  const n = new Decimal(value.amount);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: value.currency,
  }).format(n.toNumber());
  if (value.status === "estimated") return `~${formatted}`;
  return formatted;
}

/**
 * Sum money values. Unknown/null amounts are excluded from the numeric sum
 * and force the aggregate status to at least `unknown` (or worse via worst-wins).
 */
export function sumMoney(parts: MoneyAmount[]): MoneyAmount {
  if (parts.length === 0) {
    return { amount: null, status: "unknown", currency: "USD" };
  }
  const statuses = parts.map((p) => p.status);
  const known = parts.filter((p) => p.amount != null);
  if (known.length === 0) {
    return {
      amount: null,
      status: worstVerification(statuses),
      currency: "USD",
    };
  }
  const total = known.reduce(
    (acc, p) => acc.plus(p.amount!),
    new Decimal(0),
  );
  const hasUnknown = parts.some((p) => p.amount == null);
  const status = worstVerification([
    ...statuses,
    ...(hasUnknown ? (["unknown"] as const) : []),
  ]);
  return { amount: total.toFixed(2), status, currency: "USD" };
}

export function assertBalanced(
  lines: { debit: string | number; credit: string | number }[],
): void {
  const debits = lines.reduce(
    (acc, l) => acc.plus(l.debit || 0),
    new Decimal(0),
  );
  const credits = lines.reduce(
    (acc, l) => acc.plus(l.credit || 0),
    new Decimal(0),
  );
  if (!debits.equals(credits)) {
    throw new Error(
      `Journal entry does not balance: debits=${debits.toFixed(2)} credits=${credits.toFixed(2)}`,
    );
  }
  if (lines.length < 2) {
    throw new Error("Journal entry requires at least two lines");
  }
}
