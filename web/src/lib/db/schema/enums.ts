import { pgEnum } from "drizzle-orm/pg-core";

export const verificationStatusEnum = pgEnum("verification_status", [
  "verified",
  "reported",
  "estimated",
  "needs_review",
  "conflicting",
  "unknown",
]);

export const roleCodeEnum = pgEnum("role_code", [
  "platform_admin",
  "community_admin",
  "board_member",
  "treasurer",
  "property_manager",
  "owner",
  "auditor",
]);

export const documentCategoryEnum = pgEnum("document_category", [
  "meeting_minutes",
  "financial_statement",
  "bank_statement",
  "invoice",
  "insurance",
  "contract",
  "legal",
  "inspection",
  "quote",
  "other",
]);

export const documentProcessingStatusEnum = pgEnum(
  "document_processing_status",
  [
    "processing",
    "needs_review",
    "source_only",
    "partially_verified",
    "verified",
  ],
);

export const accountTypeEnum = pgEnum("account_type", [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
]);

export const journalStatusEnum = pgEnum("journal_status", [
  "draft",
  "posted",
  "reversed",
]);

export const chargeStatusEnum = pgEnum("charge_status", [
  "pending",
  "posted",
  "partially_paid",
  "paid",
  "waived",
  "written_off",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "check",
  "ach",
  "card",
  "cash",
  "wire",
  "other",
  "unknown",
]);

export const ownershipStatusEnum = pgEnum("ownership_status", [
  "current",
  "former",
  "unknown",
]);

export const buildingConditionEnum = pgEnum("building_condition", [
  "good",
  "fair",
  "poor",
  "critical",
  "unknown",
]);

export const dataHealthStatusEnum = pgEnum("data_health_status", [
  "available",
  "missing",
  "needs_reconciliation",
  "pending",
  "unknown",
]);

export const projectStatusEnum = pgEnum("project_status", [
  "proposed",
  "approved",
  "in_progress",
  "completed",
  "cancelled",
  "on_hold",
]);

export const projectPriorityEnum = pgEnum("project_priority", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const legalCaseStatusEnum = pgEnum("legal_case_status", [
  "open",
  "pending",
  "settled",
  "dismissed",
  "closed",
]);
