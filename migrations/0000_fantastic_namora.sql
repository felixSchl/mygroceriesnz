CREATE TABLE IF NOT EXISTS "brand" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"product_count" integer DEFAULT 0
);
--> statement-breakpoint
ALTER TABLE "brand" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cache" (
	"key" text PRIMARY KEY NOT NULL,
	"value" json,
	"last_synced" timestamp NOT NULL,
	"ttl" integer
);
--> statement-breakpoint
ALTER TABLE "cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "category_mapping" (
	"retailer" text PRIMARY KEY NOT NULL,
	"json" json
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "config" (
	"key" text PRIMARY KEY DEFAULT 'main' NOT NULL,
	"category_tree" json DEFAULT '[]'::json,
	"store_mappings" json DEFAULT '{}'::json
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_state" (
	"key" text PRIMARY KEY NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"parent_job_id" text,
	"status" text NOT NULL,
	"inngest_fn" text NOT NULL,
	"inngest_event_id" text,
	"inngest_run_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta_product" (
	"id" text PRIMARY KEY NOT NULL,
	"barcode" text,
	"brand" text,
	"title" text,
	"description" text,
	"json" json,
	"category_ids" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "meta_product_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
ALTER TABLE "meta_product" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_in_store" (
	"barcode" text,
	"id" text NOT NULL,
	"retailer" text NOT NULL,
	"store_id" text,
	"json" json NOT NULL,
	"category_ids" text[] DEFAULT '{}' NOT NULL,
	"last_synced" timestamp,
	CONSTRAINT "product_in_store_id_retailer_store_id_pk" PRIMARY KEY("id","retailer","store_id"),
	CONSTRAINT "idx_product_in_store_id_retailer_storeId" UNIQUE("id","retailer","store_id")
);
--> statement-breakpoint
ALTER TABLE "product_in_store" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product" (
	"id" text NOT NULL,
	"retailer" text NOT NULL,
	"name" text,
	"barcode" text,
	"last_synced" timestamp,
	"json" json,
	"meta_product_id" text,
	"category_ids" text[] DEFAULT '{}' NOT NULL,
	"ignored" boolean DEFAULT false,
	CONSTRAINT "product_id_retailer_pk" PRIMARY KEY("id","retailer")
);
--> statement-breakpoint
ALTER TABLE "product" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "store" (
	"id" text NOT NULL,
	"retailer" text NOT NULL,
	"json" json NOT NULL,
	"last_synced_at" timestamp,
	"location" "point",
	"location_json" json,
	CONSTRAINT "store_id_retailer_pk" PRIMARY KEY("id","retailer")
);
--> statement-breakpoint
ALTER TABLE "store" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meta_product" ADD CONSTRAINT "meta_product_brand_brand_id_fk" FOREIGN KEY ("brand") REFERENCES "public"."brand"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_product_brand_index" ON "meta_product" USING btree ("brand");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_barcode_index" ON "product" USING btree ("barcode");