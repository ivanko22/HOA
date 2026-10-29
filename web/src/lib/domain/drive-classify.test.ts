import { describe, expect, it } from "vitest";
import {
  classifyDriveDocument,
  extractCandidatesFromText,
  extractYears,
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
    expect(c.some((x) => x.factType === "cash_balance")).toBe(true);
    expect(c.some((x) => x.factType === "monthly_dues_collected")).toBe(true);
    expect(c.every((x) => x.numericValue != null)).toBe(true);
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
