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
import { documentCategoryEnum } from "./enums";
import { communities, organizations, users } from "./tenancy";
import { documents } from "./documents";

export const externalSourceProviderEnum = pgEnum("external_source_provider", [
  "google_drive",
]);

export const externalSourceStatusEnum = pgEnum("external_source_status", [
  "active",
  "paused",
  "error",
]);

export const externalFileSyncStatusEnum = pgEnum("external_file_sync_status", [
  "discovered",
  "downloaded",
  "linked",
  "skipped",
  "unchanged",
  "error",
]);

export const externalSyncRunStatusEnum = pgEnum("external_sync_run_status", [
  "running",
  "completed",
  "failed",
  "needs_credentials",
]);

/** External connection (e.g. a Google Drive folder) for a community. */
export const externalSources = pgTable(
  "external_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id),
    provider: externalSourceProviderEnum("provider").notNull(),
    name: text("name").notNull(),
    status: externalSourceStatusEnum("status").notNull().default("active"),
    /** Provider-specific config: folderId, folderUrl, etc. */
    config: jsonb("config")
      .$type<{
        folderId?: string;
        folderUrl?: string;
        folderName?: string;
      }>()
      .notNull()
      .default({}),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncStatus: text("last_sync_status"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("external_sources_community_provider_name").on(
      t.communityId,
      t.provider,
      t.name,
    ),
  ],
);

/** One sync execution with validation report payload. */
export const externalSyncRuns = pgTable("external_sync_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => externalSources.id),
  status: externalSyncRunStatusEnum("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  startedBy: uuid("started_by").references(() => users.id),
  missingCredentials: jsonb("missing_credentials").$type<string[]>().default([]),
  /** Full post-sync validation report. */
  report: jsonb("report").$type<Record<string, unknown>>().default({}),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Mirrored remote file listing (Drive file → optional Community OS document). */
export const externalSourceFiles = pgTable(
  "external_source_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => externalSources.id),
    externalFileId: text("external_file_id").notNull(),
    parentExternalId: text("parent_external_id"),
    name: text("name").notNull(),
    mimeType: text("mime_type"),
    path: text("path").notNull().default("/"),
    modifiedTime: timestamp("modified_time", { withTimezone: true }),
    sizeBytes: integer("size_bytes"),
    md5Checksum: text("md5_checksum"),
    version: text("version"),
    webViewLink: text("web_view_link"),
    isFolder: integer("is_folder").notNull().default(0),
    syncStatus: externalFileSyncStatusEnum("sync_status")
      .notNull()
      .default("discovered"),
    syncError: text("sync_error"),
    /** Human classification label (Meeting Minutes, General Ledger, …). */
    classificationLabel: text("classification_label"),
    mappedCategory: documentCategoryEnum("mapped_category"),
    documentId: uuid("document_id").references(() => documents.id),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSyncRunId: uuid("last_sync_run_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("external_source_files_source_external").on(
      t.sourceId,
      t.externalFileId,
    ),
    index("external_source_files_document").on(t.documentId),
  ],
);

/** Immutable snapshot of document bytes (Drive sync versions). */
export const documentVersions = pgTable(
  "document_versions",
  {
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
    version: integer("version").notNull(),
    storageProvider: text("storage_provider").notNull(),
    storageKey: text("storage_key").notNull(),
    originalFilename: text("original_filename"),
    mimeType: text("mime_type"),
    byteSize: integer("byte_size").notNull().default(0),
    contentHash: text("content_hash").notNull(),
    externalSourceFileId: uuid("external_source_file_id").references(
      () => externalSourceFiles.id,
    ),
    externalFileId: text("external_file_id"),
    sourceModifiedTime: timestamp("source_modified_time", {
      withTimezone: true,
    }),
    sourceMd5Checksum: text("source_md5_checksum"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("document_versions_doc_version").on(t.documentId, t.version),
    index("document_versions_content_hash").on(t.communityId, t.contentHash),
  ],
);

/**
 * Validation targets used to cross-check Drive extractions without forcing values.
 * Seeded expected figures for The Willows; mismatches become conflicts.
 */
export const validationTargets = pgTable("validation_targets", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  key: text("key").notNull(),
  label: text("label").notNull(),
  factType: text("fact_type"),
  expectedNumeric: numeric("expected_numeric", { precision: 14, scale: 2 }),
  expectedText: text("expected_text"),
  periodStart: text("period_start"),
  periodEnd: text("period_end"),
  asOfDate: text("as_of_date"),
  tolerance: numeric("tolerance", { precision: 14, scale: 2 }).default("1.00"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
