import { describe, expect, it } from "vitest";
import {
  classifyDriveDocument,
  extractCandidatesFromText,
  extractYears,
  isSameFinancialMetric,
  reviewStatusForExtractedFact,
  uniqueFinancialMetrics,
} from "./drive-classify";

describe("classifyDriveDocument", () => {
  it("classifies meeting minutes", () => {
    const c = classifyDriveDocument({
      name: "Board Meeting Minutes October 2026.pdf",
      path: "/Willows Condos Records/2026/Minutes",
    });
    expect(c.label).toBe("Meeting Minutes");
    expect(c.category).toBe("meeting_minutes");
  });

  it("classifies general ledger", () => {
    const c = classifyDriveDocument({
      name: "GL Detail Sep 2026.csv",
      path: "/Financials/General Ledger",
    });
    expect(c.label).toBe("General Ledger");
  });

  it("classifies assessment reports as financial statements", () => {
    const c = classifyDriveDocument({
      name: "September 2026 Assessment Report.pdf",
      path: "/Willows Condos Records/Financials",
    });
    expect(c.label).toBe("Financial Statements");
    expect(c.category).toBe("financial_statement");
  });

  it("classifies a roof repair bill as an invoice", () => {
    const c = classifyDriveDocument({
      name: "Roof repair 6663.pdf",
      path: "/Willows Condos Records/Monthly Bills and Receipts/By Month/August 2026",
    });
    expect(c.category).toBe("invoice");
    expect(c.label).toBe("Construction / Repair");
  });

  it("classifies insurance", () => {
    const c = classifyDriveDocument({
      name: "Certificate of Insurance.pdf",
      path: "/Insurance",
    });
    expect(c.category).toBe("insurance");
  });
});

describe("extractYears / extractCandidatesFromText", () => {
  it("finds years", () => {
    expect(extractYears("Minutes 2024 and 2026")).toEqual([2024, 2026]);
  });

  it("extracts cash balance and dues candidates", () => {
    const text = `
      September 2026 Treasurer Report
      Cash balance $50,184.00
      HOA dues $51,688.10
      Total operating income $67,540.60
      Total operating expenses $60,298.70
      Willows Assessment $21,282.55
    `;
    const c = extractCandidatesFromText(text, {
      filename: "Sep-2026-financials.pdf",
      path: "/2026/Financials",
    });
    expect(c.find((x) => x.factType === "cash_balance")?.numericValue).toBe(
      "50184.00",
    );
    expect(
      c.find((x) => x.factType === "monthly_dues_collected")?.numericValue,
    ).toBe("51688.10");
    expect(c.find((x) => x.factType === "operating_income")?.numericValue).toBe(
      "67540.60",
    );
    expect(
      c.find((x) => x.factType === "operating_expenses")?.numericValue,
    ).toBe("60298.70");
    expect(
      c.find((x) => x.factType === "special_assessment_collected")?.numericValue,
    ).toBe("21282.55");
    expect(c.every((x) => x.numericValue != null)).toBe(true);
    const cash = c.find((x) => x.factType === "cash_balance");
    expect(cash?.unit).toBe("USD");
    expect(cash?.periodStart).toBe("2026-09-01");
    expect(cash?.periodEnd).toBe("2026-09-30");
    expect(cash?.asOfDate).toBe("2026-09-30");
    expect(Number(cash?.confidence)).toBeGreaterThan(0);
    expect(Number(cash?.confidence)).toBeLessThan(1);
    expect(reviewStatusForExtractedFact()).toBe("needs_review");
  });

  it("reads balance sheet, income statement, and assessment lines from statement text", () => {
    const text = `
      Page 2
      September 2026 balance sheet
      Total assets $80,250.00
      Total liabilities $19,100.00
      Income statement
      Net income $4,100.25
      Assessment $21,282.55
    `;
    const found = extractCandidatesFromText(text, {
      filename: "2026-09-income-statement.pdf",
      path: "/Financials",
    });
    expect(found.find((x) => x.factType === "total_assets")?.numericValue).toBe(
      "80250.00",
    );
    expect(
      found.find((x) => x.factType === "total_liabilities")?.numericValue,
    ).toBe("19100.00");
    expect(found.find((x) => x.factType === "net_income")?.numericValue).toBe(
      "4100.25",
    );
    expect(found.find((x) => x.factType === "total_assets")?.sourcePage).toBe("2");
    expect(found.every((x) => x.confidence !== "1.00")).toBe(true);
  });

  it("uses the invoice amount due instead of an unlabeled number", () => {
    const text = `
      Roof Repair
      474.24 120.50 Td
      Billed on: 08/22/2026
      Amount Due: $2,110.00
      Services 1 2,110.00
      Total $2,110.00
      Amount Paid $0.00
      Applied Credits $0.00
      Amount Due $2,110.00
    `;
    const found = extractCandidatesFromText(text, {
      filename: "Roof repair 6663.pdf",
      path: "/Willows Condos Records/Monthly Bills and Receipts/By Month/August 2026/Roof repair 6663.pdf",
    });
    const amounts = found
      .filter((item) => item.numericValue)
      .map((item) => item.numericValue);
    expect(amounts).toContain("2110.00");
    expect(amounts).not.toContain("474.24");
    expect(amounts).not.toContain("0.00");
    const due = found.find((item) => item.factType === "invoice_amount");
    expect(due?.label).toBe("Amount due");
    expect(due?.sourceExcerpt).toMatch(/Amount Due/i);
    expect(due?.asOfDate).toBe("2026-08-22");
    expect(due?.periodStart).toBe("2026-08-01");
    expect(due?.periodEnd).toBe("2026-08-31");
  });

  it("does not turn a PDF coordinate into a roof repair amount", () => {
    const found = extractCandidatesFromText("474.24 312.00 Td\nRoof repair", {
      filename: "Roof repair 6663.pdf",
      path: "/Willows Condos Records/Monthly Bills and Receipts/By Month/August 2026",
    });
    expect(found.map((item) => item.numericValue)).not.toContain("474.24");
    expect(found.find((item) => item.factType === "capital_expenditure")).toBeUndefined();
  });

  it("reads the labeled month column on a cash-basis statement", () => {
    const text = `
      Page 1
      September 2026
      Operating Income & Expense
      Income
      HOA Dues 51,688.10 76.53 277,186.12
      Assessment 2,054.75 3.04 12,100.00
      Willows Assessment 21,282.55 31.49 106,253.64
      Total Operating Income
      Expense
      Total Operating Expense
      NOI - Net Operating Income 7,241.90 10.72 -73,479.77
      Total Expense 60,298.70 89.28 380,727.29
      Net Income 27,262.50 40.36 94,878.32
      Cash in Bank 40,514.73
      Cash in Bank - Reserve 0.03
      Cash in Bank - Assessment 9,669.24
      Total Liabilities
      Capital
      Bank Transfer -20.00
    `;
    const found = extractCandidatesFromText(text, {
      filename: "Willows Financials Sep 2026.pdf",
      path: "/Willows Condos Records/Financials/Willows Financials Sep 2026.pdf",
    });
    const amount = (factType: string) =>
      found.find((item) => item.factType === factType)?.numericValue;
    expect(amount("monthly_dues_collected")).toBe("51688.10");
    expect(amount("operating_expenses")).toBe("60298.70");
    expect(amount("special_assessment_collected")).toBe("21282.55");
    expect(amount("net_income")).toBe("7241.90");
    expect(amount("cash_balance")).toBe("40514.73");
    expect(amount("reserve_balance")).toBe("0.03");
    expect(amount("operating_income")).toBeUndefined();
    expect(amount("total_liabilities")).toBeUndefined();
    expect(found.map((item) => item.numericValue)).not.toContain("20.00");
    expect(found.map((item) => item.numericValue)).not.toContain("2054.75");
    expect(found.map((item) => item.numericValue)).not.toContain("27262.50");
    expect(found.find((item) => item.factType === "net_income")?.sourceExcerpt).toMatch(
      /Net Operating Income/,
    );
  });

  it("skips a multi-month grid and keeps the selected-month total", () => {
    const text = `
      April 2026
      Total Operating
      Expense
      0.00
      0.00
      0.00
      5,826.70
      Total Expense
      52,593.93
      122.73
      72,669.02
      NOI - Net Operating Income
      -9,750.69
      -22.75
      -890.41
    `;
    const found = extractCandidatesFromText(text, {
      filename: "Willows Financials April 2026(1).pdf",
      path: "/Financials/Willows Financials April 2026(1).pdf",
    });
    expect(found.find((item) => item.factType === "operating_expenses")?.numericValue).toBe(
      "52593.93",
    );
    expect(found.find((item) => item.factType === "net_income")?.numericValue).toBe("-9750.69");
    expect(found.map((item) => item.numericValue)).not.toContain("0.00");
  });

  it("does not read an owner ledger or general-ledger change as the monthly assessment", () => {
    const ledger = extractCandidatesFromText(
      "Willows\nAssessment\n178.58\n178.58\n178.58\n0.00\nMoore, Mindy\nWillows\nAssessment\n155.48\n126.36\n0.00\nCarrasco, Oscar",
      { filename: "July 2026(2).pdf", path: "/Financials/July 2026(2).pdf" },
    );
    expect(ledger.find((item) => item.factType === "special_assessment_collected")).toBeUndefined();

    const cashAccount = extractCandidatesFromText(
      "Cash in Bank - Assessment\n43,666.00\nWillows Assessment\n19,909.49\n44.12\n66,997.86",
      { filename: "July 2026(2).pdf", path: "/Financials/July 2026(2).pdf" },
    );
    expect(
      cashAccount.find((item) => item.factType === "special_assessment_collected")?.numericValue,
    ).toBe("19909.49");

    const gl = extractCandidatesFromText(
      "Assessment\n-16,796.69\nNet Change\n0.00\n16,796.69",
      { filename: "Willows Financials April 2025.pdf", path: "/Financials/April 2025.pdf" },
    );
    expect(gl.find((item) => item.factType === "special_assessment_collected")).toBeUndefined();
  });

  it("does not treat a financial-report total as an invoice", () => {
    const found = extractCandidatesFromText("General ledger\nTotal\n131,932.97\n", {
      filename: "Willows Financials April 2025.pdf",
      path: "/Financials/Willows Financials April 2025.pdf",
    });
    expect(found.find((item) => item.factType === "invoice_amount")).toBeUndefined();
  });

  it("reads vendor amount labels that are not written as amount due", () => {
    const shipley = extractCandidatesFromText(
      "PRIOR BALANCE 1,892.00\nTHE WILLOWSAMOUNT1,507.00\nPAYMENT RECEIVED <1,892.00>",
      { filename: "willows aug 26.pdf", path: "/Bills/Shipley/willows aug 26.pdf" },
    );
    expect(shipley.find((item) => item.factType === "invoice_amount")?.numericValue).toBe(
      "1507.00",
    );

    const pleasePay = extractCandidatesFromText("Invoice 1981\nPLEASE PAY $1,370.00\nTOTAL DUE $1,370.00", {
      filename: "Shipley Willows Feb 2026.pdf",
      path: "/Bills/Shipley",
    });
    expect(pleasePay.find((item) => item.factType === "invoice_amount")?.numericValue).toBe(
      "1370.00",
    );

    const webb = extractCandidatesFromText("InvoiceTotal: 3,250.00\nInvoice Balance 0.00 3,250.00", {
      filename: "Invoice 18470.PDF",
      path: "/Bills/July 2026",
    });
    expect(webb.find((item) => item.factType === "invoice_amount")?.numericValue).toBe("3250.00");

    const spectrum = extractCandidatesFromText(
      "Previous Balance $187.85\nPayment -187.85\nRemaining previous $0.00\nTotal Due By Oct 21, 2026 $186.73",
      { filename: "Spectrum Office Bill Oct 2026", path: "/Bills/October 2026" },
    );
    expect(spectrum.find((item) => item.factType === "invoice_amount")?.numericValue).toBe(
      "186.73",
    );
  });

  it("does not invent historical figures that are not in the document", () => {
    const found = extractCandidatesFromText("Board agenda with no amounts.", {
      filename: "minutes.pdf",
      path: "/Minutes",
    });
    expect(found.map((item) => item.numericValue)).not.toContain("50184.00");
    expect(found.filter((item) => item.kind === "fact")).toEqual([]);
  });

  it("treats the same metric, period, and amount as one fact", () => {
    const text = `
      September 2026
      Cash balance $50,184.00
    `;
    const once = extractCandidatesFromText(text, {
      filename: "Sep-2026-financials.pdf",
      path: "/Financials",
    });
    const again = extractCandidatesFromText(text, {
      filename: "Sep-2026-financials.pdf",
      path: "/Financials",
    });
    const cash = once.find((item) => item.factType === "cash_balance");
    expect(cash).toBeTruthy();
    expect(isSameFinancialMetric(cash!, again.find((item) => item.factType === "cash_balance")!)).toBe(
      true,
    );
    expect(uniqueFinancialMetrics([...once, ...again]).filter((item) => item.factType === "cash_balance")).toHaveLength(
      1,
    );
  });

  it("extracts csv transaction candidates", () => {
    const csv = `date,description,amount
2026-09-07,Kaiser Law payment,-4850.00
2026-09-08,Owner dues,250.00`;
    const c = extractCandidatesFromText(csv, {
      filename: "bank.csv",
      path: "/Bank",
    });
    expect(c.filter((x) => x.kind === "transaction").length).toBeGreaterThanOrEqual(
      2,
    );
  });
});
