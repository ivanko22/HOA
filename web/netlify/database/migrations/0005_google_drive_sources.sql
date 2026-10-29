CREATE TYPE "public"."external_source_provider" AS ENUM('google_drive');--> statement-breakpoint
CREATE TYPE "public"."external_source_status" AS ENUM('active', 'paused', 'error');--> statement-breakpoint
CREATE TYPE "public"."external_file_sync_status" AS ENUM('discovered', 'downloaded', 'linked', 'skipped', 'unchanged', 'error');--> statement-breakpoint
CREATE TYPE "public"."external_sync_run_status" AS ENUM('running', 'completed', 'failed', 'needs_credentials');--> statement-breakpoint
CREATE TABLE "external_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"provider" "external_source_provider" NOT NULL,
	"name" text NOT NULL,
	"status" "external_source_status" DEFAULT 'active' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "external_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"status" "external_sync_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"started_by" uuid,
	"missing_credentials" jsonb DEFAULT '[]'::jsonb,
	"report" jsonb DEFAULT '{}'::jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "external_source_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"external_file_id" text NOT NULL,
	"parent_external_id" text,
	"name" text NOT NULL,
	"mime_type" text,
	"path" text DEFAULT '/' NOT NULL,
	"modified_time" timestamp with time zone,
	"size_bytes" integer,
	"md5_checksum" text,
	"version" text,
	"web_view_link" text,
	"is_folder" integer DEFAULT 0 NOT NULL,
	"sync_status" "external_file_sync_status" DEFAULT 'discovered' NOT NULL,
	"sync_error" text,
	"classification_label" text,
	"mapped_category" "document_category",
	"document_id" uuid,
	"last_synced_at" timestamp with time zone,
	"last_sync_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"storage_provider" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text,
	"mime_type" text,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"content_hash" text NOT NULL,
	"external_source_file_id" uuid,
	"external_file_id" text,
	"source_modified_time" timestamp with time zone,
	"source_md5_checksum" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "validation_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"fact_type" text,
	"expected_numeric" numeric(14, 2),
	"expected_text" text,
	"period_start" text,
	"period_end" text,
	"as_of_date" text,
	"tolerance" numeric(14, 2) DEFAULT '1.00',
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "external_sources" ADD CONSTRAINT "external_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_sources" ADD CONSTRAINT "external_sources_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_sync_runs" ADD CONSTRAINT "external_sync_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_sync_runs" ADD CONSTRAINT "external_sync_runs_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_sync_runs" ADD CONSTRAINT "external_sync_runs_source_id_external_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."external_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_sync_runs" ADD CONSTRAINT "external_sync_runs_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_source_files" ADD CONSTRAINT "external_source_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_source_files" ADD CONSTRAINT "external_source_files_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_source_files" ADD CONSTRAINT "external_source_files_source_id_external_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."external_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_source_files" ADD CONSTRAINT "external_source_files_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_external_source_file_id_external_source_files_id_fk" FOREIGN KEY ("external_source_file_id") REFERENCES "public"."external_source_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_targets" ADD CONSTRAINT "validation_targets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_targets" ADD CONSTRAINT "validation_targets_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_sources_community_provider_name" ON "external_sources" USING btree ("community_id","provider","name");--> statement-breakpoint
CREATE UNIQUE INDEX "external_source_files_source_external" ON "external_source_files" USING btree ("source_id","external_file_id");--> statement-breakpoint
CREATE INDEX "external_source_files_document" ON "external_source_files" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_doc_version" ON "document_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX "document_versions_content_hash" ON "document_versions" USING btree ("community_id","content_hash");
