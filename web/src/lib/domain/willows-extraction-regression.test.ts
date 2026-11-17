import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  classifyDriveDocument,
  extractCandidatesFromText,
  isLooseRepairGuess,
} from "./drive-classify";
import { extractPdfText, textForExtraction } from "./extract-text";
import { conflictingFactIds } from "./fact-review";

/**
 * Regression coverage for the Willows Drive documents that previously showed
 * wrong Fact Review values. Fixtures are representative of those files.
 * Historical totals are only asserted when they appear in the fixture text —
 * they are not filled in from memory.
 */

function amount(facts: ReturnType<typeof extractCandidatesFromText>, factType: string) {
  return facts.find((fact) => fact.factType === factType)?.numericValue;
}

function pdfStream(content: string): Buffer {
  const body = deflateSync(Buffer.from(content));
  return Buffer.concat([
    Buffer.from("<< /Filter /FlateDecode /Length 1 >>\nstream\n"),
    body,
    Buffer.from("\nendstream"),
  ]);
}

function glyphPdf(phrase: string, decoyRect = "474.24"): Buffer {
  const pairs = [...phrase].map((char, index) => {
    const code = (index + 1).toString(16).padStart(4, "0");
    const dest = char.charCodeAt(0).toString(16).padStart(4, "0");
    return { code, dest };
  });
  const cmap = `beginbfchar\n${pairs
    .map((pair) => `<${pair.code}> <${pair.dest}>`)
    .join("\n")}\nendbfchar\n`;
  const hex = pairs.map((pair) => pair.code).join("");
  const content = `BT /F1 12 Tf <${hex}> Tj ET\n1 0 0 1 ${decoyRect} 321.68 Tm\n`;
  return Buffer.from(
    `%PDF-1.4
1 0 obj
<< /Type /Font /ToUnicode 2 0 R >>
endobj
2 0 obj
<< /Length ${cmap.length} >>
stream
${cmap}
endstream
endobj
3 0 obj
<< /Length ${content.length} >>
stream
${content}
endstream
endobj
4 0 obj
<< /Resources << /Font << /F1 1 0 R >> >> >>
endobj
`,
    "latin1",
  );
}

describe("Willows extraction regression", () => {
  it("classifies Drive financials and roof bills so sync will reread them", () => {
    expect(
      classifyDriveDocument({
        name: "Willows Financials Sep 2026.pdf",
        path: "/Willows Condos Records/Financials/Willows Financials Sep 2026.pdf",
      }),
    ).toMatchObject({ category: "financial_statement", label: "Financial Statements" });

    expect(
      classifyDriveDocument({
        name: "Roof repair 1904 c205.pdf",
        path: "/Willows Condos Records/Monthly Bills and Receipts/By Month/September 2026/Roof repair 1904 c205.pdf",
      }),
    ).toMatchObject({ category: "invoice", label: "Construction / Repair" });
  });

  it("reads Amount Due from a Fricker-style glyph invoice and ignores 474.24", () => {
    const cases = [
      { name: "Roof repair 1904 c205.pdf", due: "1850.00", billed: "08/22/2026" },
      { name: "Roof repair 6663.pdf", due: "2110.00", billed: "08/22/2026" },
      { name: "Roof repair 1730.pdf", due: "2425.00", billed: "09/14/2026" },
    ];
    for (const item of cases) {
      const pretty = Number(item.due).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const phrase = `Billed on: ${item.billed} Amount Due $${pretty}`;
      const pdf = glyphPdf(phrase);
      const text = textForExtraction(pdf, "application/pdf", item.name);
      expect(text).toMatch(/Amount Due/);
      expect(text).not.toMatch(/474\.24/);
      expect(extractPdfText(pdf)).not.toMatch(/474\.24/);
      const facts = extractCandidatesFromText(text, {
        filename: item.name,
        path: `/Willows Condos Records/Monthly Bills and Receipts/By Month/September 2026/${item.name}`,
      });
      expect(amount(facts, "invoice_amount")).toBe(item.due);
      expect(facts.map((fact) => fact.numericValue)).not.toContain("474.24");
      expect(facts.find((fact) => fact.factType === "capital_expenditure")).toBeUndefined();
      expect(facts.find((fact) => fact.factType === "invoice_amount")?.asOfDate).toBe(
        `${item.billed.slice(6)}-${item.billed.slice(0, 2)}-${item.billed.slice(3, 5)}`,
      );
    }
  });

  it("reads vendor and utility amount labels used on Willows bills", () => {
    const webb = extractCandidatesFromText("InvoiceTotal: 3,250.00\nInvoice Balance 0.00 3,250.00", {
      filename: "Invoice 18470.PDF",
      path: "/Willows Condos Records/Monthly Bills and Receipts/By Month/July 2026/Invoice 18470.PDF",
    });
    expect(amount(webb, "invoice_amount")).toBe("3250.00");

    const shipley = extractCandidatesFromText(
      "Invoice 1981\nPLEASE PAY $1,370.00\nTOTAL DUE $1,370.00",
      {
        filename: "Shipley Willows Feb 2026.pdf",
        path: "/Willows Condos Records/Monthly Bills and Receipts/By Company/Shipley/Shipley Willows Feb 2026.pdf",
      },
    );
    expect(amount(shipley, "invoice_amount")).toBe("1370.00");

    const spectrum = extractCandidatesFromText(
      "Previous Balance $187.85\nPayment -187.85\nTotal Due By Oct 21, 2026 $186.73",
      {
        filename: "Spectrum Office Bill Oct 2026",
        path: "/Willows Condos Records/Monthly Bills and Receipts/By Month/October 2026/Spectrum Office Bill Oct 2026",
      },
    );
    expect(amount(spectrum, "invoice_amount")).toBe("186.73");
  });

  it("reads the selected-month column on a cash-basis Willows statement", () => {
    const text = `
      Page 1
      September 2026
      HOA Dues 51,688.10 76.53 277,186.12
      Assessment 2,054.75 3.04 12,100.00
      Willows Assessment 21,282.55 31.49 106,253.64
      Total Expense 60,298.70 89.28 380,727.29
      NOI - Net Operating Income 7,241.90 10.72 -73,479.77
      Cash in Bank 40,514.73
      Cash in Bank - Reserve 0.03
      Cash in Bank - Assessment 9,669.24
      Total Liabilities
      Capital Bank Transfer -20.00
    `;
    const facts = extractCandidatesFromText(text, {
      filename: "Willows Financials Sep 2026.pdf",
      path: "/Willows Condos Records/Financials/Willows Financials Sep 2026.pdf",
    });
    expect(amount(facts, "monthly_dues_collected")).toBe("51688.10");
    expect(amount(facts, "operating_expenses")).toBe("60298.70");
    expect(amount(facts, "special_assessment_collected")).toBe("21282.55");
    expect(amount(facts, "net_income")).toBe("7241.90");
    expect(amount(facts, "cash_balance")).toBe("40514.73");
    expect(amount(facts, "reserve_balance")).toBe("0.03");
    expect(facts.map((fact) => fact.numericValue)).not.toContain("20.00");
    expect(facts.map((fact) => fact.numericValue)).not.toContain("2054.75");
    expect(facts.map((fact) => fact.numericValue)).not.toContain("9669.24");
  });

  it("keeps the minus sign on August net operating income", () => {
    const text = `
      August 2026
      HOA Dues 41,295.38 80.00 225,498.02
      Willows Assessment 17,973.37 34.00 85,000.00
      Total Expense 108,473.08 210.00 320,428.59
      NOI - Net Operating Income -61,907.77 -120.00 -80,721.67
      Cash in Bank 12,019.19
      Cash in Bank - Reserve 100.09
    `;
    const facts = extractCandidatesFromText(text, {
      filename: "Willows Financials Aug 2026.pdf",
      path: "/Willows Condos Records/Financials/Willows Financials Aug 2026.pdf",
    });
    expect(amount(facts, "monthly_dues_collected")).toBe("41295.38");
    expect(amount(facts, "operating_expenses")).toBe("108473.08");
    expect(amount(facts, "net_income")).toBe("-61907.77");
    expect(amount(facts, "cash_balance")).toBe("12019.19");
    expect(amount(facts, "reserve_balance")).toBe("100.09");
  });

  it("does not flag separate undated invoices as the same-period conflict from Fact Review", () => {
    expect(
      isLooseRepairGuess({
        label: "Capital / repair mention",
        verificationStatus: "needs_review",
      }),
    ).toBe(true);
    expect(
      isLooseRepairGuess({
        label: "Capital / repair mention",
        verificationStatus: "verified",
      }),
    ).toBe(false);

    const ids = conflictingFactIds([
      {
        id: "gl",
        documentId: "doc-gl",
        factType: "capital_expenditure",
        numericValue: "6310.00",
        periodStart: null,
        periodEnd: null,
        asOfDate: null,
        verificationStatus: "verified",
      },
      {
        id: "roof-1904",
        documentId: "doc-1904",
        factType: "capital_expenditure",
        numericValue: "1850.00",
        periodStart: null,
        periodEnd: null,
        asOfDate: null,
        verificationStatus: "verified",
      },
      {
        id: "roof-6663",
        documentId: "doc-6663",
        factType: "capital_expenditure",
        numericValue: "474.24",
        periodStart: null,
        periodEnd: null,
        asOfDate: null,
        verificationStatus: "needs_review",
      },
      {
        id: "roof-1802",
        documentId: "doc-1802",
        factType: "capital_expenditure",
        numericValue: "474.24",
        periodStart: null,
        periodEnd: null,
        asOfDate: null,
        verificationStatus: "needs_review",
      },
    ]);
    expect(ids.size).toBe(0);
  });

  it("still conflicts when the same dated metric has two different amounts", () => {
    const ids = conflictingFactIds([
      {
        id: "dues-a",
        documentId: "doc-a",
        factType: "monthly_dues_collected",
        numericValue: "51688.10",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        asOfDate: "2026-09-30",
        verificationStatus: "needs_review",
      },
      {
        id: "dues-b",
        documentId: "doc-b",
        factType: "monthly_dues_collected",
        numericValue: "41295.38",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        asOfDate: "2026-09-30",
        verificationStatus: "needs_review",
      },
    ]);
    expect(ids.has("dues-a")).toBe(true);
    expect(ids.has("dues-b")).toBe(true);
  });

  it("does not invent an amount from a Pay-button rectangle alone", () => {
    const bytes = pdfStream("BT 1 0 0 1 474.24 321.68 Tm (Roof repair) Tj ET");
    const text = textForExtraction(bytes, "application/pdf", "Roof repair 1904 c205.pdf");
    const facts = extractCandidatesFromText(text, {
      filename: "Roof repair 1904 c205.pdf",
      path: "/Willows Condos Records/Monthly Bills and Receipts/By Month/September 2026/Roof repair 1904 c205.pdf",
    });
    expect(facts.map((fact) => fact.numericValue)).not.toContain("474.24");
    expect(amount(facts, "invoice_amount")).toBeUndefined();
  });
});
