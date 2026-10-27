import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { buildings, capitalProjects, documents, units } from "@/lib/db/schema";
import {
  assertCan,
  type TenantContext,
} from "@/lib/domain/permissions";
import type { BuildingCondition } from "@/lib/domain/enums";

export async function listBuildings(ctx: TenantContext) {
  assertCan(ctx.capabilities, "transparency.read");

  return db
    .select()
    .from(buildings)
    .where(
      and(
        eq(buildings.organizationId, ctx.organizationId),
        eq(buildings.communityId, ctx.communityId),
      ),
    );
}

export async function getBuildingDetail(ctx: TenantContext, buildingId: string) {
  assertCan(ctx.capabilities, "transparency.read");

  const [building] = await db
    .select()
    .from(buildings)
    .where(
      and(
        eq(buildings.id, buildingId),
        eq(buildings.organizationId, ctx.organizationId),
        eq(buildings.communityId, ctx.communityId),
      ),
    )
    .limit(1);
  if (!building) return null;

  const unitRows = await db
    .select()
    .from(units)
    .where(eq(units.buildingId, building.id));

  const projects = await db
    .select()
    .from(capitalProjects)
    .where(eq(capitalProjects.buildingId, building.id));

  const docs = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.organizationId, ctx.organizationId),
        eq(documents.communityId, ctx.communityId),
      ),
    );

  const conditions: { label: string; value: BuildingCondition }[] = [
    { label: "Roof", value: building.roofCondition },
    { label: "Stairwell", value: building.stairwellCondition },
    { label: "Siding", value: building.sidingCondition },
    { label: "Balconies", value: building.balconyCondition },
    { label: "Water intrusion", value: building.waterIntrusionStatus },
    { label: "Electrical", value: building.electricalStatus },
    { label: "Insurance issues", value: building.insuranceIssueStatus },
  ];

  return { building, units: unitRows, projects, documents: docs, conditions };
}
