import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractCandidatesFromText, isSameFinancialMetric } from "./drive-classify";
import { extractPdfText, textForExtraction } from "./extract-text";

/**
 * Simulated validation. The statement below is built in this test.
 * It is not a file from the Willows Google Drive, and this test does not
 * call Google Drive, Netlify, or the production database.
 */
const STATEMENT = `
Page 1
September 2026 balance sheet and income statement
Cash balance $12,345.67
HOA dues $8,100.00
Total operating income $9,400.50
Total operating expenses $7,200.25
Assessment $1,500.00
Reserve balance $40,000.00
Net income $2,200.25
`;

function pdfWith(text: string) {
  const content = Buffer.from(`BT (${text}) Tj ET`);
  const compressed = deflateSync(content);
  return Buffer.concat([
    Buffer.from("<< /Filter /FlateDecode /Length 1 >>\nstream\n"),
    compressed,
    Buffer.from("\nendstream"),
  ]);
}

describe("simulated Willows statement extraction", () => {
  it("reads a representative stored statement without using hardcoded totals", () => {
    const source = readFileSync(new URL("./drive-classify.ts", import.meta.url), "utf8");
    expect(source).not.toContain("12345.67");
    expect(source).not.toContain("50184.00");

    const stored = pdfWith(STATEMENT.replace(/\n/g, " "));
    const text = textForExtraction(stored, "application/pdf", "September-2026-financial-statement.pdf");
    expect(extractPdfText(stored)).toMatch(/Cash balance/);
    const facts = extractCandidatesFromText(text, {
      filename: "September-2026-financial-statement.pdf",
      path: "/Willows/Financials/September-2026-financial-statement.pdf",
    });

    expect(facts.find((fact) => fact.factType === "cash_balance")).toMatchObject({
      numericValue: "12345.67",
      unit: "USD",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      sourcePage: "1",
    });
    expect(facts.find((fact) => fact.factType === "monthly_dues_collected")?.numericValue).toBe(
      "8100.00",
    );
    expect(facts.find((fact) => fact.factType === "operating_income")?.numericValue).toBe(
      "9400.50",
    );
    expect(facts.find((fact) => fact.factType === "operating_expenses")?.numericValue).toBe(
      "7200.25",
    );
    expect(
      facts.find((fact) => fact.factType === "special_assessment_collected")?.numericValue,
    ).toBe("1500.00");
    expect(facts.find((fact) => fact.factType === "reserve_balance")?.numericValue).toBe(
      "40000.00",
    );
    expect(facts.find((fact) => fact.factType === "net_income")?.numericValue).toBe("2200.25");
    expect(facts.every((fact) => Number(fact.confidence) < 1)).toBe(true);

    const again = extractCandidatesFromText(text, {
      filename: "September-2026-financial-statement.pdf",
      path: "/Willows/Financials/September-2026-financial-statement.pdf",
    });
    const cash = facts.find((fact) => fact.factType === "cash_balance")!;
    expect(
      isSameFinancialMetric(cash, again.find((fact) => fact.factType === "cash_balance")!),
    ).toBe(true);
  });

  it("does not parse a meeting recording stored beside the statement", () => {
    const recording = Buffer.from("%PDF-1.4 cash balance $12,345.67");
    expect(
      textForExtraction(recording, "audio/mp4", "September 2026 board meeting.m4a"),
    ).toBe("");
    expect(
      extractCandidatesFromText("", {
        filename: "September 2026 board meeting.m4a",
        path: "/Minutes/Recordings",
      }).filter((fact) => fact.kind === "fact"),
    ).toEqual([]);
  });
});
