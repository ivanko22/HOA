import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { dataHealthChecks } from "@/lib/db/schema";
import type { DataHealthStatus } from "@/lib/domain/enums";
import {
  assertCan,
  type TenantContext,
} from "@/lib/domain/permissions";

export type DataHealthView = {
  score: number;
  scoredCount: number;
  availableCount: number;
  checks: {
    id: string;
    year: number | null;
    category: string;
    label: string;
    status: DataHealthStatus;
    notes: string | null;
  }[];
  gaps: {
    id: string;
    label: string;
    status: DataHealthStatus;
    notes: string | null;
  }[];
};

const positive: DataHealthStatus[] = ["available"];

export async function getDataHealth(
  ctx: TenantContext,
): Promise<DataHealthView> {
  assertCan(ctx.capabilities, "data_health.read");

  const rows = await db
    .select()
    .from(dataHealthChecks)
    .where(
      and(
        eq(dataHealthChecks.organizationId, ctx.organizationId),
        eq(dataHealthChecks.communityId, ctx.communityId),
      ),
    );

  const checks = rows
    .map((r) => ({
      id: r.id,
      year: r.year == null ? null : Number(r.year),
      category: r.category,
      label: r.label,
      status: r.status,
      notes: r.notes,
    }))
    .sort((a, b) => {
      const y = (b.year ?? 0) - (a.year ?? 0);
      if (y !== 0) return y;
      return a.label.localeCompare(b.label);
    });

  const availableCount = checks.filter((c) =>
    positive.includes(c.status),
  ).length;
  const scoredCount = checks.length;
  const score =
    scoredCount === 0 ? 0 : Math.round((availableCount / scoredCount) * 100);

  const gaps = checks
    .filter((c) => !positive.includes(c.status))
    .map((c) => ({
      id: c.id,
      label: c.label,
      status: c.status,
      notes: c.notes,
    }));

  return { score, scoredCount, availableCount, checks, gaps };
}
