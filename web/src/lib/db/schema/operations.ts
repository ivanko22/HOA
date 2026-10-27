import {
  date,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  dataHealthStatusEnum,
  legalCaseStatusEnum,
  projectPriorityEnum,
  projectStatusEnum,
  verificationStatusEnum,
} from "./enums";
import { communities, organizations } from "./tenancy";
import { buildings, units } from "./physical";
import { provenanceRecords } from "./provenance";
import { vendors } from "./accounting";

export const capitalProjects = pgTable("capital_projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  buildingId: uuid("building_id").references(() => buildings.id),
  name: text("name").notNull(),
  category: text("category"),
  priority: projectPriorityEnum("priority").notNull().default("medium"),
  status: projectStatusEnum("status").notNull().default("proposed"),
  estimatedCost: numeric("estimated_cost", { precision: 14, scale: 2 }),
  estimatedCostStatus: verificationStatusEnum("estimated_cost_status")
    .notNull()
    .default("unknown"),
  approvedBudget: numeric("approved_budget", { precision: 14, scale: 2 }),
  approvedBudgetStatus: verificationStatusEnum("approved_budget_status")
    .notNull()
    .default("unknown"),
  actualCost: numeric("actual_cost", { precision: 14, scale: 2 }),
  actualCostStatus: verificationStatusEnum("actual_cost_status")
    .notNull()
    .default("unknown"),
  fundingSource: text("funding_source"),
  vendorId: uuid("vendor_id").references(() => vendors.id),
  completionDate: date("completion_date"),
  notes: text("notes"),
  provenanceId: uuid("provenance_id").references(() => provenanceRecords.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const legalCases = pgTable("legal_cases", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  caseNumber: text("case_number").notNull(),
  court: text("court"),
  unitId: uuid("unit_id").references(() => units.id),
  ownerDisplay: text("owner_display"),
  attorney: text("attorney"),
  originalBalance: numeric("original_balance", { precision: 14, scale: 2 }),
  originalBalanceStatus: verificationStatusEnum("original_balance_status")
    .notNull()
    .default("unknown"),
  claimedBalance: numeric("claimed_balance", { precision: 14, scale: 2 }),
  claimedBalanceStatus: verificationStatusEnum("claimed_balance_status")
    .notNull()
    .default("unknown"),
  legalExpenses: numeric("legal_expenses", { precision: 14, scale: 2 }),
  legalExpensesStatus: verificationStatusEnum("legal_expenses_status")
    .notNull()
    .default("unknown"),
  recovery: numeric("recovery", { precision: 14, scale: 2 }),
  recoveryStatus: verificationStatusEnum("recovery_status")
    .notNull()
    .default("unknown"),
  status: legalCaseStatusEnum("status").notNull().default("open"),
  filingDate: date("filing_date"),
  resolutionDate: date("resolution_date"),
  notes: text("notes"),
  provenanceId: uuid("provenance_id").references(() => provenanceRecords.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const dataHealthChecks = pgTable("data_health_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  year: numeric("year", { precision: 4, scale: 0 }),
  category: text("category").notNull(),
  label: text("label").notNull(),
  status: dataHealthStatusEnum("status").notNull().default("unknown"),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: uuid("related_entity_id"),
  notes: text("notes"),
  lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id"),
  communityId: uuid("community_id"),
  actorUserId: uuid("actor_user_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  before: text("before"), // JSON string to keep simple; parsed in app
  after: text("after"),
  ip: text("ip"),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
