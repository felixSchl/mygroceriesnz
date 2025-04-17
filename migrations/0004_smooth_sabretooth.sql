CREATE INDEX IF NOT EXISTS "store_location_index" ON "store" USING GIST ("location");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_last_synced_at_index" ON "store" USING btree ("last_synced_at");