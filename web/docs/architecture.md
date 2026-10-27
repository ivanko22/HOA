# Community OS — Architecture

## Purpose

Community OS is a multi-tenant SaaS platform for HOA and condominium financial transparency and community management. The first deployment serves The Willows Condominium Association (Tulsa, OK), but every layer is tenant-agnostic.

**Primary principle:** never silently convert missing information into zero; never present estimates as accounting facts; every important financial value must be traceable to its source.

## System shape

```
┌─────────────────────────────────────────────────────────────┐
│ Presentation (Next.js App Router, React, Tailwind, shadcn)  │
│  - Dashboards, tables, drill-downs, Storybook components    │
└────────────────────────────┬────────────────────────────────┘
                             │ Server Actions / Route Handlers
┌────────────────────────────▼────────────────────────────────┐
│ Application services                                        │
│  - Authorization, orchestration, DTO mapping, CSV import    │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│ Domain layer                                                │
│  - Financial invariants (balanced journals, provenance)     │
│  - Tenant scoping rules, verification semantics             │
│  - Pure TypeScript + Zod; no DB / React imports             │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│ Data access (Drizzle ORM + PostgreSQL)                      │
│  - Repositories scoped by organization/community            │
│  - Migrations, seeds                                        │
└─────────────────────────────────────────────────────────────┘
```

## Module layout

```
apps/web/                     # Next.js application
  app/                        # App Router routes (presentation + thin adapters)
  components/                 # UI primitives and feature views
  lib/
    auth/                     # Session, RBAC enforcement
    db/                       # Drizzle client, schema, migrations
    domain/                   # Pure domain types & invariants
    services/                 # Application services
    repositories/             # Data access
packages/                     # (reserved) shared packages if extracted later
docs/                         # Architecture & product docs
```

Layers must not skip downward: UI → services → repositories → DB. Domain code has no framework dependencies.

## Multi-tenancy

Hierarchy:

```
Organization
  └── Community
        ├── Building → Unit → Ownership / Membership
        ├── Accounts, Journals, Documents, Projects, Legal Cases
        └── Roles / Memberships (user ↔ community)
```

Rules:

1. Every tenant-owned row carries `organizationId` and, where applicable, `communityId`.
2. Server code resolves tenant context from the authenticated session, never from client-supplied IDs alone.
3. Repositories accept a `TenantContext` and apply mandatory filters.
4. Cross-tenant queries are platform-admin only and audited.

## Financial model (summary)

Double-entry bookkeeping: `Account`, `JournalEntry`, `JournalLine`. Operational artifacts (`Charge`, `Payment`, `Invoice`, bank `Transaction`) post balanced journals; they are not the books of record by themselves.

Corrections use reversing/correcting entries. Historical rows are immutable.

Full detail: [accounting-model.md](./accounting-model.md).

## Provenance & verification

Reusable `Provenance` / verification fields attach to financial facts and important community facts:

| Status        | Meaning                                      |
|---------------|----------------------------------------------|
| `verified`    | Confirmed against source documents           |
| `reported`    | Asserted by a party; not independently verified |
| `estimated`   | Approximation; not an accounting fact        |
| `needs_review`| Present but incomplete or inconsistent       |
| `conflicting` | Sources disagree                             |
| `unknown`     | No value; **must not render as zero**        |

`UNKNOWN IS NOT ZERO` is enforced in domain helpers and KPI serializers.

## Documents

Central document repository with typed categories, tags, uploader, and polymorphic relations (`document_links`). Extracted fields (future AI) land as `reported` / `needs_review` until human verification.

## Security

- Authentication: credentials + session cookies (Auth.js / NextAuth-compatible pattern).
- Authorization: capability-based permissions, evaluated server-side separately from UI visibility.
- Audit: append-only `audit_events` for mutations and sensitive reads where required.

See [permissions.md](./permissions.md).

## Observability

- PostHog for product analytics (feature flags / funnels).
- Structured server logs; audit trail for compliance.

## Non-goals (v1)

- Real ACH/card payment processing
- Replacing full management suites (Folio, etc.)
- AI extraction as authoritative source
- Mobile-native apps

## Tech stack

| Concern        | Choice                          |
|----------------|---------------------------------|
| UI             | Next.js (App Router), React, TS |
| Styling        | Tailwind CSS, shadcn/ui         |
| Charts         | Recharts                        |
| ORM            | Drizzle ORM                     |
| DB             | PostgreSQL                      |
| Validation     | Zod                             |
| Tests          | Vitest, Playwright              |
| Component docs | Storybook                       |
| Analytics      | PostHog                         |

## Quality bars

- TypeScript `strict`
- Every journal balances (domain invariant + DB check where practical)
- Tenant isolation covered by tests
- Seed data never invents verified financial facts
- App remains runnable after each milestone
