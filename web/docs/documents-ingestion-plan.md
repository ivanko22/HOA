# Documents Ingestion Milestone — Implementation Plan

## What already exists

- **Schema:** `documents`, `document_links`, `document_extractions`, `provenance_records`, verification enums, audit events, data-health checks.
- **Domain:** `verificationStatuses`, `documentCategories`, money helpers (`unknown ≠ 0`), RBAC (`documents.read` / `documents.manage` / `finance.verify`).
- **UI:** `/app/documents` catalog table (title/category/date/tags/size); `StatusBadge` for fact verification; Data Health + Financial Health shells.
- **Seed:** Placeholder meeting-minutes catalog rows + static data-health minutes rows (2024/2025/2026).
- **No** document detail route, upload storage, Fact model, or document-level processing status.

## What can be reused

| Existing | Reuse as |
|----------|----------|
| `documents` + `document_links` | Extend; keep polymorphic links |
| `document_extractions` | Staging for future AI only (never authoritative) |
| `provenance_records` + verification enum | Fact provenance fields; keep `StatusBadge` |
| `auditEvents` / `recordAudit` | Verification + upload history |
| `dataHealthChecks` + Data Health page | Meeting-minutes completeness section |
| Auth / `TenantContext` / permissions | Server-side enforcement on all mutations |
| Visual language (sidebar, tables, badges) | Extend; do not redesign |

Do **not** add a parallel repository layer unless a second consumer appears; keep services talking to Drizzle like the rest of the app.

## Schema changes required

1. **`document_processing_status` enum**  
   `processing | needs_review | source_only | partially_verified | verified`  
   (separate from fact `verification_status`)

2. **`documents` columns**  
   - `processing_status` (enum, default `source_only`)  
   - `period_start` / `period_end` (date, nullable)  
   - `original_filename` (text, nullable)

3. **`facts` table** (new source-of-truth for extracted/manual claims)  
   Fields per product spec: community/org scoping, `document_id`, `fact_type`, `label`, `value`, `numeric_value`, `unit`, period/as-of, source page/reference/excerpt, verification + confidence, notes, created/verified by/at, timestamps.  
   Optional `provenance_id` FK for shared provenance rows when useful.

4. **No destructive changes** to journals/accounting. Extractions stay non-authoritative.

## Routes / components to modify

| Area | Change |
|------|--------|
| `/app/documents` | Upload CTA, richer columns, filters, search; link to detail |
| `/app/documents/[id]` | **New** detail: metadata, file access, facts, links, verification/audit history, manual fact form |
| `/app/documents/actions.ts` | Server actions: upload, add fact, verify fact |
| `/api/documents/[id]/file` | Stream stored file (local disk for now) |
| `data-health` service + page | Meeting Minutes completeness by year; softer “Not currently available” copy |
| `financial-health` | Add `getFactsForMetric` boundary only — no full dashboard rewrite |
| Components | `DocumentStatusBadge`, `FactRow`, `SourceReference`, `DataCompletenessIndicator`; alias/keep `VerificationBadge` (= StatusBadge) |
| Seed | Replace placeholder docs with known Willows catalog + Oct 1 2026 reported facts |
| Storybook + Vitest | New stories; fact conflict/verification unit tests; document→fact integration test |

## Migration strategy

1. Generate additive Drizzle migration; apply locally.
2. Backfill existing `documents.processing_status = source_only` (migration default).
3. Idempotent seed update: upsert known Willows documents/facts; remove obsolete placeholder titles if present; refresh meeting-minutes data-health notes.
4. Local file storage under `storage/documents/{communityId}/` (gitignored); `storage_key` remains the path key.
5. Keep app runnable after migrate + seed; Financial Health continues to show Unknown until a later milestone consumes verified/reported facts.

## Non-goals this milestone

- AI extraction as authority  
- Full Financial Health wiring to KPIs  
- Redesign / new design system  
- Fabricating missing 2025 minutes or dollar balances  
