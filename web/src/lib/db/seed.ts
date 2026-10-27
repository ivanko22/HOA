import "dotenv/config";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./client";
import {
  accounts,
  bankAccounts,
  buildings,
  communities,
  dataHealthChecks,
  documents,
  financialPeriods,
  memberships,
  organizations,
  units,
  users,
  capitalProjects,
  legalCases,
  vendors,
  auditEvents,
} from "./schema";

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "willows-demo";

async function upsertOrg() {
  const existing = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "willows-hoa"));
  if (existing[0]) return existing[0];
  const [org] = await db
    .insert(organizations)
    .values({
      name: "The Willows Condominium Association",
      slug: "willows-hoa",
    })
    .returning();
  return org;
}

async function main() {
  console.log("Seeding Community OS (The Willows)…");
  console.log(
    "Policy: only brief-supplied facts are treated as known; all else is unknown/missing.",
  );

  const org = await upsertOrg();

  let [community] = await db
    .select()
    .from(communities)
    .where(eq(communities.slug, "the-willows"));
  if (!community) {
    [community] = await db
      .insert(communities)
      .values({
        organizationId: org.id,
        name: "The Willows",
        slug: "the-willows",
        timezone: "America/Chicago",
        city: "Tulsa",
        region: "OK",
        country: "US",
        // Street address not supplied in verified records
        addressLine1: null,
        postalCode: null,
      })
      .returning();
  }

  const passwordHash = await hash(DEMO_PASSWORD, 10);

  async function ensureUser(
    email: string,
    name: string,
    isPlatformAdmin = false,
  ) {
    const [found] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    if (found) return found;
    const [u] = await db
      .insert(users)
      .values({
        email,
        name,
        passwordHash,
        isPlatformAdmin,
      })
      .returning();
    return u;
  }

  const admin = await ensureUser(
    "admin@community-os.local",
    "Platform Admin",
    true,
  );
  const treasurer = await ensureUser(
    "treasurer@willows.local",
    "Willows Treasurer",
  );
  const board = await ensureUser("board@willows.local", "Willows Board Member");
  const owner = await ensureUser("owner@willows.local", "Willows Owner");
  const auditor = await ensureUser("auditor@willows.local", "External Auditor");

  async function ensureMembership(
    userId: string,
    role:
      | "community_admin"
      | "treasurer"
      | "board_member"
      | "owner"
      | "auditor",
  ) {
    const existing = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, userId));
    if (existing.some((m) => m.communityId === community.id && m.role === role)) {
      return;
    }
    await db.insert(memberships).values({
      organizationId: org.id,
      communityId: community.id,
      userId,
      role,
    });
  }

  await ensureMembership(admin.id, "community_admin");
  await ensureMembership(treasurer.id, "treasurer");
  await ensureMembership(board.id, "board_member");
  await ensureMembership(owner.id, "owner");
  await ensureMembership(auditor.id, "auditor");

  // Buildings: structural scaffolding only — conditions UNKNOWN.
  // Unit counts not verified in supplied records.
  const buildingDefs = [
    { name: "Building A", code: "A" },
    { name: "Building B", code: "B" },
    { name: "Building C", code: "C" },
  ];

  const buildingRows = [];
  for (const def of buildingDefs) {
    const existing = await db
      .select()
      .from(buildings)
      .where(eq(buildings.code, def.code));
    const match = existing.find((b) => b.communityId === community.id);
    if (match) {
      buildingRows.push(match);
      continue;
    }
    const [b] = await db
      .insert(buildings)
      .values({
        organizationId: org.id,
        communityId: community.id,
        name: def.name,
        code: def.code,
        unitCount: null,
        yearBuilt: null,
        roofCondition: "unknown",
        stairwellCondition: "unknown",
        sidingCondition: "unknown",
        balconyCondition: "unknown",
        waterIntrusionStatus: "unknown",
        electricalStatus: "unknown",
        insuranceIssueStatus: "unknown",
        notes:
          "Building identity is demo scaffolding. Physical conditions are unknown pending verified inspections.",
      })
      .returning();
    buildingRows.push(b);
  }

  // Minimal units for ownership demo — not a verified roster
  for (const b of buildingRows) {
    for (const num of ["101", "102"]) {
      const existing = await db.select().from(units).where(eq(units.buildingId, b.id));
      if (existing.some((u) => u.unitNumber === num)) continue;
      await db.insert(units).values({
        organizationId: org.id,
        communityId: community.id,
        buildingId: b.id,
        unitNumber: num,
        bedrooms: null,
        bathrooms: null,
        sqFt: null,
      });
    }
  }

  // Chart of accounts (structure only)
  const coa: { code: string; name: string; type: "asset" | "liability" | "equity" | "revenue" | "expense"; isReserve?: boolean }[] = [
    { code: "1000", name: "Operating Cash", type: "asset" },
    { code: "1100", name: "Reserve Cash", type: "asset", isReserve: true },
    { code: "1200", name: "Accounts Receivable", type: "asset" },
    { code: "2000", name: "Accounts Payable", type: "liability" },
    { code: "3000", name: "Operating Fund Balance", type: "equity" },
    { code: "3100", name: "Reserve Fund Balance", type: "equity", isReserve: true },
    { code: "4000", name: "Dues Revenue", type: "revenue" },
    { code: "5000", name: "Operating Expenses", type: "expense" },
    { code: "5100", name: "Insurance Expense", type: "expense" },
    { code: "5200", name: "Legal Expense", type: "expense" },
  ];

  const accountByCode: Record<string, string> = {};
  for (const a of coa) {
    const existing = await db
      .select()
      .from(accounts)
      .where(eq(accounts.communityId, community.id));
    const found = existing.find((x) => x.code === a.code);
    if (found) {
      accountByCode[a.code] = found.id;
      continue;
    }
    const [row] = await db
      .insert(accounts)
      .values({
        organizationId: org.id,
        communityId: community.id,
        code: a.code,
        name: a.name,
        type: a.type,
        isReserve: a.isReserve ?? false,
      })
      .returning();
    accountByCode[a.code] = row.id;
  }

  const periodDefs = [
    { name: "FY 2024", startDate: "2024-01-01", endDate: "2024-12-31", isClosed: true },
    { name: "FY 2025", startDate: "2025-01-01", endDate: "2025-12-31", isClosed: true },
    { name: "FY 2026", startDate: "2026-01-01", endDate: "2026-12-31", isClosed: false },
  ];
  for (const p of periodDefs) {
    const existing = await db
      .select()
      .from(financialPeriods)
      .where(eq(financialPeriods.communityId, community.id));
    if (existing.some((x) => x.name === p.name)) continue;
    await db.insert(financialPeriods).values({
      organizationId: org.id,
      communityId: community.id,
      ...p,
    });
  }

  // Bank accounts with UNKNOWN balances — never invent dollars
  for (const def of [
    { name: "Operating Checking", code: "1000", institution: "Unknown" },
    { name: "Reserve Savings", code: "1100", institution: "Unknown" },
  ]) {
    const existing = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.communityId, community.id));
    if (existing.some((b) => b.name === def.name)) continue;
    await db.insert(bankAccounts).values({
      organizationId: org.id,
      communityId: community.id,
      accountId: accountByCode[def.code],
      name: def.name,
      institution: def.institution,
      lastFour: null,
      balance: null,
      balanceStatus: "unknown",
      balanceAsOf: null,
    });
  }

  // Documents: catalog placeholders — availability reflected in data health
  const docSeeds = [
    {
      category: "meeting_minutes" as const,
      title: "2024 Annual Meeting Minutes",
      documentDate: "2024-03-15",
      tags: ["minutes", "2024"],
    },
    {
      category: "meeting_minutes" as const,
      title: "2026 Board Meeting Minutes (placeholder catalog)",
      documentDate: "2026-01-15",
      tags: ["minutes", "2026"],
    },
  ];
  for (const d of docSeeds) {
    const existing = await db
      .select()
      .from(documents)
      .where(eq(documents.communityId, community.id));
    if (existing.some((x) => x.title === d.title)) continue;
    await db.insert(documents).values({
      organizationId: org.id,
      communityId: community.id,
      category: d.category,
      title: d.title,
      description:
        "Catalog entry only. File binary not supplied; treat content as unverified until uploaded.",
      storageKey: `seed/${community.slug}/${d.title.replace(/\s+/g, "-").toLowerCase()}.pdf`,
      mimeType: "application/pdf",
      byteSize: 0,
      documentDate: d.documentDate,
      tags: d.tags,
      uploadedBy: admin.id,
    });
  }

  // Data health — honest gaps
  const healthSeeds: {
    year: string | null;
    category: string;
    label: string;
    status: "available" | "missing" | "needs_reconciliation" | "pending" | "unknown";
    notes: string;
  }[] = [
    {
      year: "2024",
      category: "meeting_minutes",
      label: "2024 Meeting Minutes",
      status: "available",
      notes: "Catalog entry present; verify against signed PDF when uploaded.",
    },
    {
      year: "2025",
      category: "meeting_minutes",
      label: "2025 Meeting Minutes",
      status: "missing",
      notes: "No verified minutes supplied.",
    },
    {
      year: "2026",
      category: "meeting_minutes",
      label: "2026 Meeting Minutes",
      status: "available",
      notes: "Catalog entry present; verify against signed PDF when uploaded.",
    },
    {
      year: null,
      category: "accounts_receivable",
      label: "Current AR",
      status: "needs_reconciliation",
      notes: "No verified AR aging provided.",
    },
    {
      year: null,
      category: "accounts_payable",
      label: "Current AP",
      status: "needs_reconciliation",
      notes: "No verified AP aging provided.",
    },
    {
      year: null,
      category: "loan",
      label: "Loan status",
      status: "unknown",
      notes: "Loan existence and balances not supplied.",
    },
    {
      year: null,
      category: "inspection",
      label: "Building inspection",
      status: "pending",
      notes: "No verified inspection report on file.",
    },
    {
      year: "2026",
      category: "bank_statement",
      label: "2026 Bank Statements",
      status: "missing",
      notes: "Import statements to begin reconciliation.",
    },
    {
      year: "2026",
      category: "insurance",
      label: "Current insurance policies",
      status: "unknown",
      notes: "Policy documents not supplied.",
    },
  ];

  const existingHealth = await db
    .select()
    .from(dataHealthChecks)
    .where(eq(dataHealthChecks.communityId, community.id));
  for (const h of healthSeeds) {
    if (existingHealth.some((x) => x.label === h.label)) continue;
    await db.insert(dataHealthChecks).values({
      organizationId: org.id,
      communityId: community.id,
      year: h.year,
      category: h.category,
      label: h.label,
      status: h.status,
      notes: h.notes,
    });
  }

  // Projects / legal — unknown costs
  const existingProjects = await db
    .select()
    .from(capitalProjects)
    .where(eq(capitalProjects.communityId, community.id));
  if (existingProjects.length === 0) {
    await db.insert(capitalProjects).values({
      organizationId: org.id,
      communityId: community.id,
      buildingId: buildingRows[0]?.id,
      name: "Roof assessment (unscoped)",
      category: "roofing",
      priority: "medium",
      status: "proposed",
      estimatedCost: null,
      estimatedCostStatus: "unknown",
      approvedBudget: null,
      approvedBudgetStatus: "unknown",
      actualCost: null,
      actualCostStatus: "unknown",
      fundingSource: null,
      notes:
        "Placeholder project. Costs unknown until quotes/board approval are verified.",
    });
  }

  const existingVendors = await db
    .select()
    .from(vendors)
    .where(eq(vendors.communityId, community.id));
  if (existingVendors.length === 0) {
    await db.insert(vendors).values({
      organizationId: org.id,
      communityId: community.id,
      name: "Vendor roster not verified",
      category: "unknown",
    });
  }

  const existingLegal = await db
    .select()
    .from(legalCases)
    .where(eq(legalCases.communityId, community.id));
  if (existingLegal.length === 0) {
    await db.insert(legalCases).values({
      organizationId: org.id,
      communityId: community.id,
      caseNumber: "UNKNOWN-PENDING-RECORDS",
      court: null,
      ownerDisplay: null,
      attorney: null,
      originalBalance: null,
      originalBalanceStatus: "unknown",
      claimedBalance: null,
      claimedBalanceStatus: "unknown",
      legalExpenses: null,
      legalExpensesStatus: "unknown",
      recovery: null,
      recoveryStatus: "unknown",
      status: "open",
      filingDate: null,
      notes:
        "No verified legal case docket supplied. Row exists to demonstrate schema; values are unknown.",
    });
  }

  await db.insert(auditEvents).values({
    organizationId: org.id,
    communityId: community.id,
    actorUserId: admin.id,
    action: "seed.run",
    entityType: "community",
    entityId: community.id,
    after: JSON.stringify({
      message:
        "Seed completed with unknown financials; no invented verified balances.",
    }),
  });

  console.log("Seed complete.");
  console.log("Demo logins (password: %s):", DEMO_PASSWORD);
  console.log("  admin@community-os.local (platform + community admin)");
  console.log("  treasurer@willows.local");
  console.log("  board@willows.local");
  console.log("  owner@willows.local");
  console.log("  auditor@willows.local");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
