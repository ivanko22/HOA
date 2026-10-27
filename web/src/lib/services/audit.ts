import { db } from "@/lib/db/client";
import { auditEvents } from "@/lib/db/schema";
import type { TenantContext } from "@/lib/domain/permissions";

export async function recordAudit(params: {
  ctx?: Pick<TenantContext, "userId" | "organizationId" | "communityId"> | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  sessionId?: string | null;
}): Promise<void> {
  await db.insert(auditEvents).values({
    organizationId: params.ctx?.organizationId ?? null,
    communityId: params.ctx?.communityId ?? null,
    actorUserId: params.ctx?.userId ?? null,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    before: params.before == null ? null : JSON.stringify(params.before),
    after: params.after == null ? null : JSON.stringify(params.after),
    ip: params.ip ?? null,
    sessionId: params.sessionId ?? null,
  });
}
