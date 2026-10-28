import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { dataHealthChecks, documents } from "@/lib/db/schema";
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
  meetingMinutesByYear: {
    id: string;
    year: number | null;
    label: string;
    status: DataHealthStatus;
    notes: string | null;
    documentCount: number;
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

  const communityDocs = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.organizationId, ctx.organizationId),
        eq(documents.communityId, ctx.communityId),
        eq(documents.category, "meeting_minutes"),
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

  const meetingMinutesByYear = checks
    .filter((c) => c.category === "meeting_minutes")
    .map((c) => {
      const documentCount = communityDocs.filter((d) => {
        const y =
          d.documentDate?.slice(0, 4) ??
          d.periodStart?.slice(0, 4) ??
          null;
        return c.year != null && y === String(c.year);
      }).length;
      return {
        ...c,
        documentCount,
        notes:
          c.status === "missing"
            ? c.notes ??
              "Not currently available. This does not imply records never existed."
            : c.notes,
      };
    })
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

  return {
    score,
    scoredCount,
    availableCount,
    checks,
    gaps,
    meetingMinutesByYear,
  };
}
