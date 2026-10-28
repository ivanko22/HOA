CREATE TYPE "public"."document_processing_status" AS ENUM('processing', 'needs_review', 'source_only', 'partially_verified', 'verified');--> statement-breakpoint
CREATE TABLE "facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"fact_type" text NOT NULL,
	"label" text NOT NULL,
	"value" text,
	"numeric_value" numeric(14, 2),
	"unit" text,
	"period_start" date,
	"period_end" date,
	"as_of_date" date,
	"source_page" text,
	"source_reference" text,
	"source_excerpt" text,
	"verification_status" "verification_status" DEFAULT 'needs_review' NOT NULL,
	"confidence" numeric(3, 2),
	"notes" text,
	"provenance_id" uuid,
	"created_by" uuid,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "original_filename" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "period_start" date;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "period_end" date;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "processing_status" "document_processing_status" DEFAULT 'source_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_provenance_id_provenance_records_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."provenance_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;