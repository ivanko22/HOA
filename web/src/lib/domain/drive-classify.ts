import type { DocumentCategory } from "./enums";

export const driveClassificationLabels = [
  "Meeting Minutes",
  "Financial Statements",
  "General Ledger",
  "Legal Invoices",
  "Insurance",
  "Contracts",
  "Construction / Repair",
  "Inspection",
  "Governance",
  "Other",
] as const;

export type DriveClassificationLabel =
  (typeof driveClassificationLabels)[number];

export function classifyDriveDocument(input: {
  name: string;
  path: string;
  mimeType?: string | null;
}): { label: DriveClassificationLabel; category: DocumentCategory } {
  const hay = `${input.path} ${input.name}`.toLowerCase();

  if (/minute|board meeting|hoa meeting|agm/.test(hay)) {
    return { label: "Meeting Minutes", category: "meeting_minutes" };
  }
  if (/general ledger|\bgl\b|trial balance|chart of accounts/.test(hay)) {
    return { label: "General Ledger", category: "financial_statement" };
  }
  if (
    /financial statement|income statement|balance sheet|p&l|profit and loss|operating statement|treasurer report/.test(
      hay,
    )
  ) {
    return { label: "Financial Statements", category: "financial_statement" };
  }
  if (/invoice|legal fee|attorney|counsel|kaiser law/.test(hay)) {
    return {
      label: /legal|attorney|counsel|kaiser/.test(hay)
        ? "Legal Invoices"
        : "Legal Invoices",
      category: /legal|attorney|counsel|kaiser/.test(hay) ? "legal" : "invoice",
    };
  }
  if (/insurance|policy|certificate of insurance|\bcoi\b/.test(hay)) {
    return { label: "Insurance", category: "insurance" };
  }
  if (/contract|agreement|vendor agreement|management agreement/.test(hay)) {
    return { label: "Contracts", category: "contract" };
  }
  if (
    /inspection|reserve study|engineer report|condition assessment/.test(hay)
  ) {
    return { label: "Inspection", category: "inspection" };
  }
  if (
    /roof|stair|balcony|construction|repair|capital project|bid|proposal|quote/.test(
      hay,
    )
  ) {
    return {
      label: "Construction / Repair",
      category: /quote|bid|proposal/.test(hay) ? "quote" : "other",
    };
  }
  if (
    /bylaw|covenant|declaration|governance|rules|resolution|article/.test(hay)
  ) {
    return { label: "Governance", category: "other" };
  }
  if (/bank statement|\bstatement\b.*bank/.test(hay)) {
    return { label: "Financial Statements", category: "bank_statement" };
  }
  return { label: "Other", category: "other" };
}

/** Extract year hints from path/name for minutes availability checks. */
export function extractYears(text: string): number[] {
  const years = new Set<number>();
  for (const m of text.matchAll(/\b(20\d{2})\b/g)) {
    const y = Number(m[1]);
    if (y >= 2000 && y <= 2100) years.add(y);
  }
  return [...years].sort();
}

export type ExtractedCandidate = {
  kind: "fact" | "transaction" | "maintenance_capital";
  factType?: string;
  label: string;
  numericValue?: string | null;
  unit?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  asOfDate?: string | null;
  sourceExcerpt?: string | null;
  rawValue?: string | null;
};

const moneyRe =
  /\$?\s*([\d,]+\.\d{2}|\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})/g;

function parseMoneyToken(raw: string): string | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Number(cleaned).toFixed(2);
}

/**
 * Lightweight heuristic extraction from text (CSV / exported docs / filenames).
 * All outputs are candidates only — callers must persist as needs_review.
 */
export function extractCandidatesFromText(
  text: string,
  context: { filename: string; path: string },
): ExtractedCandidate[] {
  const out: ExtractedCandidate[] = [];
  const hay = `${context.path}\n${context.filename}\n${text}`;
  const lower = hay.toLowerCase();

  const patterns: {
    re: RegExp;
    kind: ExtractedCandidate["kind"];
    factType: string;
    label: string;
  }[] = [
    {
      re: /cash\s+balance[^$\d]{0,40}(\$?[\d,]+\.\d{2})/i,
      kind: "fact",
      factType: "cash_balance",
      label: "Cash balance",
    },
    {
      re: /(?:hoa\s+)?dues[^$\d]{0,40}(\$?[\d,]+\.\d{2})/i,
      kind: "fact",
      factType: "monthly_dues_collected",
      label: "HOA dues",
    },
    {
      re: /operating\s+income[^$\d]{0,40}(\$?[\d,]+\.\d{2})/i,
      kind: "fact",
      factType: "operating_income",
      label: "Total operating income",
    },
    {
      re: /operating\s+expense[s]?[^$\d]{0,40}(\$?[\d,]+\.\d{2})/i,
      kind: "fact",
      factType: "operating_expenses",
      label: "Total operating expenses",
    },
    {
      re: /(?:willows\s+)?assessment[^$\d]{0,40}(\$?[\d,]+\.\d{2})/i,
      kind: "fact",
      factType: "special_assessment_collected",
      label: "Willows Assessment",
    },
    {
      re: /reserve\s+balance[^$\d]{0,40}(\$?[\d,]+\.\d{2})/i,
      kind: "fact",
      factType: "reserve_balance",
      label: "Reserve balance",
    },
    {
      re: /capital\s+need[^$\d]{0,40}(\$?[\d,]+\.?\d*)/i,
      kind: "maintenance_capital",
      factType: "capital_need_estimate",
      label: "Capital need estimate",
    },
  ];

  for (const p of patterns) {
    const m = p.re.exec(hay);
    if (!m) continue;
    const numeric = parseMoneyToken(m[1]);
    if (!numeric) continue;
    const years = extractYears(context.filename + " " + (m[0] ?? ""));
    const year = years[0] ?? null;
    out.push({
      kind: p.kind,
      factType: p.factType,
      label: p.label,
      numericValue: numeric,
      unit: "USD",
      asOfDate: year ? `${year}-12-31` : null,
      periodStart: year ? `${year}-01-01` : null,
      periodEnd: year ? `${year}-12-31` : null,
      sourceExcerpt: m[0].slice(0, 240),
      rawValue: m[1],
    });
  }

  if (/roof|stair|balcon/.test(lower) && /capital|repair|replace/.test(lower)) {
    const money = [...hay.matchAll(moneyRe)]
      .map((m) => parseMoneyToken(m[1]))
      .filter(Boolean)[0];
    out.push({
      kind: "maintenance_capital",
      factType: "capital_expenditure",
      label: "Capital / repair mention",
      numericValue: money ?? null,
      unit: money ? "USD" : null,
      sourceExcerpt: context.filename,
      rawValue: money,
    });
  }

  // CSV-ish transaction rows: date, description, amount
  for (const line of text.split(/\r?\n/).slice(0, 500)) {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 3) continue;
    const date = cols.find((c) => /^\d{4}-\d{2}-\d{2}$/.test(c) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(c));
    const amountCol = cols.find((c) => /^-?\$?[\d,]+\.\d{2}$/.test(c));
    if (!date || !amountCol) continue;
    const amount = parseMoneyToken(amountCol.replace(/^-/, ""));
    if (!amount) continue;
    const description =
      cols.find((c) => c !== date && c !== amountCol && c.length > 2) ??
      "Imported line";
    out.push({
      kind: "transaction",
      label: description.slice(0, 200),
      numericValue: amount,
      unit: "USD",
      asOfDate: date.includes("/")
        ? (() => {
            const [a, b, c] = date.split("/");
            return `${c}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
          })()
        : date,
      sourceExcerpt: line.slice(0, 240),
      rawValue: amountCol,
    });
  }

  return out;
}
