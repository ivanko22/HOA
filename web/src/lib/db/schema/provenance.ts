import {
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { verificationStatusEnum } from "./enums";
import { communities, organizations, users } from "./tenancy";

export const provenanceRecords = pgTable("provenance_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  sourceDocumentId: uuid("source_document_id"),
  sourcePage: text("source_page"),
  sourceReference: text("source_reference"),
  sourceExcerpt: text("source_excerpt"),
  verificationStatus: verificationStatusEnum("verification_status")
    .notNull()
    .default("unknown"),
  confidence: numeric("confidence", { precision: 3, scale: 2 }),
  enteredBy: uuid("entered_by").references(() => users.id),
  verifiedBy: uuid("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
