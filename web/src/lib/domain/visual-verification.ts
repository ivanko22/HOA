import type { VisualVerificationStatus } from "./enums";

export type EvidenceBbox = {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type EvidenceTarget = {
  factType: string;
  label: string;
  numericValue: string | null;
  preferredPage?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  sourceExcerpt?: string | null;
};

export type EvidenceHit = {
  status: VisualVerificationStatus;
  foundValue: string | null;
  page: number | null;
  excerpt: string | null;
  matchText: string | null;
  reason: string;
  bbox: EvidenceBbox | null;
};

const LABEL_PATTERNS: Record<string, RegExp[]> = {
  monthly_dues_collected: [/hoa\s+dues/i, /regular\s+dues/i, /dues\s+collected/i],
  operating_expenses: [
    /total\s+expenses?/i,
    /total\s+operating\s+expenses?/i,
    /operating\s+expenses?/i,
  ],
  operating_income: [
    /total\s+operating\s+income/i,
    /total\s+income/i,
    /operating\s+income/i,
  ],
  special_assessment_collected: [
    /willows\s+assessment/i,
    /special\s+assessment/i,
    /(?<!-\s)assessment/i,
  ],
  net_income: [
    /noi\s*-\s*net\s+operating\s+income/i,
    /net\s+operating\s+income/i,
    /net\s+income/i,
  ],
  cash_balance: [/cash\s+in\s+bank(?!\s*-)/i, /cash\s+balance/i],
  reserve_balance: [/cash\s+in\s+bank\s*-\s*reserve/i, /reserve\s+balance/i],
  invoice_amount: [
    /amount\s+due/i,
    /please\s+pay/i,
    /invoice\s*total/i,
    /total\s+due/i,
    /\bamount\b/i,
  ],
  total_assets: [/total\s+assets/i],
  total_liabilities: [/total\s+liabilit(?:y|ies)/i],
};

/**
 * Normalize a money token for comparison.
 * Supports $, commas, leading minus, and accounting parentheses.
 */
export function normalizeMoneyToken(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const paren = /^\(\s*\$?\s*([\d,]+(?:\.\d{1,2})?)\s*\)$/.exec(trimmed);
  if (paren) {
    const value = Number(paren[1].replace(/,/g, ""));
    if (!Number.isFinite(value)) return null;
    return `-${value.toFixed(2)}`;
  }
  const negative = /^\s*-/.test(trimmed) || /-\s*\$/.test(trimmed);
  const cleaned = trimmed.replace(/[$,\s()-]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned).toFixed(2);
  return negative ? `-${value}` : value;
}

export function moneyValuesEqual(a: string | null, b: string | null): boolean {
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
}

function pageForOffset(text: string, index: number): number {
  const before = text.slice(0, Math.max(0, index));
  const pages = [...before.matchAll(/Page\s+(\d+)/gi)];
  if (pages.length === 0) return 1;
  return Number(pages[pages.length - 1][1]) || 1;
}

function readImmediateMoney(rest: string): {
  raw: string;
  value: string;
  end: number;
} | null {
  const match = /^[\s:]*(\(?-?\$?\s*-?[\d,]+\.\d{2}\)?)/.exec(rest);
  if (!match) return null;
  const value = normalizeMoneyToken(match[1]);
  if (!value) return null;
  return { raw: match[1], value, end: match[0].length };
}

/** For invoice labels such as "Total Due By Oct 21, 2026 $186.73". */
function readNearbyMoney(rest: string, limit = 80): {
  raw: string;
  value: string;
  end: number;
} | null {
  const immediate = readImmediateMoney(rest);
  if (immediate) return immediate;
  const window = rest.slice(0, limit);
  const match = /(\(?-?\$?\s*-?[\d,]+\.\d{2}\)?)/.exec(window);
  if (!match || match.index == null) return null;
  const value = normalizeMoneyToken(match[1]);
  if (!value || value === "0.00") return null;
  return { raw: match[1], value, end: match.index + match[0].length };
}

function readPercent(rest: string): { end: number } | null {
  const match = /^[\s:]+(-?\d{1,3}\.\d{2})(?![\d,])/.exec(rest);
  if (!match) return null;
  return { end: match[0].length };
}

/**
 * Independent locator — does not call extractCandidatesFromText.
 * Prefers the selected-month column (amount, percent, YTD) and the strongest
 * label for the fact type. Rejects bare duplicates of the same number when
 * the label context is missing.
 */
export function locateEvidenceInDocumentText(
  text: string,
  target: EvidenceTarget,
): EvidenceHit {
  if (target.numericValue == null) {
    return {
      status: "unable",
      foundValue: null,
      page: null,
      excerpt: null,
      matchText: null,
      reason: "No extracted amount to verify.",
      bbox: null,
    };
  }
  if (!text.trim()) {
    return {
      status: "unable",
      foundValue: null,
      page: null,
      excerpt: null,
      matchText: null,
      reason: "Document has no readable text for evidence matching.",
      bbox: null,
    };
  }

  const patterns =
    LABEL_PATTERNS[target.factType] ??
    (target.label
      ? [new RegExp(target.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")]
      : []);
  if (patterns.length === 0) {
    return locateByAmountOnly(text, target);
  }

  const hits: {
    value: string;
    raw: string;
    index: number;
    excerpt: string;
    score: number;
  }[] = [];

  for (const [patternIndex, pattern] of patterns.entries()) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    for (const match of text.matchAll(re)) {
      const start = match.index ?? 0;
      const rest = text.slice(start + match[0].length);
      const month =
        target.factType === "invoice_amount"
          ? readNearbyMoney(rest)
          : readImmediateMoney(rest);
      if (!month) continue;
      const afterMonth = rest.slice(month.end);
      const percent = readPercent(afterMonth);
      if (percent) {
        const ytd = readImmediateMoney(afterMonth.slice(percent.end));
        if (!ytd) continue;
        if (month.value === "0.00" && /0\.00/.test(afterMonth.slice(0, percent.end))) {
          continue;
        }
      } else if (
        target.factType !== "invoice_amount" &&
        readImmediateMoney(afterMonth)
      ) {
        // Multi-month grid without percent markers — skip.
        continue;
      }
      const excerpt = `${match[0]} ${month.raw}`
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240);
      hits.push({
        value: month.value,
        raw: month.raw,
        index: start,
        excerpt,
        score: 100 - patternIndex * 10,
      });
    }
  }

  if (hits.length === 0) {
    return locateByAmountOnly(text, target);
  }

  const matching = hits.filter((hit) =>
    moneyValuesEqual(hit.value, target.numericValue),
  );
  if (matching.length === 1) {
    const hit = matching[0];
    return {
      status: "visual_match",
      foundValue: hit.value,
      page: pageForOffset(text, hit.index),
      excerpt: hit.excerpt,
      matchText: hit.excerpt,
      reason: "Labeled amount on the document matches the extracted value.",
      bbox: null,
    };
  }
  if (matching.length > 1) {
    const preferred = preferredPageHit(matching, text, target.preferredPage);
    if (preferred && uniqueValues(matching).length === 1) {
      return {
        status: "visual_match",
        foundValue: preferred.value,
        page: pageForOffset(text, preferred.index),
        excerpt: preferred.excerpt,
        matchText: preferred.excerpt,
        reason:
          "Multiple labeled matches share the same amount; page context was used.",
        bbox: null,
      };
    }
    return {
      status: "ambiguous",
      foundValue: matching[0]?.value ?? null,
      page: pageForOffset(text, matching[0]?.index ?? 0),
      excerpt: matching[0]?.excerpt ?? null,
      matchText: matching[0]?.excerpt ?? null,
      reason:
        "Several labeled occurrences match this amount; the exact cell is ambiguous.",
      bbox: null,
    };
  }

  const best = [...hits].sort((a, b) => b.score - a.score)[0];
  return {
    status: "mismatch",
    foundValue: best.value,
    page: pageForOffset(text, best.index),
    excerpt: best.excerpt,
    matchText: best.excerpt,
    reason: `Document shows ${best.value} for this label, not ${target.numericValue}.`,
    bbox: null,
  };
}

function uniqueValues(hits: { value: string }[]): string[] {
  return [...new Set(hits.map((hit) => hit.value))];
}

function preferredPageHit<T extends { index: number }>(
  hits: T[],
  text: string,
  preferredPage: string | null | undefined,
): T | null {
  if (!preferredPage) return hits[0] ?? null;
  const wanted = Number(preferredPage);
  if (!Number.isFinite(wanted)) return hits[0] ?? null;
  return (
    hits.find((hit) => pageForOffset(text, hit.index) === wanted) ?? hits[0] ?? null
  );
}

function locateByAmountOnly(text: string, target: EvidenceTarget): EvidenceHit {
  const wanted = target.numericValue!;
  const variants = amountSearchVariants(wanted);
  const occurrences: { index: number; raw: string }[] = [];
  for (const variant of variants) {
    const re = new RegExp(variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    for (const match of text.matchAll(re)) {
      occurrences.push({ index: match.index ?? 0, raw: match[0] });
    }
  }
  if (occurrences.length === 0) {
    return {
      status: "unable",
      foundValue: null,
      page: null,
      excerpt: null,
      matchText: null,
      reason: "The extracted amount was not found as readable text on the document.",
      bbox: null,
    };
  }
  if (occurrences.length > 1) {
    return {
      status: "ambiguous",
      foundValue: wanted,
      page: pageForOffset(text, occurrences[0].index),
      excerpt: text
        .slice(Math.max(0, occurrences[0].index - 40), occurrences[0].index + 40)
        .replace(/\s+/g, " ")
        .trim(),
      matchText: occurrences[0].raw,
      reason:
        "The amount appears more than once and no unique label context was found.",
      bbox: null,
    };
  }
  const only = occurrences[0];
  return {
    status: "visual_match",
    foundValue: wanted,
    page: pageForOffset(text, only.index),
    excerpt: text
      .slice(Math.max(0, only.index - 40), only.index + 40)
      .replace(/\s+/g, " ")
      .trim(),
    matchText: only.raw,
    reason: "A single occurrence of the amount was found in the document text.",
    bbox: null,
  };
}

export function amountSearchVariants(value: string): string[] {
  const n = Number(value);
  if (!Number.isFinite(n)) return [value];
  const abs = Math.abs(n).toFixed(2);
  const withComma = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const signed = n < 0;
  const base = [
    abs,
    withComma,
    `$${abs}`,
    `$${withComma}`,
    `$ ${abs}`,
    `$ ${withComma}`,
  ];
  if (!signed) return base;
  return [
    ...base.map((item) => `-${item}`),
    ...base.map((item) => `(${item})`),
    `$-${abs}`,
    `$-${withComma}`,
  ];
}

export function previewCacheKey(input: {
  communityId: string;
  documentId: string;
  contentHash: string;
  page: number;
  kind: "thumb" | "page";
}): string {
  return `${input.communityId}/preview/${input.documentId}/${input.contentHash}/${input.kind}-p${input.page}.png`;
}

export function selectEvidencePage(input: {
  preferredPage?: string | null;
  locatedPage?: number | null;
  pageCount?: number | null;
}): number {
  const preferred = Number(input.preferredPage);
  if (Number.isFinite(preferred) && preferred >= 1) {
    if (input.pageCount && preferred > input.pageCount) return 1;
    return preferred;
  }
  if (input.locatedPage && input.locatedPage >= 1) return input.locatedPage;
  return 1;
}

export function visualStatusLabel(status: VisualVerificationStatus): string {
  switch (status) {
    case "visual_match":
      return "Verified by visual evidence";
    case "mismatch":
      return "Mismatch detected";
    case "ambiguous":
      return "Ambiguous";
    case "unable":
      return "Unable to verify";
    default:
      return "Not yet checked";
  }
}
