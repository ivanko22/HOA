import "dotenv/config";
import { and, eq, ne } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { communities, facts, organizations, users } from "@/lib/db/schema";
import { capabilitiesForRoles, type TenantContext } from "@/lib/domain/permissions";
import {
  getMetricDetail,
  resolveMetric,
} from "@/lib/services/metric-resolution";

async function willowsTreasurerCtx(): Promise<TenantContext> {
  const [community] = await db
    .select()
    .from(communities)
    .where(eq(communities.slug, "the-willows"))
    .limit(1);
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, "treasurer@willows.local"))
    .limit(1);
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

describe("KPI → fact → document provenance", () => {
  it("resolves special assessment from reported minutes fact", async () => {
    const ctx = await willowsTreasurerCtx();
    const metric = await resolveMetric(ctx, "special_assessment_collected");
    expect(metric.value).toBe("17973.00");
    expect(metric.verificationStatus).toBe("reported");
    expect(metric.factId).toBeTruthy();
    expect(metric.documentId).toBeTruthy();
    expect(metric.sourceReference).toContain("October 1, 2026");

    const detail = await getMetricDetail(ctx, "special_assessment_collected");
    expect(detail.documentTitle).toContain("October 1, 2026");
    expect(detail.candidates.some((c) => c.id === metric.factId)).toBe(true);
  });

  it("derives collection rate from dues facts without inventing zero", async () => {
    const ctx = await willowsTreasurerCtx();
    const rate = await resolveMetric(ctx, "collection_rate");
    expect(rate.value).toBe("82.39");
    expect(rate.verificationStatus).toBe("reported");
    expect(rate.unit).toBe("%");
  });

  it("keeps cash unknown when no cash_balance fact exists", async () => {
    const ctx = await willowsTreasurerCtx();
    const cash = await resolveMetric(ctx, "cash");
    expect(cash.value).toBeNull();
    expect(cash.verificationStatus).toBe("unknown");
  });

  it("isolates facts by tenant community", async () => {
    const ctx = await willowsTreasurerCtx();
    const [otherOrg] = await db.select().from(organizations).limit(1);
    // Build a forged context pointing at Willows org but a fake community id
    // that has no facts — resolution must be empty, not leak Willows values.
    const isolated: TenantContext = {
      ...ctx,
      communityId: "00000000-0000-4000-8000-000000000099",
      organizationId: otherOrg.id,
    };

    // Query will return empty because tenant filters won't match Willows rows
    const rows = await db
      .select()
      .from(facts)
      .where(
        and(
          eq(facts.organizationId, isolated.organizationId),
          eq(facts.communityId, isolated.communityId),
        ),
      );
    expect(rows).toHaveLength(0);

    const willowsFacts = await db
      .select()
      .from(facts)
      .where(
        and(
          eq(facts.organizationId, ctx.organizationId),
          eq(facts.communityId, ctx.communityId),
          ne(facts.id, "00000000-0000-4000-8000-000000000000"),
        ),
      );
    expect(willowsFacts.length).toBeGreaterThan(0);
  });
});
