-- Replace early import staging tables from 0002 with the full review pipeline.
DROP TABLE IF EXISTS "import_rows" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "import_batches" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."import_batch_status";--> statement-breakpoint
CREATE TYPE "public"."import_source_type" AS ENUM('generic_csv', 'folio_csv', 'bank_csv');--> statement-breakpoint
CREATE TYPE "public"."import_pipeline_status" AS ENUM('uploaded', 'parsing', 'needs_mapping', 'needs_review', 'partially_approved', 'approved', 'failed');--> statement-breakpoint
CREATE TYPE "public"."import_row_status" AS ENUM('needs_review', 'invalid', 'duplicate', 'ready', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."import_classification" AS ENUM('income', 'expense', 'transfer', 'owner_payment', 'assessment', 'refund', 'adjustment', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."financial_transaction_direction" AS ENUM('inflow', 'outflow', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."financial_transaction_status" AS ENUM('draft', 'posted', 'void');--> statement-breakpoint
CREATE TABLE "import_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source_type" "import_source_type" NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"document_id" uuid,
	"source_type" "import_source_type" DEFAULT 'generic_csv' NOT NULL,
	"original_filename" text NOT NULL,
	"storage_provider" text DEFAULT 'local' NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text,
	"byte_size" integer,
	"status" "import_pipeline_status" DEFAULT 'uploaded' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"valid_row_count" integer DEFAULT 0 NOT NULL,
	"error_row_count" integer DEFAULT 0 NOT NULL,
	"duplicate_row_count" integer DEFAULT 0 NOT NULL,
	"detected_columns" jsonb DEFAULT '[]'::jsonb,
	"mapping" jsonb DEFAULT '{}'::jsonb,
	"profile_id" uuid,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"normalized" jsonb,
	"validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mapping_status" text DEFAULT 'unmapped' NOT NULL,
	"status" "import_row_status" DEFAULT 'needs_review' NOT NULL,
	"classification" "import_classification" DEFAULT 'unknown' NOT NULL,
	"duplicate_fingerprint" text,
	"is_duplicate" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "financial_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"import_row_id" uuid,
	"import_batch_id" uuid,
	"source_document_id" uuid,
	"transaction_date" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"direction" "financial_transaction_direction" DEFAULT 'unknown' NOT NULL,
	"category" text,
	"classification" "import_classification" DEFAULT 'unknown' NOT NULL,
	"vendor_id" uuid,
	"vendor_name" text,
	"unit_id" uuid,
	"owner_display" text,
	"external_id" text,
	"reference" text,
	"status" "financial_transaction_status" DEFAULT 'draft' NOT NULL,
	"verification_status" "verification_status" DEFAULT 'reported' NOT NULL,
	"duplicate_fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "import_profiles" ADD CONSTRAINT "import_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_profiles" ADD CONSTRAINT "import_profiles_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_profiles" ADD CONSTRAINT "import_profiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_profile_id_import_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."import_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_import_row_id_import_rows_id_fk" FOREIGN KEY ("import_row_id") REFERENCES "public"."import_rows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "import_profiles_community_name" ON "import_profiles" USING btree ("community_id","name");--> statement-breakpoint
CREATE INDEX "import_rows_batch_id_idx" ON "import_rows" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "import_rows_fingerprint_idx" ON "import_rows" USING btree ("community_id","duplicate_fingerprint");--> statement-breakpoint
CREATE INDEX "financial_transactions_community_date_idx" ON "financial_transactions" USING btree ("community_id","transaction_date");
