ALTER TABLE "cache" ALTER COLUMN "last_synced" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_state" ALTER COLUMN "started_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_state" ALTER COLUMN "ended_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_in_store" ALTER COLUMN "last_synced" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "last_synced" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "store" ALTER COLUMN "last_synced_at" SET DATA TYPE timestamp with time zone;