import { createHash } from "node:crypto";
import { z } from "zod";

export const canonicalImportFields = [
  "date",
  "description",
  "amount",
  "debit",
  "credit",
  "unit",
  "owner",
  "vendor",
  "category",
  "reference",
  "externalId",
] as const;

export type CanonicalImportField = (typeof canonicalImportFields)[number];

export const importSourceTypes = [
  "generic_csv",
  "folio_csv",
  "bank_csv",
] as const;

export type ImportSourceType = (typeof importSourceTypes)[number];

export const importClassifications = [
  "income",
  "expense",
  "transfer",
  "owner_payment",
  "assessment",
  "refund",
  "adjustment",
  "unknown",
] as const;

export type ImportClassification = (typeof importClassifications)[number];

export type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
};

/** Minimal CSV parser: supports quoted fields and commas inside quotes. */
export function parseCsv(text: string): CsvParseResult {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === "," && !inQuotes) {
        cells.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };

  const headers = parseLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i] ?? "";
    });
    return obj;
  });
  return { headers, rows };
}

export function suggestMapping(
  headers: string[],
  sourceType: ImportSourceType = "generic_csv",
): Record<string, string> {
  const lower = headers.map((h) => ({ raw: h, key: h.toLowerCase() }));
  const find = (...candidates: string[]) =>
    lower.find((h) => candidates.some((c) => h.key === c || h.key.includes(c)))
      ?.raw;

  const mapping: Record<string, string> = {};
  const date =
    find("posted_date", "date", "txn_date", "transaction date", "trans date") ??
    undefined;
  const description =
    find("description", "memo", "payee", "narrative", "details") ?? undefined;
  const amount = find("amount", "amt", "value") ?? undefined;
  const debit = find("debit", "withdrawal", "outflow") ?? undefined;
  const credit = find("credit", "deposit", "inflow") ?? undefined;
  const unit = find("unit", "unit_number", "unit #") ?? undefined;
  const owner = find("owner", "owner_name", "member") ?? undefined;
  const vendor = find("vendor", "payee", "merchant") ?? undefined;
  const category = find("category", "gl", "account", "type") ?? undefined;
  const reference = find("reference", "ref", "check_number") ?? undefined;
  const externalId =
    find("external_id", "externalid", "id", "txn_id", "transaction_id") ??
    undefined;

  if (date) mapping.date = date;
  if (description) mapping.description = description;
  if (amount) mapping.amount = amount;
  if (debit) mapping.debit = debit;
  if (credit) mapping.credit = credit;
  if (unit) mapping.unit = unit;
  if (owner) mapping.owner = owner;
  if (vendor) mapping.vendor = vendor;
  if (category) mapping.category = category;
  if (reference) mapping.reference = reference;
  if (externalId) mapping.externalId = externalId;

  if (sourceType === "bank_csv" && !mapping.date && find("posted")) {
    mapping.date = find("posted")!;
  }
  return mapping;
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeDate(raw: string | undefined | null): string | null {
  if (!raw || !raw.trim()) return null;
  const v = raw.trim();
  if (isoDate.test(v)) return v;
  // MM/DD/YYYY
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (mdy) {
    return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  }
  const parsed = Date.parse(v);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return null;
}

export function normalizeAmount(raw: string | undefined | null): string | null {
  if (raw == null || raw.trim() === "") return null;
  const cleaned = raw.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

export type NormalizedImportValues = {
  date: string | null;
  description: string | null;
  amount: string | null;
  direction: "inflow" | "outflow" | "unknown";
  unit: string | null;
  owner: string | null;
  vendor: string | null;
  category: string | null;
  reference: string | null;
  externalId: string | null;
  classification: ImportClassification;
};

export function applyMapping(
  raw: Record<string, string>,
  mapping: Record<string, string>,
): NormalizedImportValues {
  const get = (field: CanonicalImportField) => {
    const col = mapping[field];
    return col ? (raw[col] ?? "").trim() : "";
  };

  const debit = normalizeAmount(get("debit"));
  const credit = normalizeAmount(get("credit"));
  let amount = normalizeAmount(get("amount"));
  let direction: NormalizedImportValues["direction"] = "unknown";

  if (amount != null) {
    const n = Number(amount);
    direction = n < 0 ? "outflow" : n > 0 ? "inflow" : "unknown";
    amount = Math.abs(n).toFixed(2);
  } else if (debit != null || credit != null) {
    if (debit != null && Number(debit) !== 0) {
      amount = Math.abs(Number(debit)).toFixed(2);
      direction = "outflow";
    } else if (credit != null && Number(credit) !== 0) {
      amount = Math.abs(Number(credit)).toFixed(2);
      direction = "inflow";
    }
  }

  const category = get("category") || null;
  const description = get("description") || null;

  return {
    date: normalizeDate(get("date")),
    description,
    amount,
    direction,
    unit: get("unit") || null,
    owner: get("owner") || null,
    vendor: get("vendor") || null,
    category,
    reference: get("reference") || null,
    externalId: get("externalId") || null,
    classification: classifyRow({
      amount,
      direction,
      category,
      description,
    }),
  };
}

export function classifyRow(input: {
  amount: string | null;
  direction: "inflow" | "outflow" | "unknown";
  category: string | null;
  description: string | null;
}): ImportClassification {
  const hay = `${input.category ?? ""} ${input.description ?? ""}`.toLowerCase();
  if (/transfer|xfer|reserve transfer/.test(hay)) return "transfer";
  if (/dues|assessment|hoa fee/.test(hay) && input.direction === "inflow") {
    return /special assessment/.test(hay) ? "assessment" : "owner_payment";
  }
  if (/refund/.test(hay)) return "refund";
  if (/adjust/.test(hay)) return "adjustment";
  if (input.direction === "inflow") return "income";
  if (input.direction === "outflow") return "expense";
  return "unknown";
}

export function validateNormalized(values: NormalizedImportValues): string[] {
  const errors: string[] = [];
  if (!values.date) errors.push("Missing or invalid date");
  if (!values.description) errors.push("Missing description");
  if (values.amount == null) errors.push("Missing or invalid amount");
  return errors;
}

export function duplicateFingerprint(input: {
  communityId: string;
  date: string | null;
  amount: string | null;
  description: string | null;
  externalId?: string | null;
  reference?: string | null;
}): string {
  const parts = [
    input.communityId,
    input.date ?? "",
    input.amount ?? "",
    (input.description ?? "").toLowerCase().replace(/\s+/g, " ").trim(),
    input.externalId ?? "",
    input.reference ?? "",
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export const mappingSchema = z
  .record(z.string(), z.string())
  .refine((m) => Boolean(m.date), { message: "date mapping required" })
  .refine((m) => Boolean(m.description), {
    message: "description mapping required",
  })
  .refine((m) => Boolean(m.amount) || Boolean(m.debit) || Boolean(m.credit), {
    message: "amount or debit/credit mapping required",
  });
