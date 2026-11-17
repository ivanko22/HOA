import { describe, expect, it } from "vitest";
import {
  amountSearchVariants,
  locateEvidenceInDocumentText,
  moneyValuesEqual,
  normalizeMoneyToken,
  previewCacheKey,
  selectEvidencePage,
} from "./visual-verification";

const SEP_STATEMENT = `
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
`;

describe("visual verification", () => {
  it("normalizes currency, commas, minus signs, and parentheses", () => {
    expect(normalizeMoneyToken("$1,850.00")).toBe("1850.00");
    expect(normalizeMoneyToken("-61,907.77")).toBe("-61907.77");
    expect(normalizeMoneyToken("($700.00)")).toBe("-700.00");
    expect(normalizeMoneyToken("not-money")).toBeNull();
    expect(moneyValuesEqual("1850.00", "1850.00")).toBe(true);
    expect(moneyValuesEqual("1850.00", "474.24")).toBe(false);
  });

  it("matches labeled September statement amounts independently of extraction", () => {
    const dues = locateEvidenceInDocumentText(SEP_STATEMENT, {
      factType: "monthly_dues_collected",
      label: "HOA dues",
      numericValue: "51688.10",
    });
    expect(dues.status).toBe("visual_match");
    expect(dues.foundValue).toBe("51688.10");
    expect(dues.excerpt).toMatch(/HOA Dues/i);

    const assessment = locateEvidenceInDocumentText(SEP_STATEMENT, {
      factType: "special_assessment_collected",
      label: "Willows assessment",
      numericValue: "21282.55",
    });
    expect(assessment.status).toBe("visual_match");
    expect(assessment.foundValue).toBe("21282.55");

    const expenses = locateEvidenceInDocumentText(SEP_STATEMENT, {
      factType: "operating_expenses",
      label: "Total expenses",
      numericValue: "60298.70",
    });
    expect(expenses.status).toBe("visual_match");

    const cash = locateEvidenceInDocumentText(SEP_STATEMENT, {
      factType: "cash_balance",
      label: "Cash in bank",
      numericValue: "40514.73",
    });
    expect(cash.status).toBe("visual_match");
    expect(cash.foundValue).not.toBe("9669.24");
  });

  it("detects a deliberate mismatch against the document", () => {
    const hit = locateEvidenceInDocumentText(SEP_STATEMENT, {
      factType: "monthly_dues_collected",
      label: "HOA dues",
      numericValue: "474.24",
    });
    expect(hit.status).toBe("mismatch");
    expect(hit.foundValue).toBe("51688.10");
    expect(hit.reason).toMatch(/not 474\.24/);
  });

  it("matches invoice amount due and rejects an unlabeled coordinate", () => {
    const text = `
      Billed on: 08/22/2026
      Amount Due: $1,850.00
      Amount Paid $0.00
    `;
    const match = locateEvidenceInDocumentText(text, {
      factType: "invoice_amount",
      label: "Amount due",
      numericValue: "1850.00",
    });
    expect(match.status).toBe("visual_match");

    const spectrum = locateEvidenceInDocumentText(
      "Total Due By Oct 21, 20 26 $186.73 Previous Balance $186.73",
      {
        factType: "invoice_amount",
        label: "Amount due",
        numericValue: "186.73",
      },
    );
    expect(spectrum.status).toBe("visual_match");
    expect(spectrum.foundValue).toBe("186.73");

    const wrong = locateEvidenceInDocumentText("Rect[474.24 321.68] Roof repair", {
      factType: "invoice_amount",
      label: "Amount due",
      numericValue: "474.24",
    });
    expect(["unable", "ambiguous"]).toContain(wrong.status);
  });

  it("flags duplicate unlabeled amounts as ambiguous", () => {
    const text = "Payment 1,000.00 refund 1,000.00";
    const hit = locateEvidenceInDocumentText(text, {
      factType: "other",
      label: "Other",
      numericValue: "1000.00",
    });
    expect(hit.status).toBe("ambiguous");
  });

  it("builds tenant-scoped preview cache keys and page selection", () => {
    expect(
      previewCacheKey({
        communityId: "c1",
        documentId: "d1",
        contentHash: "abc",
        page: 2,
        kind: "thumb",
      }),
    ).toBe("c1/preview/d1/abc/thumb-p2.png");
    expect(selectEvidencePage({ preferredPage: "3", locatedPage: 1 })).toBe(3);
    expect(selectEvidencePage({ preferredPage: null, locatedPage: 4 })).toBe(4);
    expect(amountSearchVariants("-700.00")).toContain("($700.00)");
  });
});
