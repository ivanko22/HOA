# Community OS

Multi-tenant HOA / condominium financial transparency and community management platform.

First deployment target: **The Willows Condominium Association** (Tulsa, OK). The architecture is tenant-agnostic.

## Principles

- Unknown is not zero
- Estimates are never presented as accounting facts
- Every important financial value is traceable to its source
- Double-entry journals are the books of record
- Authorization is enforced server-side

See `docs/` for architecture, schema, permissions, accounting model, and implementation plan.

## Stack

Next.js (App Router) · React · TypeScript · PostgreSQL · Drizzle ORM · Tailwind · shadcn-style UI · Recharts · Storybook · PostHog · Zod · Vitest · Playwright

## Setup

```bash
# PostgreSQL (example)
# DATABASE_URL=postgres://community_os:community_os@localhost:5432/community_os

cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo users

Password: `willows-demo` (or `DEMO_PASSWORD`)

| Email | Role |
|-------|------|
| admin@community-os.local | Platform + community admin |
| treasurer@willows.local | Treasurer |
| board@willows.local | Board member |
| owner@willows.local | Owner |
| auditor@willows.local | Auditor |

Seed data only marks Willows name/location as known. Bank balances, dues, building conditions, loans, and legal figures are explicitly **unknown** / **missing** until verified records are supplied.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed Willows demo |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright smoke |
| `npm run storybook` | Component workshop |

## CSV import

Sample file: `fixtures/sample-bank.csv`. Imports create `needs_review` bank transactions only — they do not post verified journals.
