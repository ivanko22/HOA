import { z } from "zod";

export const verificationStatuses = [
  "verified",
  "reported",
  "estimated",
  "needs_review",
  "conflicting",
  "unknown",
] as const;

export type VerificationStatus = (typeof verificationStatuses)[number];
export const verificationStatusSchema = z.enum(verificationStatuses);

/** Worst-wins ordering for aggregating verification across inputs. */
export const verificationSeverity: Record<VerificationStatus, number> = {
  verified: 0,
  reported: 1,
  estimated: 2,
  needs_review: 3,
  unknown: 4,
  conflicting: 5,
};

export function worstVerification(
  statuses: VerificationStatus[],
): VerificationStatus {
  if (statuses.length === 0) return "unknown";
  return statuses.reduce((worst, s) =>
    verificationSeverity[s] > verificationSeverity[worst] ? s : worst,
  );
}

export const roleCodes = [
  "platform_admin",
  "community_admin",
  "board_member",
  "treasurer",
  "property_manager",
  "owner",
  "auditor",
] as const;

export type RoleCode = (typeof roleCodes)[number];
export const roleCodeSchema = z.enum(roleCodes);

export const documentCategories = [
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
] as const;

export type DocumentCategory = (typeof documentCategories)[number];

export const accountTypes = [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
] as const;

export type AccountType = (typeof accountTypes)[number];

export const journalStatuses = ["draft", "posted", "reversed"] as const;
export type JournalStatus = (typeof journalStatuses)[number];

export const chargeStatuses = [
  "pending",
  "posted",
  "partially_paid",
  "paid",
  "waived",
  "written_off",
] as const;

export const paymentMethods = [
  "check",
  "ach",
  "card",
  "cash",
  "wire",
  "other",
  "unknown",
] as const;

export const ownershipStatuses = ["current", "former", "unknown"] as const;

export const buildingConditions = [
  "good",
  "fair",
  "poor",
  "critical",
  "unknown",
] as const;

export type BuildingCondition = (typeof buildingConditions)[number];

export const dataHealthStatuses = [
  "available",
  "missing",
  "needs_reconciliation",
  "pending",
  "unknown",
] as const;

export type DataHealthStatus = (typeof dataHealthStatuses)[number];

export const projectStatuses = [
  "proposed",
  "approved",
  "in_progress",
  "completed",
  "cancelled",
  "on_hold",
] as const;

export const projectPriorities = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

export const legalCaseStatuses = [
  "open",
  "pending",
  "settled",
  "dismissed",
  "closed",
] as const;
