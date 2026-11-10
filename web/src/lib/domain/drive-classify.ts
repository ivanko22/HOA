import type { DocumentCategory } from "./enums";

export const driveClassificationLabels = [
  "Meeting Minutes",
  "Financial Statements",
  "General Ledger",
  "Legal Invoices",
  "Insurance",
  "Contracts",
  "Construction / Repair",
  "Invoices",
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
  if (/invoice|legal fee|attorney|counsel|kaiser law|\bbills\b|\breceipts?\b/.test(hay)) {
    if (/legal|attorney|counsel|kaiser/.test(hay)) {
      return { label: "Legal Invoices", category: "legal" };
    }
    if (/roof|stair|balcony|construction|repair|replace/.test(hay)) {
      return { label: "Construction / Repair", category: "invoice" };
    }
    return { label: "Invoices", category: "invoice" };
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

function parseMoneyToken(raw: string): string | null {
  const negative = /^\s*-/.test(raw);
  const cleaned = raw.replace(/[$,\s-]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned).toFixed(2);
  return negative ? `-${value}` : value;
}

/**
 * A repair fact created by taking the first number in the file.
 * PDF coordinates such as 474.24 were stored this way.
 */
export function isLooseRepairGuess(fact: {
  label: string | null;
  verificationStatus: string;
}): boolean {
  return (
    fact.verificationStatus === "needs_review" &&
    fact.label === "Capital / repair mention"
  );
}

const INVOICE_AMOUNT_PATTERNS: { re: RegExp; label: string; bare?: boolean }[] = [
  { re: /amount\s+due[^$\d]{0,80}(\$?\s*[\d,]+\.\d{2})/gi, label: "Amount due" },
  { re: /balance\s+due[^$\d]{0,80}(\$?\s*[\d,]+\.\d{2})/gi, label: "Amount due" },
  { re: /please\s+pay\s+(\$?\s*[\d,]+\.\d{2})/gi, label: "Amount due" },
  {
    re: /invoice\s*total\s*:?\s*(\$?\s*[\d,]+\.\d{2})/gi,
    label: "Invoice total",
  },
  {
    re: /(?:invoice|grand)\s+total[^$\d]{0,80}(\$?\s*[\d,]+\.\d{2})/gi,
    label: "Invoice total",
  },
  {
    re: /total\s+due(?:\s+by)?[\s\S]{0,40}?(\$\s?[\d,]+\.\d{2})/gi,
    label: "Amount due",
  },
  {
    re: /(?:^|[\n\r])\s*total\s*[:\-]?\s*(\$?\s*[\d,]+\.\d{2})/gi,
    label: "Invoice total",
    bare: true,
  },
  { re: /amount\s*(\$?\s*[\d,]+\.\d{2})/gi, label: "Amount due", bare: true },
];

function labeledInvoiceAmount(text: string, allowBareTotal: boolean): {
  numericValue: string;
  label: string;
  excerpt: string;
} | null {
  for (const pattern of INVOICE_AMOUNT_PATTERNS) {
    if (pattern.bare && !allowBareTotal) continue;
    pattern.re.lastIndex = 0;
    const matches = [...text.matchAll(pattern.re)];
    const parsed = matches
      .map((match) => {
        const numericValue = parseMoneyToken(match[1] ?? "");
        return numericValue
          ? { numericValue, excerpt: match[0].replace(/\s+/g, " ").trim().slice(0, 240) }
          : null;
      })
      .filter((row): row is { numericValue: string; excerpt: string } => row != null);
    const chosen = [...parsed].reverse().find((row) => row.numericValue !== "0.00");
    if (chosen) {
      return { ...chosen, label: pattern.label };
    }
  }
  return null;
}

function readMoney(
  source: string,
): { raw: string; numeric: string; rest: string } | null {
  const match = /^[\s:]*(-?\$?\s*-?[\d,]+\.\d{2})/.exec(source);
  if (!match) return null;
  const numeric = parseMoneyToken(match[1]);
  if (!numeric) return null;
  return { raw: match[1], numeric, rest: source.slice(match[0].length) };
}

function readPercent(source: string): { raw: string; rest: string } | null {
  const match = /^[\s:]+(-?\d{1,3}\.\d{2})(?![\d,])/.exec(source);
  if (!match) return null;
  return { raw: match[1], rest: source.slice(match[0].length) };
}

/**
 * The selected month is the first amount after the label.
 * On these statements the next token is a percent and the one after that is
 * year-to-date. A row of dollar amounts is a multi-month grid, so it is skipped.
 * A single amount, as in "HOA dues $51,688.10", is still accepted.
 */
function statementAmount(
  text: string,
  label: RegExp,
): { numeric: string; excerpt: string; index: number } | null {
  const flags = label.flags.includes("g") ? label.flags : `${label.flags}g`;
  const re = new RegExp(label.source, flags);
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    const rest = text.slice(start + match[0].length);
    const month = readMoney(rest);
    if (!month) continue;
    if (/^\s*(starting balance|net change)/i.test(month.rest)) continue;
    const percent = readPercent(month.rest);
    if (percent) {
      const ytd = readMoney(percent.rest);
      if (!ytd) continue;
      if (month.numeric === "0.00" && percent.raw === "0.00") continue;
      // An owner ledger repeats the same charge. A statement percent does not.
      if (Number(percent.raw) === Number(month.numeric)) continue;
      // Report totals use a thousands separator. Owner charges such as 155.48 do not.
      if (!month.raw.includes(",") && !ytd.raw.includes(",")) continue;
    } else if (readMoney(month.rest)) {
      continue;
    } else if (!month.raw.includes(",")) {
      continue;
    }
    return {
      numeric: month.numeric,
      excerpt: `${match[0]} ${month.raw}`.replace(/\s+/g, " ").trim().slice(0, 240),
      index: start,
    };
  }
  return null;
}

function immediateAmount(
  text: string,
  label: RegExp,
): { numeric: string; excerpt: string; index: number } | null {
  const flags = label.flags.includes("g") ? label.flags : `${label.flags}g`;
  const re = new RegExp(label.source, flags);
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    const rest = text.slice(start + match[0].length);
    const money = readMoney(rest);
    if (!money) continue;
    return {
      numeric: money.numeric,
      excerpt: `${match[0]} ${money.raw}`.replace(/\s+/g, " ").trim().slice(0, 240),
      index: start,
    };
  }
  return null;
}

function billedOnDate(text: string): string | null {
  const match =
    /billed\s+on[:\s]+(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-](20\d{2})/i.exec(
      text,
    );
  if (!match) return null;
  return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
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
  const seen = new Set<string>();

  const labeled: {
    re: RegExp;
    kind: ExtractedCandidate["kind"];
    factType: string;
    label: string;
    confidence: string;
    statement?: boolean;
  }[] = [
    {
      re: /cash\s+balance/i,
      kind: "fact",
      factType: "cash_balance",
      label: "Cash balance",
      confidence: "0.74",
    },
    {
      re: /cash\s+in\s+bank\s*-\s*reserve/i,
      kind: "fact",
      factType: "reserve_balance",
      label: "Reserve balance",
      confidence: "0.74",
    },
    {
      re: /cash\s+in\s+bank(?!\s*-)/i,
      kind: "fact",
      factType: "cash_balance",
      label: "Cash in bank",
      confidence: "0.74",
    },
    {
      re: /hoa\s+dues/i,
      kind: "fact",
      factType: "monthly_dues_collected",
      label: "HOA dues",
      confidence: "0.74",
      statement: true,
    },
    {
      re: /total\s+operating\s+income/i,
      kind: "fact",
      factType: "operating_income",
      label: "Total operating income",
      confidence: "0.74",
      statement: true,
    },
    {
      re: /total\s+operating\s+expenses?/i,
      kind: "fact",
      factType: "operating_expenses",
      label: "Total operating expenses",
      confidence: "0.74",
      statement: true,
    },
    {
      re: /total\s+expenses?/i,
      kind: "fact",
      factType: "operating_expenses",
      label: "Total expenses",
      confidence: "0.7",
      statement: true,
    },
    {
      re: /willows\s+assessment/i,
      kind: "fact",
      factType: "special_assessment_collected",
      label: "Willows assessment",
      confidence: "0.76",
      statement: true,
    },
    {
      re: /(?<!willows\s)(?<!-\s)assessment/i,
      kind: "fact",
      factType: "special_assessment_collected",
      label: "Assessment",
      confidence: "0.62",
      statement: true,
    },
    {
      re: /total\s+assets/i,
      kind: "fact",
      factType: "total_assets",
      label: "Total assets",
      confidence: "0.72",
    },
    {
      re: /total\s+liabilit(?:y|ies)/i,
      kind: "fact",
      factType: "total_liabilities",
      label: "Total liabilities",
      confidence: "0.72",
    },
    {
      re: /noi\s*-\s*net\s+operating\s+income/i,
      kind: "fact",
      factType: "net_income",
      label: "Net operating income",
      confidence: "0.76",
      statement: true,
    },
    {
      re: /net\s+operating\s+income/i,
      kind: "fact",
      factType: "net_income",
      label: "Net operating income",
      confidence: "0.74",
      statement: true,
    },
    {
      re: /net\s+income/i,
      kind: "fact",
      factType: "net_income",
      label: "Net income",
      confidence: "0.66",
      statement: true,
    },
    {
      re: /accounts?\s+receivable/i,
      kind: "fact",
      factType: "accounts_receivable",
      label: "Accounts receivable",
      confidence: "0.68",
    },
    {
      re: /reserve\s+balance/i,
      kind: "fact",
      factType: "reserve_balance",
      label: "Reserve balance",
      confidence: "0.72",
    },
    {
      re: /reserve\s+contribution/i,
      kind: "fact",
      factType: "reserve_contribution",
      label: "Reserve contribution",
      confidence: "0.66",
    },
    {
      re: /capital\s+need/i,
      kind: "maintenance_capital",
      factType: "capital_need_estimate",
      label: "Capital need estimate",
      confidence: "0.55",
    },
  ];

  for (const p of labeled) {
    if (seen.has(p.factType)) continue;
    const found = (p.statement ? statementAmount : immediateAmount)(text, p.re);
    if (!found) continue;
    if (p.label === "Net income" && found.numeric === "0.00") continue;
    seen.add(p.factType);
    const around = text.slice(
      Math.max(0, found.index - 160),
      found.index + found.excerpt.length,
    );
    const page = /Page\s+(\d+)/i.exec(around);
    const period = inferReportingPeriod(`${context.filename}\n${context.path}\n${around}`);
    out.push({
      kind: p.kind,
      factType: p.factType,
      label: p.label,
      numericValue: found.numeric,
      unit: "USD",
      asOfDate: period.asOfDate,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      sourceExcerpt: found.excerpt,
      sourcePage: page?.[1] ?? null,
      confidence: p.confidence,
      rawValue: found.numeric,
    });
  }

  if (!seen.has("invoice_amount")) {
    const invoice = labeledInvoiceAmount(
      text,
      /bill|receipt|invoice/i.test(`${context.path} ${context.filename}`),
    );
    if (invoice) {
      const billed = billedOnDate(text);
      const period = billed
        ? monthPeriod(Number(billed.slice(0, 4)), Number(billed.slice(5, 7)))
        : inferReportingPeriod(`${context.filename}\n${context.path}\n${invoice.excerpt}`);
      const at = text.toLowerCase().indexOf(invoice.excerpt.slice(0, 24).toLowerCase());
      const around = text.slice(Math.max(0, at - 160), at + invoice.excerpt.length);
      const page = /Page\s+(\d+)/i.exec(around);
      seen.add("invoice_amount");
      out.push({
        kind: "fact",
        factType: "invoice_amount",
        label: invoice.label,
        numericValue: invoice.numericValue,
        unit: "USD",
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        asOfDate: billed ?? period.asOfDate,
        sourceExcerpt: invoice.excerpt,
        sourcePage: page?.[1] ?? null,
        confidence: "0.78",
        rawValue: invoice.numericValue,
      });
    }
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
