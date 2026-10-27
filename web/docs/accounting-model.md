# Community OS — Accounting Model

## Core idea

Community OS uses **double-entry bookkeeping**. Operational records (charges, payments, invoices, bank transactions) exist to support workflows and drill-down, but the books of record are:

- `accounts` (chart of accounts)
- `journal_entries`
- `journal_lines`

Every posted journal entry must balance: **Σ debits = Σ credits**.

## Account types

| Type | Normal balance | Examples |
|------|----------------|----------|
| asset | debit | Operating cash, reserve cash, AR |
| liability | credit | AP, prepaid assessments, loans |
| equity | credit | Fund balances / reserves equity |
| revenue | credit | Dues income, interest, special assessments |
| expense | debit | Utilities, insurance, legal, maintenance |

Reserve vs operating is a **fund dimension** (`accounts.is_reserve` and/or separate cash accounts), not a separate accounting equation.

## Invariants

1. Posted journals are immutable. Corrections create a reversing entry (`reverses_entry_id`) and optionally a new correct entry.
2. Draft journals may be edited; posting validates balance and required provenance for material amounts.
3. Money fields that are unknown stay `NULL` with `*_status = unknown`. Display layer renders “Unknown”, never `$0.00`.
4. Estimates use `verification_status = estimated` and must be labeled in every KPI/chart tooltip.
5. Conflicting sources set `conflicting` and block auto-aggregation into “verified” KPIs unless explicitly scoped.

## Typical postings

### Owner dues billed

```
Dr Accounts Receivable
   Cr Dues Revenue
```

Source: assessment/charge schedule; provenance → board resolution or management report.

### Owner payment received

```
Dr Operating Cash
   Cr Accounts Receivable
```

Source: bank deposit / payment record.

### Vendor invoice (AP)

```
Dr Expense (or Capital Asset / Project WIP)
   Cr Accounts Payable
```

### Vendor payment

```
Dr Accounts Payable
   Cr Operating Cash
```

### Transfer to reserves

```
Dr Reserve Cash
   Cr Operating Cash
```
(Plus equity/fund transfers as community policy requires.)

## Operational entities → journals

| Entity | Role |
|--------|------|
| Charge | Creates AR; posts journal when posted |
| Payment | Applies cash; allocates to charges |
| Invoice | Creates AP; links vendor/project/legal |
| BankTransaction | Statement line; reconciles to journal |
| Assessment | Definition; spawns charges |
| OwnerLedger | Derived view of charge/payment activity |
| Budget / BudgetLine | Plan, not books |
| Reconciliation | Statement vs book proof |

## KPI derivation (Financial Health)

| KPI | Primary source | Notes |
|-----|----------------|-------|
| Cash | Sum of cash bank accounts / GL cash | Show status of least-certain component |
| Dues Collected | Posted payments tagged dues (period) | |
| Base Operating Expenses | Posted expense accounts, non-reserve | |
| Accounts Receivable | AR account balance | Aging from open charges |
| Accounts Payable | AP account balance | Aging from open invoices |
| Reserve Balance | Reserve cash / reserve equity | |
| Collection Rate | Collected ÷ Billed for period | If billed unknown → rate unknown |

Each KPI payload includes:

```ts
{
  value: number | null;
  currency: "USD";
  period: { start: string; end: string; label: string };
  verificationStatus: VerificationStatus;
  lastVerifiedAt: string | null;
  provenanceSummary?: string;
}
```

Aggregation rule for status: worst-wins among inputs (`conflicting` > `unknown` > `needs_review` > `estimated` > `reported` > `verified`), except null/unknown values exclude the numeric sum and force non-verified presentation.

## Drill-down

Charts and KPIs resolve to underlying `journal_lines` (and linked operational entities). Example legal spend path:

```
Legal expense account lines
  → vendor
  → invoices
  → payments
  → legal_case
  → unit
  → documents
```

## Periods & closing

`financial_periods` bound reporting. Closing a period blocks new posts into that period (treasurer/admin override audited).

## Import & AI

CSV import creates `reported` / `needs_review` rows. AI extractions write to `document_extractions` only. Neither posts verified journals without human `finance.verify` + `finance.post`.

## What we deliberately avoid

- Single-entry “payment row” ledgers as the system of record
- Overwriting historical amounts
- Coercing null → 0 in SQL `COALESCE` for financial KPIs without an explicit product decision and UI label
