ALTER TYPE "public"."external_file_sync_status" ADD VALUE IF NOT EXISTS 'unsupported';--> statement-breakpoint
ALTER TYPE "public"."external_file_sync_status" ADD VALUE IF NOT EXISTS 'oversized';--> statement-breakpoint
ALTER TYPE "public"."external_file_sync_status" ADD VALUE IF NOT EXISTS 'pending_transcription';
