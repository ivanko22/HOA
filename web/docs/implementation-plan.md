# Community OS — Implementation Plan

## Constraints

- Read-only transparency first; no real payment processing.
- Vertical slices; app runnable after each milestone.
- Seed The Willows with **only** known structural facts; financial/condition values default to `unknown` unless verified records are supplied.
- Small commits; protect accounting, authz, tenant isolation, audit.

## Milestone 0 — Docs (this set)

Deliverables:

- `docs/architecture.md`
- `docs/schema.md`
- `docs/permissions.md`
- `docs/accounting-model.md`
- `docs/implementation-plan.md`

## Milestone 1 — Scaffold

- Next.js App Router + TypeScript strict + Tailwind + shadcn/ui
- Project folders: `domain`, `repositories`, `services`, `components`, `app`
- Drizzle + PostgreSQL connection
- Vitest, Playwright, Storybook, PostHog stub, Zod
- Env example, README

**Exit:** `npm run dev` serves a shell layout.

## Milestone 2 — Schema & migrations

- Drizzle schema for all core tables (tenancy, physical, provenance, documents, accounting, projects, legal, data health, audit)
- Migrations generated and applied
- TenantContext types

**Exit:** empty DB migrates cleanly.

## Milestone 3 — Auth & RBAC

- Credentials auth (demo users)
- Session → memberships → capabilities
- `assertCan` / middleware helpers
- Unit tests for permission matrix

**Exit:** unauthorized access denied on a protected server action.

## Milestone 4 — Community / buildings / units

- Seed org + The Willows community, buildings, units
- Read APIs/services + Buildings list/detail UI
- Conditions explicitly `unknown`

**Exit:** Buildings page renders with unknown badges.

## Milestone 5 — Documents + provenance

- Document repository UI (list/filter)
- Provenance helpers + status badge design system
- Storybook stories for badges / KPI card

**Exit:** documents list + linked entity stubs.

## Milestone 6 — Accounting schema services

- Chart of accounts, periods, journals with balance invariant
- Domain tests: reject unbalanced post; reverse entry path
- Read models for KPIs (null-safe)

**Exit:** posting unbalanced journal fails tests.

## Milestone 7 — Financial Health dashboard

- KPI cards with period + verification + last verified
- Charts (Recharts) with drill-down routes to record tables
- Empty/unknown states first-class

**Exit:** dashboard loads for Willows with honest unknown/partial data.

## Milestone 8 — Data Health

- `data_health_checks` seeded (minutes by year, AR/AP, loan, inspection)
- Completeness score + always-visible gap list

**Exit:** Data Health page.

## Milestone 9 — Projects & Legal

- Capital projects CRUD read + detail
- Legal cases list/detail with expense vs recovery fields (status-aware)

**Exit:** both pages navigable.

## Milestone 10 — Audit log

- Append-only writer used by mutating services
- Read UI for `audit.read`

**Exit:** seed/import actions appear in audit.

## Milestone 11 — CSV import

- Import bank transactions / charges as `needs_review`
- Dry-run validation with Zod
- No silent verified posts

**Exit:** sample CSV importable.

## Milestone 12 — Tests & polish

- Vitest domain + permission + KPI aggregation
- Playwright smoke: login → dashboard → data health → buildings
- Seed script idempotent
- README for local Willows demo

## Seed policy (The Willows)

Known without external docs (product brief only):

- Organization / community name: The Willows Condominium Association
- Location: Tulsa, Oklahoma
- Timezone: America/Chicago

**Everything else** (balances, dues amounts, building conditions, loan status, legal figures) is seeded as `unknown` / `missing` / empty until verified records are provided. Placeholder buildings/units may exist as structural demo scaffolding labeled clearly as unverified structure if counts are unknown — prefer fewer invented rows: e.g. “Building structure not yet verified” data-health items rather than fake unit rosters.

If demo UX requires sample charts, use a clearly separated **demo fixture flag** (`verification_status = estimated` or a `is_demo_fixture` mark) — never labeled verified.

## Risk watchlist

| Risk | Mitigation |
|------|------------|
| COALESCE null→0 | Central money helpers; lint/tests |
| Client tenant IDs | Session-derived TenantContext only |
| Scope creep payments | Explicit non-goal until later phase |
| Over-abstraction | No extra packages until second consumer |

## Build order reminder

1. Architecture & schema docs  
2. Migrations  
3. Authz  
4. Community model  
5. Documents  
6. Provenance  
7. Accounting  
8. Financial dashboard  
9. Data health  
10. Buildings  
11. Projects  
12. Legal  
13. Audit  
14. CSV import  
15. Tests & seed  
