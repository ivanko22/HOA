import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import {
  communities,
  financialTransactions,
  importBatches,
  importRows,
  users,
} from "@/lib/db/schema";
import {
  AuthorizationError,
  capabilitiesForRoles,
  type TenantContext,
} from "@/lib/domain/permissions";
import {
  approveImportRows,
  getImportBatchDetail,
  getTransactionProvenance,
  saveImportMapping,
  uploadImportCsv,
} from "./imports";
import { getReconciliationSummary } from "./reconciliation";

const csv = `Date,Description,Amount,Category,Unit,Vendor,ExternalId
09/07/2026,Kaiser Law payment,-4850.00,Legal,,Kaiser Law,ext-kaiser-1
09/08/2026,Owner dues deposit,250.00,Assessments,12A,,dep-001
09/09/2026,Broken row,not-a-number,Ops,,,bad-1
09/07/2026,Kaiser Law payment,-4850.00,Legal,,Kaiser Law,ext-kaiser-1
`;

async function treasurerCtx(): Promise<TenantContext> {
  const [community] = await db
    .select()
    .from(communities)
    .where(eq(communities.slug, "the-willows"))
    .limit(1);
  expect(community).toBeTruthy();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, "treasurer@willows.local"))
    .limit(1);
  expect(user).toBeTruthy();
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    organizationId: community.organizationId,
    communityId: community.id,
    roles: ["treasurer"],
    capabilities: capabilitiesForRoles(["treasurer"]),
    isPlatformAdmin: false,
    unitIds: [],
  };
}

describe("import pipeline integration", () => {
  let ctx: TenantContext;
  let batchId: string;
  let otherCommunityId: string | null = null;
  const createdBatchIds: string[] = [];

  it("uploads CSV preserving raw rows and needs_mapping status", async () => {
    ctx = await treasurerCtx();
    const result = await uploadImportCsv(ctx, {
      sourceType: "generic_csv",
      file: {
        name: "willows-sample.csv",
        type: "text/csv",
        bytes: Buffer.from(csv, "utf8"),
      },
    });
    batchId = result.batch.id;
    createdBatchIds.push(batchId);
    expect(result.batch.status).toBe("needs_mapping");
    expect(result.batch.rowCount).toBe(4);
    expect(result.headers).toContain("Description");

    const detail = await getImportBatchDetail(ctx, batchId);
    expect(detail.rows).toHaveLength(4);
    expect(detail.rows[0].raw).toMatchObject({
      Description: "Kaiser Law payment",
    });
    expect(detail.rows[0].normalized).toBeNull();
  });

  it("maps, validates invalid rows, and flags duplicates", async () => {
    const detail = await saveImportMapping(ctx, {
      batchId,
      mapping: {
        date: "Date",
        description: "Description",
        amount: "Amount",
        category: "Category",
        unit: "Unit",
        vendor: "Vendor",
        externalId: "ExternalId",
      },
      saveAsProfileName: "Willows generic test",
    });

    expect(detail.batch.status).toBe("needs_review");
    expect(detail.batch.errorRowCount).toBeGreaterThanOrEqual(1);
    expect(detail.batch.duplicateRowCount).toBeGreaterThanOrEqual(1);

    const invalid = detail.rows.filter((r) => r.status === "invalid");
    expect(invalid.length).toBeGreaterThanOrEqual(1);
    expect(invalid[0].validationErrors.length).toBeGreaterThan(0);
    expect(invalid[0].raw).toBeTruthy();

    const dups = detail.rows.filter((r) => r.status === "duplicate");
    expect(dups.length).toBeGreaterThanOrEqual(1);
    expect(dups[0].isDuplicate).toBe(1);
  });

  it("blocks owner from approving", async () => {
    const ownerCtx: TenantContext = {
      ...ctx,
      roles: ["owner"],
      capabilities: capabilitiesForRoles(["owner"]),
    };
    await expect(
      approveImportRows(ownerCtx, { batchId }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("approves ready rows into transactions with provenance", async () => {
    const before = await getImportBatchDetail(ctx, batchId, "ready");
    expect(before.rows.length).toBeGreaterThanOrEqual(1);

    const result = await approveImportRows(ctx, { batchId });
    expect(result.approved).toBeGreaterThanOrEqual(1);

    const [tx] = await db
      .select()
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.importBatchId, batchId),
          eq(financialTransactions.communityId, ctx.communityId),
        ),
      )
      .limit(1);
    expect(tx).toBeTruthy();
    expect(tx.importRowId).toBeTruthy();
    expect(tx.sourceDocumentId).toBeTruthy();
    expect(tx.verificationStatus).toBe("reported");

    const provenance = await getTransactionProvenance(ctx, tx.id);
    expect(provenance.importRow?.id).toBe(tx.importRowId);
    expect(provenance.importBatch?.id).toBe(batchId);
    expect(provenance.document?.id).toBe(tx.sourceDocumentId);
    expect(provenance.importRow?.raw).toBeTruthy();
  });

  it("enforces tenant isolation on batch access", async () => {
    const others = await db
      .select()
      .from(communities)
      .where(eq(communities.organizationId, ctx.organizationId));
    // Use a synthetic different community id if only one community exists
    otherCommunityId = others.find((c) => c.id !== ctx.communityId)?.id ?? null;

    const foreign: TenantContext = {
      ...ctx,
      communityId: otherCommunityId ?? "00000000-0000-4000-8000-000000000099",
    };

    await expect(getImportBatchDetail(foreign, batchId)).rejects.toThrow();
  });

  it("compares reported fact vs imported totals without implying error", async () => {
    const summary = await getReconciliationSummary(ctx, {
      start: "2026-09-01",
      end: "2026-09-30",
    });
    expect(summary.approvedTransactionCount).toBeGreaterThanOrEqual(1);
    expect(summary.importedExpenses.amount).not.toBeNull();
    if (summary.comparison) {
      expect(summary.comparison.note).toMatch(/informational/i);
      expect(summary.comparison.difference.amount).not.toBeNull();
    }
  });

  afterAll(async () => {
    for (const id of createdBatchIds) {
      await db
        .delete(financialTransactions)
        .where(eq(financialTransactions.importBatchId, id));
      await db.delete(importRows).where(eq(importRows.batchId, id));
      await db.delete(importBatches).where(eq(importBatches.id, id));
    }
  });
});
