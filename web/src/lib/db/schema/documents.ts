import {
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { documentCategoryEnum, verificationStatusEnum } from "./enums";
import { communities, organizations, users } from "./tenancy";

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
  mimeType: text("mime_type").notNull().default("application/pdf"),
  byteSize: integer("byte_size").notNull().default(0),
  documentDate: date("document_date"),
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
