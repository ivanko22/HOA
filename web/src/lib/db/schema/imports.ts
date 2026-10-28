import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { communities, organizations, users } from "./tenancy";

/**
 * Prepared for future CSV / Folio / bank imports — not fully wired in this milestone.
 */
export const importBatchStatusEnum = pgEnum("import_batch_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "partial",
]);

export const importBatches = pgTable("import_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  sourceFilename: text("source_filename").notNull(),
  storageProvider: text("storage_provider").notNull().default("local"),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type"),
  byteSize: integer("byte_size"),
  importDate: timestamp("import_date", { withTimezone: true })
    .defaultNow()
    .notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  rowCount: integer("row_count").notNull().default(0),
  processingStatus: importBatchStatusEnum("processing_status")
    .notNull()
    .default("pending"),
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
  raw: jsonb("raw").notNull(),
  parsed: jsonb("parsed"),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
