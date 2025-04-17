ALTER TABLE "store"
ADD COLUMN "key" text GENERATED ALWAYS AS ("store"."retailer" || '-' || "store"."id") STORED NOT NULL;