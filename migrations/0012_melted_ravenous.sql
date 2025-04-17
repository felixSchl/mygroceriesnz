CREATE TABLE IF NOT EXISTS "historical_price" (
	"pis_key" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"unit_qty" integer,
	"unit_qty_uom" varchar(16),
	"price" integer NOT NULL,
	"unit_price" integer,
	"sale_price" integer,
	"club_price" integer,
	"multi_buy_price" integer,
	"multi_buy_threshold" integer,
	CONSTRAINT "idx_historical_price_pis_key_date" UNIQUE("pis_key","date")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "historical_price" ADD CONSTRAINT "historical_price_pis_key_product_in_store_key_fk" FOREIGN KEY ("pis_key") REFERENCES "public"."product_in_store"("key") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
