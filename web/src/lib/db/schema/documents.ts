import {
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  documentCategoryEnum,
  documentProcessingStatusEnum,
  verificationStatusEnum,
} from "./enums";
import { communities, organizations, users } from "./tenancy";
import { provenanceRecords } from "./provenance";

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  category: documentCategoryEnum("category").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  storageKey: text("storage_key").notNull(),
  originalFilename: text("original_filename"),
  mimeType: text("mime_type").notNull().default("application/pdf"),
  byteSize: integer("byte_size").notNull().default(0),
  documentDate: date("document_date"),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  processingStatus: documentProcessingStatusEnum("processing_status")
    .notNull()
    .default("source_only"),
  tags: text("tags").array().notNull().default([]),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const documentLinks = pgTable("document_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Staging for future AI extraction — never authoritative until promoted to facts. */
export const documentExtractions = pgTable("document_extractions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id),
  fieldPath: text("field_path").notNull(),
  rawValue: text("raw_value"),
  parsedValue: jsonb("parsed_value"),
  verificationStatus: verificationStatusEnum("verification_status")
    .notNull()
    .default("needs_review"),
  verifiedBy: uuid("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Reviewed claims derived from documents (manual entry now; AI later).
 * Multiple facts for the same metric/period are retained; conflicts are flagged.
 */
export const facts = pgTable("facts", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id),
  factType: text("fact_type").notNull(),
  label: text("label").notNull(),
  value: text("value"),
  numericValue: numeric("numeric_value", { precision: 14, scale: 2 }),
  unit: text("unit"),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  asOfDate: date("as_of_date"),
  sourcePage: text("source_page"),
  sourceReference: text("source_reference"),
  sourceExcerpt: text("source_excerpt"),
  verificationStatus: verificationStatusEnum("verification_status")
    .notNull()
    .default("needs_review"),
  confidence: numeric("confidence", { precision: 3, scale: 2 }),
  notes: text("notes"),
  provenanceId: uuid("provenance_id").references(() => provenanceRecords.id),
  createdBy: uuid("created_by").references(() => users.id),
  verifiedBy: uuid("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
