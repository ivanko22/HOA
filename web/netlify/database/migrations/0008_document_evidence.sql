CREATE TYPE "public"."visual_verification_status" AS ENUM('visual_match', 'mismatch', 'ambiguous', 'unable', 'unchecked');--> statement-breakpoint
ALTER TABLE "facts" ADD COLUMN IF NOT EXISTS "visual_verification_status" "visual_verification_status" DEFAULT 'unchecked' NOT NULL;--> statement-breakpoint
ALTER TABLE "facts" ADD COLUMN IF NOT EXISTS "visual_found_value" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "facts" ADD COLUMN IF NOT EXISTS "visual_verification_notes" text;--> statement-breakpoint
ALTER TABLE "facts" ADD COLUMN IF NOT EXISTS "evidence_bbox" jsonb;--> statement-breakpoint
ALTER TABLE "facts" ADD COLUMN IF NOT EXISTS "evidence_match_text" text;--> statement-breakpoint
ALTER TABLE "facts" ADD COLUMN IF NOT EXISTS "content_hash" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "content_hash" text;
