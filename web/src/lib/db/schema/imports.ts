import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { verificationStatusEnum } from "./enums";
import { communities, organizations, users } from "./tenancy";
import { documents } from "./documents";
import { units } from "./physical";
import { vendors } from "./accounting";

export const importSourceTypeEnum = pgEnum("import_source_type", [
  "generic_csv",
  "folio_csv",
  "bank_csv",
]);

export const importPipelineStatusEnum = pgEnum("import_pipeline_status", [
  "uploaded",
  "parsing",
  "needs_mapping",
  "needs_review",
  "partially_approved",
  "approved",
  "failed",
]);

export const importRowStatusEnum = pgEnum("import_row_status", [
  "needs_review",
  "invalid",
  "duplicate",
  "ready",
  "approved",
  "rejected",
]);

export const importClassificationEnum = pgEnum("import_classification", [
  "income",
  "expense",
  "transfer",
  "owner_payment",
  "assessment",
  "refund",
  "adjustment",
  "unknown",
]);

export const financialTransactionDirectionEnum = pgEnum(
  "financial_transaction_direction",
  ["inflow", "outflow", "unknown"],
);

export const financialTransactionStatusEnum = pgEnum(
  "financial_transaction_status",
  ["draft", "posted", "void"],
);

/** Saved column mapping profiles for reuse across imports. */
export const importProfiles = pgTable(
  "import_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id),
    name: text("name").notNull(),
    sourceType: importSourceTypeEnum("source_type").notNull(),
    /** Map of canonical field → source column header */
    mapping: jsonb("mapping")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("import_profiles_community_name").on(t.communityId, t.name),
  ],
);

export const importBatches = pgTable("import_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  documentId: uuid("document_id").references(() => documents.id),
  sourceType: importSourceTypeEnum("source_type")
    .notNull()
    .default("generic_csv"),
  originalFilename: text("original_filename").notNull(),
  storageProvider: text("storage_provider").notNull().default("local"),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type"),
  byteSize: integer("byte_size"),
  status: importPipelineStatusEnum("status").notNull().default("uploaded"),
  rowCount: integer("row_count").notNull().default(0),
  validRowCount: integer("valid_row_count").notNull().default(0),
  errorRowCount: integer("error_row_count").notNull().default(0),
  duplicateRowCount: integer("duplicate_row_count").notNull().default(0),
  detectedColumns: jsonb("detected_columns").$type<string[]>().default([]),
  mapping: jsonb("mapping").$type<Record<string, string>>().default({}),
  profileId: uuid("profile_id").references(() => importProfiles.id),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  errors: jsonb("errors").$type<unknown[]>().notNull().default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const importRows = pgTable("import_rows", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  batchId: uuid("batch_id")
    .notNull()
    .references(() => importBatches.id),
  rowNumber: integer("row_number").notNull(),
  /** Original CSV row as key/value JSON — never discarded. */
  raw: jsonb("raw").$type<Record<string, string>>().notNull(),
  /** Normalized canonical fields after mapping. */
  normalized: jsonb("normalized").$type<Record<string, unknown>>(),
  validationErrors: jsonb("validation_errors")
    .$type<string[]>()
    .notNull()
    .default([]),
  mappingStatus: text("mapping_status").notNull().default("unmapped"),
  status: importRowStatusEnum("status").notNull().default("needs_review"),
  classification: importClassificationEnum("classification")
    .notNull()
    .default("unknown"),
  duplicateFingerprint: text("duplicate_fingerprint"),
  isDuplicate: integer("is_duplicate").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Individual financial events from approved import rows (or manual entry later).
 * Distinct from Facts (reported/derived statements).
 */
export const financialTransactions = pgTable("financial_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  importRowId: uuid("import_row_id").references(() => importRows.id),
  importBatchId: uuid("import_batch_id").references(() => importBatches.id),
  sourceDocumentId: uuid("source_document_id").references(() => documents.id),
  transactionDate: text("transaction_date").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  direction: financialTransactionDirectionEnum("direction")
    .notNull()
    .default("unknown"),
  category: text("category"),
  classification: importClassificationEnum("classification")
    .notNull()
    .default("unknown"),
  vendorId: uuid("vendor_id").references(() => vendors.id),
  vendorName: text("vendor_name"),
  unitId: uuid("unit_id").references(() => units.id),
  ownerDisplay: text("owner_display"),
  externalId: text("external_id"),
  reference: text("reference"),
  status: financialTransactionStatusEnum("status").notNull().default("draft"),
  verificationStatus: verificationStatusEnum("verification_status")
    .notNull()
    .default("reported"),
  duplicateFingerprint: text("duplicate_fingerprint"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
