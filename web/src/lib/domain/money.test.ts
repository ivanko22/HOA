import { describe, expect, it } from "vitest";
import { assertBalanced, formatMoney, money, sumMoney } from "./money";

describe("money", () => {
  it("treats null as unknown, not zero", () => {
    const m = money(null);
    expect(m.amount).toBeNull();
    expect(m.status).toBe("unknown");
    expect(formatMoney(m)).toBe("Unknown");
  });

  it("formats estimates with tilde", () => {
    expect(formatMoney(money("12.5", "estimated"))).toBe("~$12.50");
  });

  it("sums known values and escalates status when unknowns present", () => {
    const total = sumMoney([
      money("10.00", "verified"),
      money(null, "unknown"),
      money("5.00", "reported"),
    ]);
    expect(total.amount).toBe("15.00");
    expect(total.status).toBe("unknown");
  });

  it("returns unknown when all parts unknown", () => {
    const total = sumMoney([money(null), money(null)]);
    expect(total.amount).toBeNull();
    expect(total.status).toBe("unknown");
  });
});

describe("assertBalanced", () => {
  it("accepts balanced lines", () => {
    expect(() =>
      assertBalanced([
        { debit: 100, credit: 0 },
        { debit: 0, credit: 100 },
      ]),
    ).not.toThrow();
  });

  it("rejects unbalanced lines", () => {
    expect(() =>
      assertBalanced([
        { debit: 100, credit: 0 },
        { debit: 0, credit: 90 },
      ]),
    ).toThrow(/does not balance/);
  });
});
