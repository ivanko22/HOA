import {
  boolean,
  date,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  accountTypeEnum,
  chargeStatusEnum,
  journalStatusEnum,
  paymentMethodEnum,
  verificationStatusEnum,
} from "./enums";
import { communities, organizations, users } from "./tenancy";
import { units } from "./physical";
import { provenanceRecords } from "./provenance";

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: accountTypeEnum("type").notNull(),
    isReserve: boolean("is_reserve").notNull().default(false),
    parentAccountId: uuid("parent_account_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("accounts_community_code").on(t.communityId, t.code)],
);

export const financialPeriods = pgTable("financial_periods", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  name: text("name").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isClosed: boolean("is_closed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const vendors = pgTable("vendors", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  name: text("name").notNull(),
  category: text("category"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const journalEntries = pgTable("journal_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  periodId: uuid("period_id")
    .notNull()
    .references(() => financialPeriods.id),
  entryDate: date("entry_date").notNull(),
  memo: text("memo"),
  status: journalStatusEnum("status").notNull().default("draft"),
  reversesEntryId: uuid("reverses_entry_id"),
  provenanceId: uuid("provenance_id").references(() => provenanceRecords.id),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  postedBy: uuid("posted_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const journalLines = pgTable("journal_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  journalEntryId: uuid("journal_entry_id")
    .notNull()
    .references(() => journalEntries.id),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  debit: numeric("debit", { precision: 14, scale: 2 }).notNull().default("0"),
  credit: numeric("credit", { precision: 14, scale: 2 }).notNull().default("0"),
  memo: text("memo"),
  unitId: uuid("unit_id").references(() => units.id),
  vendorId: uuid("vendor_id").references(() => vendors.id),
  projectId: uuid("project_id"),
  legalCaseId: uuid("legal_case_id"),
});

export const bankAccounts = pgTable("bank_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  name: text("name").notNull(),
  institution: text("institution"),
  lastFour: text("last_four"),
  balance: numeric("balance", { precision: 14, scale: 2 }),
  balanceStatus: verificationStatusEnum("balance_status")
    .notNull()
    .default("unknown"),
  balanceAsOf: date("balance_as_of"),
  provenanceId: uuid("provenance_id").references(() => provenanceRecords.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const reconciliations = pgTable("reconciliations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  bankAccountId: uuid("bank_account_id")
    .notNull()
    .references(() => bankAccounts.id),
  periodId: uuid("period_id")
    .notNull()
    .references(() => financialPeriods.id),
  statementBalance: numeric("statement_balance", { precision: 14, scale: 2 }),
  statementBalanceStatus: verificationStatusEnum("statement_balance_status")
    .notNull()
    .default("unknown"),
  bookBalance: numeric("book_balance", { precision: 14, scale: 2 }),
  status: text("status").notNull().default("open"),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
  reconciledBy: uuid("reconciled_by").references(() => users.id),
  provenanceId: uuid("provenance_id").references(() => provenanceRecords.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const bankTransactions = pgTable("bank_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  bankAccountId: uuid("bank_account_id")
    .notNull()
    .references(() => bankAccounts.id),
  postedDate: date("posted_date").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  description: text("description").notNull(),
  externalId: text("external_id"),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id),
  reconciliationId: uuid("reconciliation_id").references(
    () => reconciliations.id,
  ),
  verificationStatus: verificationStatusEnum("verification_status")
    .notNull()
    .default("needs_review"),
  provenanceId: uuid("provenance_id").references(() => provenanceRecords.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const assessments = pgTable("assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  name: text("name").notNull(),
  assessmentType: text("assessment_type").notNull().default("regular"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }),
  totalAmountStatus: verificationStatusEnum("total_amount_status")
    .notNull()
    .default("unknown"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  provenanceId: uuid("provenance_id").references(() => provenanceRecords.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const charges = pgTable("charges", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id),
  assessmentId: uuid("assessment_id").references(() => assessments.id),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }),
  amountStatus: verificationStatusEnum("amount_status")
    .notNull()
    .default("unknown"),
  dueDate: date("due_date"),
  status: chargeStatusEnum("status").notNull().default("pending"),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id),
  provenanceId: uuid("provenance_id").references(() => provenanceRecords.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  unitId: uuid("unit_id").references(() => units.id),
  amount: numeric("amount", { precision: 14, scale: 2 }),
  amountStatus: verificationStatusEnum("amount_status")
    .notNull()
    .default("unknown"),
  paymentDate: date("payment_date").notNull(),
  method: paymentMethodEnum("method").notNull().default("unknown"),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id),
  provenanceId: uuid("provenance_id").references(() => provenanceRecords.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const paymentAllocations = pgTable("payment_allocations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => payments.id),
  chargeId: uuid("charge_id")
    .notNull()
    .references(() => charges.id),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  vendorId: uuid("vendor_id")
    .notNull()
    .references(() => vendors.id),
  invoiceNumber: text("invoice_number").notNull(),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date"),
  amount: numeric("amount", { precision: 14, scale: 2 }),
  amountStatus: verificationStatusEnum("amount_status")
    .notNull()
    .default("unknown"),
  status: text("status").notNull().default("open"),
  projectId: uuid("project_id"),
  legalCaseId: uuid("legal_case_id"),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id),
  provenanceId: uuid("provenance_id").references(() => provenanceRecords.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const budgets = pgTable("budgets", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  periodId: uuid("period_id")
    .notNull()
    .references(() => financialPeriods.id),
  name: text("name").notNull(),
  provenanceId: uuid("provenance_id").references(() => provenanceRecords.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const budgetLines = pgTable("budget_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  budgetId: uuid("budget_id")
    .notNull()
    .references(() => budgets.id),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  amount: numeric("amount", { precision: 14, scale: 2 }),
  amountStatus: verificationStatusEnum("amount_status")
    .notNull()
    .default("unknown"),
  memo: text("memo"),
});

export const ownerLedgerEntries = pgTable("owner_ledger_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id),
  entryDate: date("entry_date").notNull(),
  description: text("description").notNull(),
  debit: numeric("debit", { precision: 14, scale: 2 }).notNull().default("0"),
  credit: numeric("credit", { precision: 14, scale: 2 }).notNull().default("0"),
  chargeId: uuid("charge_id").references(() => charges.id),
  paymentId: uuid("payment_id").references(() => payments.id),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id),
  verificationStatus: verificationStatusEnum("verification_status")
    .notNull()
    .default("reported"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
