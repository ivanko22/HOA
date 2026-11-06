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
    /financial statement|income statement|balance sheet|p&l|profit and loss|operating statement|treasurer report|assessment|monthly financial/.test(
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
  /** ISO currency code. Financial metrics extracted here are USD. */
  unit?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  asOfDate?: string | null;
  sourceExcerpt?: string | null;
  sourcePage?: string | null;
  /** 0–1. Heuristic only. Never 1, and never a reason to skip review. */
  confidence?: string | null;
  rawValue?: string | null;
};

/** Extracted facts always wait for a person. Sync must not mark them verified. */
export function reviewStatusForExtractedFact(): "needs_review" {
  return "needs_review";
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function monthPeriod(year: number, month: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  const dd = String(last).padStart(2, "0");
  return {
    periodStart: `${year}-${mm}-01`,
    periodEnd: `${year}-${mm}-${dd}`,
    asOfDate: `${year}-${mm}-${dd}`,
  };
}

/** Month in a filename or statement heading wins over a bare year. */
export function inferReportingPeriod(text: string): {
  periodStart: string | null;
  periodEnd: string | null;
  asOfDate: string | null;
} {
  const monthName =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b[\s,._-]*(20\d{2})/i.exec(
      text,
    );
  if (monthName) {
    const month = MONTH_INDEX[monthName[1].toLowerCase().slice(0, 3)];
    if (month) return monthPeriod(Number(monthName[2]), month);
  }
  const iso = /\b(20\d{2})[-_/](0?[1-9]|1[0-2])\b/.exec(text);
  if (iso) return monthPeriod(Number(iso[1]), Number(iso[2]));
  const us = /\b(0?[1-9]|1[0-2])[-_/](0?[1-9]|[12]\d|3[01])[-_/](20\d{2})\b/.exec(
    text,
  );
  if (us) return monthPeriod(Number(us[3]), Number(us[1]));
  const year = extractYears(text)[0];
  if (year) {
    return {
      periodStart: `${year}-01-01`,
      periodEnd: `${year}-12-31`,
      asOfDate: `${year}-12-31`,
    };
  }
  return { periodStart: null, periodEnd: null, asOfDate: null };
}

export function isSameFinancialMetric(
  a: Pick<
    ExtractedCandidate,
    "factType" | "label" | "numericValue" | "periodStart" | "periodEnd" | "kind"
  >,
  b: Pick<
    ExtractedCandidate,
    "factType" | "label" | "numericValue" | "periodStart" | "periodEnd" | "kind"
  >,
): boolean {
  if ((a.kind ?? "fact") === "transaction" || (b.kind ?? "fact") === "transaction") {
    return false;
  }
  const typeA = a.factType ?? a.label;
  const typeB = b.factType ?? b.label;
  if (typeA !== typeB) return false;
  if ((a.numericValue ?? null) !== (b.numericValue ?? null)) return false;
  if ((a.periodStart ?? null) !== (b.periodStart ?? null)) return false;
  if ((a.periodEnd ?? null) !== (b.periodEnd ?? null)) return false;
  return true;
}

export function uniqueFinancialMetrics(
  candidates: ExtractedCandidate[],
): ExtractedCandidate[] {
  const kept: ExtractedCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.kind === "transaction") {
      kept.push(candidate);
      continue;
    }
    if (kept.some((existing) => isSameFinancialMetric(existing, candidate))) {
      continue;
    }
    kept.push(candidate);
  }
  return kept;
}

const moneyRe =
  /\$?\s*([\d,]+\.\d{2}|\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})/g;

function parseMoneyToken(raw: string): string | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Number(cleaned).toFixed(2);
}

/**
 * Lightweight heuristic extraction from statement text.
 * Callers persist these as needs_review. Historical figures are only found
 * when that wording is in the document — they are not filled in from memory.
 */
export function extractCandidatesFromText(
  text: string,
  context: { filename: string; path: string },
): ExtractedCandidate[] {
  const out: ExtractedCandidate[] = [];
  const hay = `${context.path}\n${context.filename}\n${text}`;
  const lower = hay.toLowerCase();
  const seen = new Set<string>();

  const patterns: {
    re: RegExp;
    kind: ExtractedCandidate["kind"];
    factType: string;
    label: string;
    confidence: string;
  }[] = [
    {
      re: /cash\s+balance[^$\d]{0,40}(\$?[\d,]+\.\d{2})/i,
      kind: "fact",
      factType: "cash_balance",
      label: "Cash balance",
      confidence: "0.74",
    },
    {
      re: /(?:hoa\s+)?dues[^$\d]{0,40}(\$?[\d,]+\.\d{2})/i,
      kind: "fact",
      factType: "monthly_dues_collected",
      label: "HOA dues",
      confidence: "0.74",
    },
    {
      re: /operating\s+income[^$\d]{0,40}(\$?[\d,]+\.\d{2})/i,
      kind: "fact",
      factType: "operating_income",
      label: "Total operating income",
      confidence: "0.74",
    },
    {
      re: /total\s+income[^$\d]{0,40}(\$?[\d,]+\.\d{2})/i,
      kind: "fact",
      factType: "operating_income",
      label: "Total income",
      confidence: "0.66",
    },
    {
      re: /operating\s+expense[s]?[^$\d]{0,40}(\$?[\d,]+\.\d{2})/i,
      kind: "fact",
      factType: "operating_expenses",
      label: "Total operating expenses",
      confidence: "0.74",
    },
    {
      re: /total\s+expense[s]?[^$\d]{0,40}(\$?[\d,]+\.\d{2})/i,
      kind: "fact",
      factType: "operating_expenses",
      label: "Total expenses",
      confidence: "0.62",
    },
    {
      re: /(?:willows\s+)?assessment[^$\d]{0,40}(\$?[\d,]+\.\d{2})/i,
      kind: "fact",
      factType: "special_assessment_collected",
      label: "Assessment",
      confidence: "0.70",
    },
    {
      re: /total\s+assets[^$\d]{0,40}(\$?[\d,]+\.\d{2})/i,
      kind: "fact",
      factType: "total_assets",
      label: "Total assets",
      confidence: "0.72",
    },
    {
      re: /total\s+liabilit(?:y|ies)[^$\d]{0,40}(\$?[\d,]+\.\d{2})/i,
      kind: "fact",
      factType: "total_liabilities",
      label: "Total liabilities",
      confidence: "0.72",
    },
    {
      re: /net\s+(?:operating\s+)?income[^$\d]{0,40}(\$?[\d,]+\.\d{2})/i,
      kind: "fact",
      factType: "net_income",
      label: "Net income",
      confidence: "0.70",
    },
    {
      re: /accounts?\s+receivable[^$\d]{0,40}(\$?[\d,]+\.\d{2})/i,
      kind: "fact",
      factType: "accounts_receivable",
      label: "Accounts receivable",
      confidence: "0.68",
    },
    {
      re: /reserve\s+balance[^$\d]{0,40}(\$?[\d,]+\.\d{2})/i,
      kind: "fact",
      factType: "reserve_balance",
      label: "Reserve balance",
      confidence: "0.72",
    },
    {
      re: /reserve\s+contribution[^$\d]{0,40}(\$?[\d,]+\.\d{2})/i,
      kind: "fact",
      factType: "reserve_contribution",
      label: "Reserve contribution",
      confidence: "0.66",
    },
    {
      re: /capital\s+need[^$\d]{0,40}(\$?[\d,]+\.?\d*)/i,
      kind: "maintenance_capital",
      factType: "capital_need_estimate",
      label: "Capital need estimate",
      confidence: "0.55",
    },
  ];

  for (const p of patterns) {
    if (seen.has(p.factType)) continue;
    const m = p.re.exec(hay);
    if (!m) continue;
    const numeric = parseMoneyToken(m[1]);
    if (!numeric) continue;
    seen.add(p.factType);
    const excerpt = m[0].slice(0, 240);
    const at = hay.indexOf(m[0]);
    const around = hay.slice(Math.max(0, at - 160), at + excerpt.length);
    const page = /Page\s+(\d+)/i.exec(around);
    const period = inferReportingPeriod(`${context.filename}\n${context.path}\n${around}`);
    out.push({
      kind: p.kind,
      factType: p.factType,
      label: p.label,
      numericValue: numeric,
      unit: "USD",
      asOfDate: period.asOfDate,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      sourceExcerpt: excerpt,
      sourcePage: page?.[1] ?? null,
      confidence: p.confidence,
      rawValue: m[1],
    });
  }

  if (
    !seen.has("capital_expenditure") &&
    /roof|stair|balcon/.test(lower) &&
    /capital|repair|replace/.test(lower)
  ) {
    moneyRe.lastIndex = 0;
    const money = [...hay.matchAll(moneyRe)]
      .map((m) => parseMoneyToken(m[1]))
      .filter(Boolean)[0];
    const period = inferReportingPeriod(`${context.filename}\n${context.path}`);
    out.push({
      kind: "maintenance_capital",
      factType: "capital_expenditure",
      label: "Capital / repair mention",
      numericValue: money ?? null,
      unit: money ? "USD" : null,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      asOfDate: period.asOfDate,
      sourceExcerpt: context.filename,
      confidence: "0.45",
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
      confidence: "0.50",
      rawValue: amountCol,
    });
  }

  return uniqueFinancialMetrics(out);
}
