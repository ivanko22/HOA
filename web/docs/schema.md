# Community OS — Database Schema

PostgreSQL via Drizzle ORM. All tenant-owned tables include `organization_id` (and usually `community_id`). Timestamps are `timestamptz`. Soft deletes are avoided for financial history; use status / reversing entries instead.

## Enums

```
verification_status: verified | reported | estimated | needs_review | conflicting | unknown
role_code: platform_admin | community_admin | board_member | treasurer | property_manager | owner | auditor
document_category: meeting_minutes | financial_statement | bank_statement | invoice | insurance | contract | legal | inspection | quote | other
project_status: proposed | approved | in_progress | completed | cancelled | on_hold
project_priority: low | medium | high | critical
legal_case_status: open | pending | settled | dismissed | closed
account_type: asset | liability | equity | revenue | expense
journal_status: draft | posted | reversed
charge_status: pending | posted | partially_paid | paid | waived | written_off
payment_method: check | ach | card | cash | wire | other | unknown
ownership_status: current | former | unknown
building_condition: good | fair | poor | critical | unknown
data_health_status: available | missing | needs_reconciliation | pending | unknown
```

## Identity & tenancy

### organizations
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | |
| slug | text unique | |
| created_at / updated_at | timestamptz | |

### communities
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid FK | |
| name | text | |
| slug | text | unique per org |
| timezone | text | e.g. America/Chicago |
| address_line1, city, region, postal_code, country | text | |
| created_at / updated_at | timestamptz | |

### users
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| email | text unique | |
| name | text | |
| password_hash | text | nullable for future SSO |
| is_platform_admin | boolean | default false |
| created_at / updated_at | timestamptz | |

### memberships
User ↔ community role assignment.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid FK | |
| community_id | uuid FK | |
| user_id | uuid FK | |
| role | role_code | |
| unit_id | uuid FK nullable | owner unit association |
| created_at / updated_at | timestamptz | |

Unique: `(community_id, user_id, role)`.

## Physical model

### buildings
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id / community_id | uuid | |
| name | text | e.g. Building A |
| code | text | short code |
| unit_count | int nullable | unknown if null |
| year_built | int nullable | |
| roof_condition, stairwell_condition, siding_condition, balcony_condition, water_intrusion_status, electrical_status, insurance_issue_status | building_condition | default `unknown` |
| notes | text | |
| created_at / updated_at | timestamptz | |

Condition fields default to `unknown` — never invent values.

### units
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id / community_id / building_id | uuid | |
| unit_number | text | |
| bedrooms / bathrooms / sq_ft | numeric nullable | |
| created_at / updated_at | timestamptz | |

### unit_owners
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id / community_id / unit_id | uuid | |
| user_id | uuid nullable | linked account |
| display_name | text | |
| status | ownership_status | |
| owned_from / owned_to | date nullable | |
| created_at / updated_at | timestamptz | |

## Provenance (reusable)

### provenance_records
Attached by FK from facts that need source tracing, or embedded columns on high-volume tables.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id / community_id | uuid | |
| source_document_id | uuid nullable | |
| source_page | text nullable | |
| source_reference | text nullable | |
| source_excerpt | text nullable | |
| verification_status | verification_status | |
| confidence | numeric(3,2) nullable | 0–1 |
| entered_by | uuid nullable | user |
| verified_by | uuid nullable | |
| verified_at | timestamptz nullable | |
| notes | text | |
| created_at / updated_at | timestamptz | |

Financial value columns that may be incomplete use companion status fields (e.g. `amount` nullable + `amount_status`) so `unknown` is never coerced to `0`.

## Documents

### documents
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id / community_id | uuid | |
| category | document_category | |
| title | text | |
| description | text | |
| storage_key | text | object storage path |
| mime_type | text | |
| byte_size | int | |
| document_date | date nullable | |
| tags | text[] | |
| uploaded_by | uuid | |
| created_at / updated_at | timestamptz | |

### document_links
Polymorphic relations.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id / community_id | uuid | |
| document_id | uuid FK | |
| entity_type | text | community, building, unit, vendor, expense, project, legal_case, meeting, journal_entry, … |
| entity_id | uuid | |
| created_at | timestamptz | |

### document_extractions (future-ready)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| document_id | uuid FK | |
| field_path | text | |
| raw_value | text | |
| parsed_value | jsonb | |
| verification_status | verification_status | default `needs_review` |
| verified_by / verified_at | | |
| created_at | timestamptz | |

Extractions are never authoritative until verified and posted through normal accounting paths.

## Accounting

### chart_of_accounts / accounts
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id / community_id | uuid | |
| code | text | |
| name | text | |
| type | account_type | |
| is_reserve | boolean | |
| parent_account_id | uuid nullable | |
| is_active | boolean | |
| created_at / updated_at | timestamptz | |

### financial_periods
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id / community_id | uuid | |
| name | text | e.g. FY 2025 |
| start_date / end_date | date | |
| is_closed | boolean | |
| created_at / updated_at | timestamptz | |

### journal_entries
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id / community_id | uuid | |
| period_id | uuid FK | |
| entry_date | date | |
| memo | text | |
| status | journal_status | |
| reverses_entry_id | uuid nullable | |
| provenance_id | uuid nullable | |
| posted_at / posted_by | | |
| created_at / updated_at | timestamptz | |

### journal_lines
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id / community_id | uuid | |
| journal_entry_id | uuid FK | |
| account_id | uuid FK | |
| debit | numeric(14,2) | default 0 |
| credit | numeric(14,2) | default 0 |
| memo | text | |
| unit_id / vendor_id / project_id / legal_case_id | uuid nullable | dimensions |

Constraint: for posted entries, sum(debit) = sum(credit). Application enforces before post; optional deferred constraint/trigger.

### bank_accounts
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id / community_id | uuid | |
| account_id | uuid FK | GL link |
| name | text | |
| institution | text | |
| last_four | text nullable | |
| balance | numeric(14,2) nullable | |
| balance_status | verification_status | |
| balance_as_of | date nullable | |
| provenance_id | uuid nullable | |
| created_at / updated_at | timestamptz | |

### bank_transactions
Imported/statement lines; may link to journal entries after reconciliation.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| bank_account_id | uuid | |
| posted_date | date | |
| amount | numeric(14,2) | |
| description | text | |
| external_id | text nullable | |
| journal_entry_id | uuid nullable | |
| reconciliation_id | uuid nullable | |
| verification_status | verification_status | |
| provenance_id | uuid nullable | |

### vendors
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id / community_id | uuid | |
| name | text | |
| category | text nullable | |
| created_at / updated_at | timestamptz | |

### charges (owner assessments / dues)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id / community_id | uuid | |
| unit_id | uuid | |
| assessment_id | uuid nullable | |
| description | text | |
| amount | numeric(14,2) | |
| amount_status | verification_status | |
| due_date | date nullable | |
| status | charge_status | |
| journal_entry_id | uuid nullable | |
| provenance_id | uuid nullable | |

### assessments
Special or regular assessment definitions.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id / community_id | uuid | |
| name | text | |
| assessment_type | text | regular, special, … |
| total_amount | numeric nullable | |
| total_amount_status | verification_status | |
| start_date / end_date | date nullable | |
| provenance_id | uuid nullable | |

### payments
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id / community_id | uuid | |
| unit_id | uuid nullable | |
| amount | numeric(14,2) | |
| amount_status | verification_status | |
| payment_date | date | |
| method | payment_method | |
| journal_entry_id | uuid nullable | |
| provenance_id | uuid nullable | |

### payment_allocations
Payment → charge applications.

### invoices (AP)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id / community_id | uuid | |
| vendor_id | uuid | |
| invoice_number | text | |
| invoice_date / due_date | date | |
| amount | numeric(14,2) | |
| amount_status | verification_status | |
| status | text | |
| project_id / legal_case_id | uuid nullable | |
| journal_entry_id | uuid nullable | |
| provenance_id | uuid nullable | |

### owner_ledger_entries
Materialized presentation of owner AR activity (derived from charges/payments/journals). Stored for query performance; regenerable.

### budgets / budget_lines
Period budgets with amount + verification_status per line.

### reconciliations
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| bank_account_id | uuid | |
| period_id | uuid | |
| statement_balance | numeric nullable | |
| statement_balance_status | verification_status | |
| book_balance | numeric nullable | |
| status | text | open, completed, needs_review |
| reconciled_at / reconciled_by | | |
| provenance_id | uuid nullable | |

## Buildings ops & capital

### capital_projects
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id / community_id / building_id | uuid | building optional for community-wide |
| name | text | |
| category | text | |
| priority | project_priority | |
| status | project_status | |
| estimated_cost | numeric nullable | |
| estimated_cost_status | verification_status | |
| approved_budget | numeric nullable | |
| approved_budget_status | verification_status | |
| actual_cost | numeric nullable | |
| actual_cost_status | verification_status | |
| funding_source | text nullable | |
| vendor_id | uuid nullable | |
| completion_date | date nullable | |
| provenance_id | uuid nullable | |

### building_inspections / maintenance_events
Linked to buildings with condition outcomes and provenance.

## Legal

### legal_cases
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id / community_id | uuid | |
| case_number | text | |
| court | text nullable | |
| unit_id / owner_display | | |
| attorney | text nullable | |
| original_balance | numeric nullable | |
| original_balance_status | verification_status | |
| claimed_balance | numeric nullable | |
| claimed_balance_status | verification_status | |
| legal_expenses | numeric nullable | |
| legal_expenses_status | verification_status | |
| recovery | numeric nullable | |
| recovery_status | verification_status | |
| status | legal_case_status | |
| filing_date / resolution_date | date nullable | |
| provenance_id | uuid nullable | |

## Data health

### data_health_checks
Catalog of expected records (e.g. “2024 Meeting Minutes”).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id / community_id | uuid | |
| year | int nullable | |
| category | text | |
| label | text | |
| status | data_health_status | |
| related_entity_type / related_entity_id | nullable | |
| notes | text | |
| last_evaluated_at | timestamptz | |

Overall completeness score is computed in the service layer from these rows; the UI always lists underlying gaps.

## Audit

### audit_events (append-only)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| organization_id | uuid nullable | platform events may omit community |
| community_id | uuid nullable | |
| actor_user_id | uuid nullable | |
| action | text | |
| entity_type | text | |
| entity_id | uuid nullable | |
| before | jsonb | |
| after | jsonb | |
| ip | text nullable | |
| session_id | text nullable | |
| created_at | timestamptz | no updated_at |

No UPDATE/DELETE grants for application role on this table (enforced in app + optional DB grants).

## Indexing (high level)

- All FK columns used in tenant filters: `(organization_id, community_id, …)`
- Journal lines by entry and account
- Document links by `(entity_type, entity_id)`
- Audit by community + created_at
- Unique natural keys where useful (community slug per org, unit number per building, account code per community)

## Money representation

`numeric(14,2)` for currency. Application layer uses decimal-safe types (string/Decimal). Never float for money.
