import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { hash } from "bcryptjs";
import { db } from "@/lib/db/client";
import {
  communities,
  documents,
  facts,
  memberships,
  organizations,
  users,
} from "@/lib/db/schema";
import { capabilitiesForRoles, type TenantContext } from "@/lib/domain/permissions";
import { addManualFact, listDocuments } from "@/lib/services/documents";
import { getFactsForMetric } from "@/lib/services/fact-metrics";

describe("document → fact integration", () => {
  let ctx: TenantContext;
  let documentId: string;
  const createdFactIds: string[] = [];

  it("seeds a tenant context from The Willows community", async () => {
    const [community] = await db
      .select()
      .from(communities)
      .where(eq(communities.slug, "the-willows"))
      .limit(1);
    expect(community).toBeTruthy();

    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, "treasurer@willows.local"))
      .limit(1);
    if (!user) {
      [user] = await db
        .insert(users)
        .values({
          email: "treasurer@willows.local",
          name: "Treasurer",
          passwordHash: await hash("willows-demo", 10),
        })
        .returning();
    }

    ctx = {
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

    const [doc] = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.communityId, community.id),
          eq(documents.title, "Board Meeting Minutes — October 1, 2026"),
        ),
      )
      .limit(1);
    expect(doc).toBeTruthy();
    documentId = doc.id;
  });

  it("lists the October minutes with seeded facts", async () => {
    const rows = await listDocuments(ctx, { category: "meeting_minutes" });
    const oct = rows.find((r) => r.id === documentId);
    expect(oct).toBeTruthy();
    expect(oct!.factCount).toBeGreaterThanOrEqual(5);
    expect(oct!.processingStatus).not.toBe("verified");
  });

  it("exposes reported special assessment via fact metric boundary", async () => {
    const metric = await getFactsForMetric(ctx, "special_assessment_collected");
    expect(metric.amount.amount).toBe("17973.00");
    expect(metric.status).toBe("reported");
    expect(metric.documentIds).toContain(documentId);
  });

  it("retains both facts when a conflicting value is added", async () => {
    const created = await addManualFact(ctx, {
      documentId,
      factType: "special_assessment_collected",
      label: "Special assessment collected (conflicting test)",
      numericValue: "100.00",
      unit: "USD",
      asOfDate: "2026-10-01",
      verificationStatus: "reported",
      sourceReference: "integration test",
    });
    createdFactIds.push(created.id);
    expect(created.verificationStatus).toBe("conflicting");

    const peers = await db
      .select()
      .from(facts)
      .where(
        and(
          eq(facts.documentId, documentId),
          eq(facts.factType, "special_assessment_collected"),
        ),
      );
    expect(peers.length).toBeGreaterThanOrEqual(2);
    expect(peers.some((p) => p.verificationStatus === "conflicting")).toBe(true);

    const metric = await getFactsForMetric(ctx, "special_assessment_collected");
    expect(metric.status).toBe("conflicting");
    expect(metric.amount.amount).toBeNull();
  });

  afterAll(async () => {
    for (const id of createdFactIds) {
      await db.delete(facts).where(eq(facts.id, id));
    }
    // restore original special assessment fact status if marked conflicting
    await db
      .update(facts)
      .set({ verificationStatus: "reported", updatedAt: new Date() })
      .where(
        and(
          eq(facts.documentId, documentId),
          eq(facts.label, "Special assessment collected"),
        ),
      );
  });
});

// silence unused import lint if memberships/org unused
void memberships;
void organizations;
