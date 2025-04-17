ALTER TABLE "store" drop column "key";--> statement-breakpoint
ALTER TABLE "store" ADD COLUMN "key" text GENERATED ALWAYS AS ("store"."retailer" || '-' || "store"."id") STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "product_in_store" ADD COLUMN "product_key" text GENERATED ALWAYS AS ("product_in_store"."retailer" || '-' || "product_in_store"."id") STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "product_in_store" ADD COLUMN "store_key" text GENERATED ALWAYS AS ("product_in_store"."retailer" || '-' || "product_in_store"."store_id") STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "product_in_store" ADD COLUMN "key" text GENERATED ALWAYS AS ("product_in_store"."retailer" || '-' || "product_in_store"."store_id" || '-' || "product_in_store"."id") STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "product_key" text GENERATED ALWAYS AS ("product"."retailer" || '-' || "product"."id") STORED NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_product_in_store_product_key" ON "product_in_store" USING btree ("product_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_product_in_store_store_key" ON "product_in_store" USING btree ("store_key");--> statement-breakpoint
ALTER TABLE "product_in_store" ADD CONSTRAINT "idx_product_in_store_key" UNIQUE("key");--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "idx_product_key" UNIQUE("product_key");