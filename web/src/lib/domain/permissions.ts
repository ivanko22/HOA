import type { RoleCode } from "./enums";

export const capabilities = [
  "platform.orgs.manage",
  "platform.users.impersonate",
  "community.settings.manage",
  "community.members.manage",
  "community.buildings.manage",
  "documents.manage",
  "documents.read",
  "projects.manage",
  "projects.read",
  "legal.manage",
  "legal.read",
  "finance.read",
  "finance.write",
  "finance.post",
  "finance.reconcile",
  "finance.verify",
  "finance.export",
  "transparency.read",
  "unit.read_own",
  "data_health.read",
  "data_health.manage",
  "import.csv",
  "audit.read",
] as const;

export type Capability = (typeof capabilities)[number];

const ALL: Capability[] = [...capabilities];

const roleCapabilityMap: Record<RoleCode, readonly Capability[]> = {
  platform_admin: ALL,
  community_admin: [
    "community.settings.manage",
    "community.members.manage",
    "community.buildings.manage",
    "documents.manage",
    "documents.read",
    "projects.manage",
    "projects.read",
    "legal.manage",
    "legal.read",
    "finance.read",
    "finance.write",
    "finance.post",
    "finance.reconcile",
    "finance.verify",
    "finance.export",
    "transparency.read",
    "unit.read_own",
    "data_health.read",
    "data_health.manage",
    "import.csv",
    "audit.read",
  ],
  board_member: [
    "documents.manage",
    "documents.read",
    "projects.manage",
    "projects.read",
    "legal.manage",
    "legal.read",
    "finance.read",
    "finance.verify",
    "finance.export",
    "transparency.read",
    "unit.read_own",
    "data_health.read",
    "data_health.manage",
    "audit.read",
  ],
  treasurer: [
    "documents.manage",
    "documents.read",
    "projects.read",
    "legal.read",
    "finance.read",
    "finance.write",
    "finance.post",
    "finance.reconcile",
    "finance.verify",
    "finance.export",
    "transparency.read",
    "unit.read_own",
    "data_health.read",
    "data_health.manage",
    "import.csv",
    "audit.read",
  ],
  property_manager: [
    "community.buildings.manage",
    "documents.manage",
    "documents.read",
    "projects.manage",
    "projects.read",
    "legal.manage",
    "legal.read",
    "finance.read",
    "transparency.read",
    "unit.read_own",
    "data_health.read",
    "data_health.manage",
    "import.csv",
  ],
  owner: [
    "documents.read",
    "projects.read",
    "legal.read",
    "finance.read",
    "transparency.read",
    "unit.read_own",
    "data_health.read",
  ],
  auditor: [
    "documents.read",
    "projects.read",
    "legal.read",
    "finance.read",
    "finance.export",
    "transparency.read",
    "data_health.read",
    "audit.read",
  ],
};

export function capabilitiesForRoles(roles: RoleCode[]): Set<Capability> {
  const set = new Set<Capability>();
  for (const role of roles) {
    for (const cap of roleCapabilityMap[role] ?? []) {
      set.add(cap);
    }
  }
  return set;
}

export function can(
  caps: Set<Capability> | Capability[],
  capability: Capability,
): boolean {
  if (caps instanceof Set) return caps.has(capability);
  return caps.includes(capability);
}

export class AuthorizationError extends Error {
  constructor(capability: Capability) {
    super(`Not authorized for capability: ${capability}`);
    this.name = "AuthorizationError";
  }
}

export function assertCan(
  caps: Set<Capability>,
  capability: Capability,
): void {
  if (!caps.has(capability)) {
    throw new AuthorizationError(capability);
  }
}

export type TenantContext = {
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  communityId: string;
  roles: RoleCode[];
  capabilities: Set<Capability>;
  isPlatformAdmin: boolean;
  unitIds: string[];
};

export function assertSameTenant(
  ctx: TenantContext,
  organizationId: string,
  communityId?: string | null,
): void {
  if (ctx.organizationId !== organizationId) {
    throw new AuthorizationError("transparency.read");
  }
  if (communityId != null && ctx.communityId !== communityId) {
    throw new AuthorizationError("transparency.read");
  }
}
