CREATE TABLE IF NOT EXISTS "pis_key_mapping" (
	"id" serial PRIMARY KEY NOT NULL,
	"pis_key" text NOT NULL,
	CONSTRAINT "pis_key_mapping_pis_key_unique" UNIQUE("pis_key")
);
--> statement-breakpoint
ALTER TABLE "historical_price" DROP CONSTRAINT "idx_historical_price_pis_key_date";--> statement-breakpoint
ALTER TABLE "historical_price" DROP CONSTRAINT "historical_price_pis_key_product_in_store_key_fk";
--> statement-breakpoint
ALTER TABLE "historical_price" ADD COLUMN "pis_key_id" integer NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "historical_price" ADD CONSTRAINT "historical_price_pis_key_id_pis_key_mapping_id_fk" FOREIGN KEY ("pis_key_id") REFERENCES "public"."pis_key_mapping"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "historical_price" DROP COLUMN IF EXISTS "pis_key";--> statement-breakpoint
ALTER TABLE "historical_price" ADD CONSTRAINT "idx_historical_price_pis_key_date" UNIQUE("pis_key_id","date");