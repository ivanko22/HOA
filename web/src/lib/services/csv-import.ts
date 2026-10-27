import { z } from "zod";
import { db } from "@/lib/db/client";
import { bankAccounts, bankTransactions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  assertCan,
  type TenantContext,
} from "@/lib/domain/permissions";
import { recordAudit } from "./audit";

const bankRowSchema = z.object({
  postedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
  description: z.string().min(1),
  externalId: z.string().optional(),
});

export type CsvImportResult = {
  dryRun: boolean;
  accepted: number;
  rejected: { line: number; error: string; raw: string }[];
  preview: z.infer<typeof bankRowSchema>[];
};

function parseCsv(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      // Minimal CSV: comma-separated, no embedded commas in quotes for v1 sample
      return line.split(",").map((c) => c.trim());
    });
}

export async function importBankTransactionsCsv(
  ctx: TenantContext,
  csvText: string,
  options: { bankAccountId: string; dryRun?: boolean },
): Promise<CsvImportResult> {
  assertCan(ctx.capabilities, "import.csv");

  const [bank] = await db
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.id, options.bankAccountId),
        eq(bankAccounts.organizationId, ctx.organizationId),
        eq(bankAccounts.communityId, ctx.communityId),
      ),
    )
    .limit(1);
  if (!bank) throw new Error("Bank account not found in tenant");

  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return { dryRun: Boolean(options.dryRun), accepted: 0, rejected: [], preview: [] };
  }

  const header = rows[0].map((h) => h.toLowerCase());
  const dataRows = rows.slice(1);
  const idx = {
    postedDate: header.indexOf("posted_date"),
    amount: header.indexOf("amount"),
    description: header.indexOf("description"),
    externalId: header.indexOf("external_id"),
  };
  if (idx.postedDate < 0 || idx.amount < 0 || idx.description < 0) {
    throw new Error(
      "CSV must include headers: posted_date,amount,description[,external_id]",
    );
  }

  const rejected: CsvImportResult["rejected"] = [];
  const preview: z.infer<typeof bankRowSchema>[] = [];

  dataRows.forEach((cols, i) => {
    const raw = cols.join(",");
    const candidate = {
      postedDate: cols[idx.postedDate],
      amount: cols[idx.amount],
      description: cols[idx.description],
      externalId:
        idx.externalId >= 0 && cols[idx.externalId]
          ? cols[idx.externalId]
          : undefined,
    };
    const parsed = bankRowSchema.safeParse(candidate);
    if (!parsed.success) {
      rejected.push({
        line: i + 2,
        error: parsed.error.issues.map((x) => x.message).join("; "),
        raw,
      });
      return;
    }
    preview.push(parsed.data);
  });

  if (options.dryRun) {
    return {
      dryRun: true,
      accepted: preview.length,
      rejected,
      preview: preview.slice(0, 20),
    };
  }

  if (preview.length) {
    await db.insert(bankTransactions).values(
      preview.map((p) => ({
        organizationId: ctx.organizationId,
        communityId: ctx.communityId,
        bankAccountId: bank.id,
        postedDate: p.postedDate,
        amount: p.amount,
        description: p.description,
        externalId: p.externalId,
        verificationStatus: "needs_review" as const,
      })),
    );
  }

  await recordAudit({
    ctx,
    action: "import.bank_transactions",
    entityType: "bank_account",
    entityId: bank.id,
    after: { accepted: preview.length, rejected: rejected.length },
  });

  return {
    dryRun: false,
    accepted: preview.length,
    rejected,
    preview: preview.slice(0, 20),
  };
}
