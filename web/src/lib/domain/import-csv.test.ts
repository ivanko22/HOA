import { describe, expect, it } from "vitest";
import {
  applyMapping,
  duplicateFingerprint,
  mappingSchema,
  normalizeAmount,
  normalizeDate,
  parseCsv,
  suggestMapping,
  validateNormalized,
} from "./import-csv";

describe("parseCsv", () => {
  it("parses headers and quoted commas", () => {
    const csv = `Date,Description,Amount
09/07/2026,"Kaiser Law, LLC",-4850.00
09/08/2026,Dues payment,250.00`;
    const parsed = parseCsv(csv);
    expect(parsed.headers).toEqual(["Date", "Description", "Amount"]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].Description).toBe("Kaiser Law, LLC");
    expect(parsed.rows[0].Amount).toBe("-4850.00");
  });

  it("strips BOM", () => {
    const parsed = parseCsv("\uFEFFDate,Amount\n2026-01-01,1");
    expect(parsed.headers[0]).toBe("Date");
  });
});

describe("suggestMapping", () => {
  it("maps generic amount layout", () => {
    const m = suggestMapping(["posted_date", "description", "amount"]);
    expect(m.date).toBe("posted_date");
    expect(m.description).toBe("description");
    expect(m.amount).toBe("amount");
  });

  it("maps debit/credit bank-style headers", () => {
    const m = suggestMapping(
      ["Date", "Memo", "Debit", "Credit", "Category"],
      "bank_csv",
    );
    expect(m.date).toBe("Date");
    expect(m.description).toBe("Memo");
    expect(m.debit).toBe("Debit");
    expect(m.credit).toBe("Credit");
    expect(m.category).toBe("Category");
  });
});

describe("normalizeDate / normalizeAmount", () => {
  it("normalizes MM/DD/YYYY", () => {
    expect(normalizeDate("9/7/2026")).toBe("2026-09-07");
  });

  it("parses currency and parentheses negatives", () => {
    expect(normalizeAmount("$1,234.50")).toBe("1234.50");
    expect(normalizeAmount("(89.40)")).toBe("-89.40");
  });

  it("rejects malformed amounts", () => {
    expect(normalizeAmount("abc")).toBeNull();
    expect(normalizeDate("not-a-date")).toBeNull();
  });
});

describe("applyMapping debit/credit", () => {
  it("uses debit as outflow when amount missing", () => {
    const n = applyMapping(
      { Date: "2026-09-07", Memo: "Kaiser Law", Debit: "4850.00", Credit: "" },
      {
        date: "Date",
        description: "Memo",
        debit: "Debit",
        credit: "Credit",
      },
    );
    expect(n.amount).toBe("4850.00");
    expect(n.direction).toBe("outflow");
    expect(n.classification).toBe("expense");
  });

  it("uses credit as inflow", () => {
    const n = applyMapping(
      { Date: "2026-09-08", Memo: "Owner dues", Debit: "", Credit: "250" },
      {
        date: "Date",
        description: "Memo",
        debit: "Debit",
        credit: "Credit",
      },
    );
    expect(n.amount).toBe("250.00");
    expect(n.direction).toBe("inflow");
    expect(n.classification).toBe("owner_payment");
  });

  it("abs signed amount and sets direction", () => {
    const n = applyMapping(
      { Date: "2026-09-07", Description: "Utility", Amount: "-89.40" },
      { date: "Date", description: "Description", amount: "Amount" },
    );
    expect(n.amount).toBe("89.40");
    expect(n.direction).toBe("outflow");
  });
});

describe("validateNormalized", () => {
  it("reports missing required fields", () => {
    const errors = validateNormalized({
      date: null,
      description: null,
      amount: null,
      direction: "unknown",
      unit: null,
      owner: null,
      vendor: null,
      category: null,
      reference: null,
      externalId: null,
      classification: "unknown",
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        "Missing or invalid date",
        "Missing description",
        "Missing or invalid amount",
      ]),
    );
  });
});

describe("duplicates + mapping schema", () => {
  it("fingerprints deterministically", () => {
    const a = duplicateFingerprint({
      communityId: "c1",
      date: "2026-09-07",
      amount: "4850.00",
      description: "Kaiser Law",
      reference: "chk-9",
    });
    const b = duplicateFingerprint({
      communityId: "c1",
      date: "2026-09-07",
      amount: "4850.00",
      description: "  kaiser   law ",
      reference: "chk-9",
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("requires date, description, and amount or debit/credit", () => {
    expect(mappingSchema.safeParse({ date: "D", description: "M" }).success).toBe(
      false,
    );
    expect(
      mappingSchema.safeParse({
        date: "D",
        description: "M",
        debit: "Debit",
      }).success,
    ).toBe(true);
  });
});
