# Community OS — Permissions

## Principles

1. **Authorization is server-side.** Client-supplied organization/community IDs are never trusted as authority.
2. **Permissions ≠ UI visibility.** Hide controls in the UI for UX; enforce capabilities in services.
3. **Least privilege.** Default deny; grant explicitly.
4. **Tenant isolation.** All community data access requires an active membership (or platform admin).

## Roles

| Role | Scope | Intent |
|------|-------|--------|
| `platform_admin` | Global | Operate the SaaS; manage orgs |
| `community_admin` | Community | Full community configuration |
| `board_member` | Community | Governance visibility & limited edits |
| `treasurer` | Community | Financial stewardship |
| `property_manager` | Community | Ops, documents, projects |
| `owner` | Community (+ unit) | Own unit transparency |
| `auditor` | Community | Read-only financial/compliance |

A user may hold multiple roles in a community via `memberships`.

## Capability catalog

Capabilities are stable string codes evaluated by `authorize(ctx, capability, resource)`.

### Platform

| Capability | Description |
|------------|-------------|
| `platform.orgs.manage` | Create/update organizations |
| `platform.users.impersonate` | Support access (audited) |

### Community admin

| Capability | Description |
|------------|-------------|
| `community.settings.manage` | Community profile, periods |
| `community.members.manage` | Invite/assign roles |
| `community.buildings.manage` | Buildings/units CRUD |
| `documents.manage` | Upload/edit/delete documents |
| `projects.manage` | Capital projects CRUD |
| `legal.manage` | Legal cases CRUD |
| `data_health.manage` | Update data-health checks |
| `import.csv` | Run CSV imports |

### Financial

| Capability | Description |
|------------|-------------|
| `finance.read` | View financial dashboards & ledgers |
| `finance.write` | Create draft journals, charges, invoices |
| `finance.post` | Post journals (immutable thereafter) |
| `finance.reconcile` | Bank reconciliations |
| `finance.verify` | Mark facts verified |
| `finance.export` | Export financial CSVs |

### Owner / read

| Capability | Description |
|------------|-------------|
| `transparency.read` | Community financial health (aggregated) |
| `unit.read_own` | Own unit ledger & documents |
| `documents.read` | Read non-restricted documents |
| `buildings.read` | Building transparency |
| `projects.read` | Capital projects |
| `legal.read` | Legal case summaries (PII-minimized for owners) |
| `audit.read` | Audit log |
| `data_health.read` | Data completeness |

## Role → capability matrix (v1)

| Capability | Platform | Comm Admin | Board | Treasurer | Prop Mgr | Owner | Auditor |
|------------|:--------:|:----------:|:-----:|:---------:|:--------:|:-----:|:-------:|
| platform.* | ✓ | | | | | | |
| community.settings.manage | ✓ | ✓ | | | | | |
| community.members.manage | ✓ | ✓ | | | | | |
| community.buildings.manage | ✓ | ✓ | | | ✓ | | |
| documents.manage | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| documents.read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ |
| projects.manage | ✓ | ✓ | ✓ | | ✓ | | |
| projects.read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| legal.manage | ✓ | ✓ | ✓ | | ✓ | | |
| legal.read | ✓ | ✓ | ✓ | ✓ | ✓ | limited | ✓ |
| finance.read | ✓ | ✓ | ✓ | ✓ | ✓ | aggregated | ✓ |
| finance.write | ✓ | ✓ | | ✓ | | | |
| finance.post | ✓ | ✓ | | ✓ | | | |
| finance.reconcile | ✓ | ✓ | | ✓ | | | |
| finance.verify | ✓ | ✓ | ✓ | ✓ | | | |
| finance.export | ✓ | ✓ | ✓ | ✓ | | | ✓ |
| transparency.read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| unit.read_own | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| data_health.read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| data_health.manage | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| import.csv | ✓ | ✓ | | ✓ | ✓ | | |
| audit.read | ✓ | ✓ | ✓ | ✓ | | | ✓ |

\* Owners may be restricted from confidential legal/board packets via document ACL flags (future). v1: community-published docs only.

## Enforcement pattern

```ts
// services always receive TenantContext from session
type TenantContext = {
  userId: string;
  organizationId: string;
  communityId: string;
  roles: RoleCode[];
  capabilities: Set<Capability>;
};

assertCan(ctx, "finance.post");
assertSameTenant(ctx, row.organizationId, row.communityId);
```

UI uses `can(capability)` only to show/hide. Missing UI never means missing enforcement.

## Privacy notes

- Owner PII (email, phone) visible to board/treasurer/manager/admin; owners see their own.
- Legal cases: owners see their own case; others see aggregates unless elevated role.
- Audit log may contain before/after snapshots — restrict to `audit.read`.

## Session resolution

1. Authenticate user.
2. Resolve active community from session/cookie (server-set).
3. Load memberships for that community.
4. Expand roles → capabilities.
5. Platform admin bypasses community membership for read/manage but still selects a community context for data queries; actions are audited.
