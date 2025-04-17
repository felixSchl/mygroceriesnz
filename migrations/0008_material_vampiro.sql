CREATE INDEX IF NOT EXISTS "store_key_index" ON "store" USING btree ("key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_retailer_index" ON "store" USING btree ("retailer");