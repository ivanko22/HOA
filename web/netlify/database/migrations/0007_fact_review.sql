ALTER TYPE "public"."verification_status" ADD VALUE IF NOT EXISTS 'rejected';--> statement-breakpoint
ALTER TABLE "facts" ADD COLUMN IF NOT EXISTS "original_numeric_value" numeric(14, 2);
