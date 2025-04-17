import * as t from "@repo/io-ts";
import { relations, sql, SQL, type InferSelectModel } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  json,
  jsonb,
  numeric,
  pgTable,
  point,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  NW,
  PNS,
  RetailerCodec,
  WW,
  type RetailerJSON,
  type StoreId,
  type SyncSchedule,
} from "./codecs.js";
import { date } from "drizzle-orm/pg-core";
export * from "./codecs.js";

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// region: App
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

type CartItemJSON = {
  productId: string;
  quantity: number;
};

type CartJSON = {
  name?: string | null;
  items?: CartItemJSON[];
};

export const cartTable = pgTable("cart", {
  id: text("id").primaryKey(),
  ownerId: uuid("owner_id"),

  // IMPORTANT we store this data as a JSON object because (1) we do not care
  //           too much about referential integrity, (2) all writes are made by
  //           a single user, and (3) we do not need to index or query this
  //           data. It also enables us to easily make copies of the cart for
  //           the user so they can have multiple carts.
  json: json("json").$type<CartJSON>(),
}).enableRLS();

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// region: Cataloguing
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export type StoreData = t.TypeOf<typeof StoreDataCodec>;
export type StoreDataJSON = t.OutputOf<typeof StoreDataCodec>;
export const StoreDataCodec = t.union(
  [
    t.strict(
      {
        // new-world and paknsave share this structure
        type: t.union([PNS, NW]),

        // meta
        name: t.string,
        salesOrgId: t.string,
        physicalStoreCode: t.string,

        // features
        delivery: t.boolean,
        clickAndCollect: t.boolean,

        // location
        region: t.string,
        address: t.string,
        latitude: t.number,
        longitude: t.number,
      },
      "PNSStoreData"
    ),
    t.strict(
      {
        type: WW,

        // meta
        name: t.string,

        // location
        suburb: t.string,
        state: t.string,
        postcode: t.string,

        // features
        facilities: t.array(t.string),

        // V2
        // // meta
        // name: t.string,
        // address: t.string,
        // areaId: t.number,
        // areaName: t.string,
      },
      "WWStoreData"
    ),
  ],
  "StoreData"
);

export const storeTable = pgTable(
  "store",
  {
    id: text("id").notNull(),
    retailer: text("retailer").$type<RetailerJSON>().notNull(),

    // generated keys
    key: text("key")
      .generatedAlwaysAs(
        (): SQL => sql`${storeTable.retailer} || '-' || ${storeTable.id}`
      )
      .notNull(),

    json: json("json").$type<StoreDataJSON>().notNull(),
    lastSyncedAt: timestamp("last_synced_at", {
      mode: "date",
      withTimezone: true,
    }),
    location: point("location", { mode: "xy" }),
    locationJson: json("location_json"), // google maps api response
    syncSchedule: text("sync_schedule").$type<SyncSchedule>().default("never"),

    // we won't bother with a FK constraint here
    fallbackStoreId: text("fallback_store_id"),
  },
  (tbl) => ({
    pk: primaryKey({
      columns: [tbl.id, tbl.retailer],
    }),
    keyIdx: index("store_key_index").on(tbl.key),
    retailerIdx: index("store_retailer_index").on(tbl.retailer),
    locationIdx: index("store_location_index").on(tbl.location),
    lastSyncedAtIdx: index("store_last_synced_at_index").on(tbl.lastSyncedAt),
  })
).enableRLS();

/**
 * Shopster internal product data collated from multiple retailers.
 */
export const UnitCodec = t.union([t.literal("Each"), t.literal("Kg")], "Unit");
export type MetaProductDataJSON = t.OutputOf<typeof MetaProductDataCodec>;
export const MetaProductDataCodec = t.fixOptionals(
  t.strict(
    {
      title: t.optional(t.string),
      image: t.optional(t.string),
      retailers: t.optional(t.array(RetailerCodec)),
      unit: t.optional(UnitCodec),
      categories: t.optional(t.array(t.string)),
    },
    "MetaProduct"
  )
);

export const brandTable = pgTable("brand", {
  id: text("id").primaryKey(),
  name: text("name"),
  productCount: integer("product_count").default(0),
}).enableRLS();

/**
 * A retailer-agnostic product.
 * This table serves as the service-internal product catalog. retailer-specific
 * products are linked to this table.
 */
export const metaProductTable = pgTable(
  "meta_product",
  {
    // the catalogued, URL friendly product id, assigned and used soley by us.
    id: text("id").primaryKey(),

    // TODO entertain this
    // the URL friendly product id
    // slug: text("slug").unique(),

    // the barcode of the product, if known.
    // this barcode is _indicative_ of the product it maps to, however, it is
    // not to be

    barcode: text("barcode").unique(),

    brand: text("brand").references(() => brandTable.id),

    // meta information
    title: text("title"),
    description: text("description"),
    json: json("json").$type<MetaProductDataJSON>(),
    categoryIds: text("category_ids").array().default([]).notNull(),

    // product image
    // for now we only store a single image per product
    images: jsonb("images")
      .$type<{
        url: string;
      }>()
      .array()
      .default([]),
  },
  (tbl) => ({
    brandIdx: index("meta_product_brand_index").on(tbl.brand),
  })
).enableRLS();

export type ProductData = t.TypeOf<typeof ProductDataCodec>;
export type ProductDataJSON = t.OutputOf<typeof ProductDataCodec>;

// unified unit of measure
export type UOM = "g" | "ea" | "m" | "kg" | "l" | "ml" | "sheets";

// this is data returned by the retailer's API. We use a separate codec from the
// one defined in the adapter module in order to guard against the retailer
// changing their API response on us (thereby accidentally changing the schema
// of the data we store and rendering the data in the DB unreadable.)
export const PNSProductDataCodecVersion = t.literal(1);
const _PNSUOM = t.union([
  t.literal("g"),
  t.literal("ea"),
  t.literal("m"),
  t.literal("kg"),
  t.literal("l"),
  t.literal("ml"),
  t.literal("sheets"),
]);

export const PNSUOMCodec = new t.Type<
  t.TypeOf<typeof _PNSUOM> | null,
  string | null,
  unknown
>(
  "PNSUOM",
  _PNSUOM.is,
  (u, c) => {
    if (u === null) return t.success(null);
    if (typeof u !== "string") return t.failure(u, c, "UOM must be a string");
    u = u.toLowerCase().trim();
    if (u === "") return t.success(null);
    return _PNSUOM.validate(u, c);
  },
  (v) => (v == null ? null : _PNSUOM.encode(v))
);

export type PNSProductData = t.TypeOf<typeof PNSProductDataCodec>;
export const PNSProductDataCodec = t.fixOptionals(
  t.strict(
    {
      codec: PNSProductDataCodecVersion,
      storeId: t.string,
      brand: t.optional(t.string),
      productId: t.string,
      name: t.string,
      displayName: t.optional(t.string),
      variableWeight: t.optional(
        t.strict(
          {
            unitOfMeasure: t.optional(PNSUOMCodec),
            averageWeight: t.optional(t.number),
            minOrderQuantity: t.optional(t.number),
            stepSize: t.optional(t.number),
            stepUnitOfMeasure: t.optional(PNSUOMCodec),
          },
          "VariableWeight"
        )
      ),
      categoryTrees: t.optional(
        t.array(
          t.strict(
            {
              level0: t.optional(t.string),
              level1: t.optional(t.string),
              level2: t.optional(t.string),
            },
            "CategoryTree"
          )
        )
      ),

      // store specific information
      availability: t.array(
        t.union([t.literal("IN_STORE"), t.literal("ONLINE")])
      ),
      saleType: t.union(
        [t.literal("UNITS"), t.literal("WEIGHT"), t.literal("BOTH")],
        "SaleType"
      ),
      promotions: t.optional(
        t.array(
          t.strict(
            {
              rewardValue: t.number,
              rewardType: t.literal("NEW_PRICE"),
              threshold: t.number,
              multiProducts: t.boolean,
              cardDependencyFlag: t.boolean,
              bestPromotion: t.boolean,
            },
            "Promotion"
          )
        )
      ),
      singlePrice: t.strict(
        {
          price: t.number,
          promoId: t.optional(t.string),
          comparativePrice: t.optional(
            t.strict(
              {
                pricePerUnit: t.number,
                unitQuantity: t.number,
                unitQuantityUom: t.optional(PNSUOMCodec),
              },
              "ComparativePrice"
            )
          ),
        },
        "SinglePrice"
      ),
    },
    "PNSProductData"
  )
);

export type WWUOM = t.TypeOf<typeof WWUOMCodec>;
export const WWUOMCodec = t.union([
  t.literal("1m"),
  t.literal("1kg"),
  t.literal("100g"),
  t.literal("10mL"),
  t.literal("100mL"),
  t.literal("100mm"),
  t.literal("100ss"),
  t.literal("100ea"),
  t.literal("10g"),
  t.literal("1ea"),
  t.literal("1L"),
]);
export const WWAvailabilityStatusCodec = t.union([
  t.literal("In Stock"),
  t.literal("Out of Stock"),
  t.literal("Low Stock"),
]);
export const WWUnitCodec = t.union(
  [t.literal("Each"), t.literal("Kg")],
  "WWUnit"
);

export type WWProductData = t.TypeOf<typeof WWProductDataCodec>;
export const WWProductDataCodec = t.fixOptionals(
  t.strict(
    {
      name: t.string,
      storeId: t.string,
      barcode: t.string,
      variety: t.optional(t.string),
      brand: t.string,
      slug: t.string,
      sku: t.string,
      unit: WWUnitCodec,

      images: t.strict(
        {
          small: t.string,
          big: t.string,
        },
        "Images"
      ),
      averageWeightPerUnit: t.optional(t.number),
      size: t.optional(
        t.strict({
          cupListPrice: t.optional(t.number),
          cupPrice: t.optional(t.number),
          cupMeasure: t.optional(WWUOMCodec),
          packageType: t.optional(t.string),
        })
      ),
      departments: t.array(
        t.strict({
          id: t.number,
          name: t.string,
        })
      ),
      supportsBothEachAndKgPricing: t.boolean,

      // store specific information
      stockLevel: t.optional(t.number),
      availabilityStatus: WWAvailabilityStatusCodec,
      price: t.strict(
        {
          originalPrice: t.number,
          salePrice: t.number,
          isClubPrice: t.boolean,
          isSpecial: t.boolean,
          isNew: t.boolean,
          discount: t.null,
          total: t.null,
          averagePricePerSingleUnit: t.optional(t.number),
          purchasingUnitPrice: t.null,
        },
        "Price"
      ),

      productTag: t.optional(
        t.strict(
          {
            tagType: t.string,
            multiBuy: t.optional(
              t.strict(
                {
                  quantity: t.number,
                  value: t.number,
                  link: t.string,
                  multiCupValue: t.number,
                },
                "MultiBuy"
              )
            ),
            additionalTag: t.optional(
              t.strict(
                {
                  name: t.string,
                  link: t.optional(t.string),
                },
                "AdditionalTag"
              )
            ),
          },
          "ProductTag"
        )
      ),
    },
    "WWProductData"
  )
);

export const ProductDataCodec = t.union(
  [
    t.intersection([
      t.strict({
        // new-world and paknsave share this structure
        retailer: t.union([PNS, NW]),
      }),
      PNSProductDataCodec,
    ]),
    t.intersection([
      t.strict({
        retailer: WW,
      }),
      WWProductDataCodec,
    ]),
  ],
  "ProductData"
);

export type ProductRow = InferSelectModel<typeof productTable>;

/**
 * A product offered by a retailer.
 */
export const productTable = pgTable(
  "product",
  {
    sku: text("id").notNull(),
    retailer: text("retailer").$type<RetailerJSON>().notNull(),
    name: text("name"),
    barcode: text("barcode"),
    lastSynced: timestamp("last_synced", { mode: "date", withTimezone: true }),
    json: json("json").$type<ProductDataJSON>(),
    metaProductId: text("meta_product_id"),
    categoryIds: text("category_ids").array().default([]).notNull(),

    // TODO explain this
    ignored: boolean("ignored").default(false),

    // generated keys
    key: text("product_key")
      .generatedAlwaysAs(
        (): SQL => sql`${productTable.retailer} || '-' || ${productTable.sku}`
      )
      .notNull(),
  },
  (tbl) => ({
    pk: primaryKey({
      columns: [tbl.sku, tbl.retailer],
    }),
    barcodeIdx: index("product_barcode_index").on(tbl.barcode),
    keyIdx: unique("idx_product_key").on(tbl.key),
    // barcodeRetailerMetaIdx: unique("idx_product_barcode_retailer").on(
    //   tbl.retailer,
    //   tbl.barcode,
    //   tbl.metaProductId
    // ),
  })
).enableRLS();

relations(productTable, ({ one }) => ({
  metaProduct: one(metaProductTable, {
    fields: [productTable.metaProductId],
    references: [metaProductTable.id],
  }),
}));

export type ProductInStoreData = t.TypeOf<typeof ProductInStoreCodec>;
export type ProductInStoreDataJSON = t.OutputOf<typeof ProductInStoreCodec>;
export const ProductInStoreCodec = ProductDataCodec; // shared for now

export type ProductInStoreRow = InferSelectModel<typeof productInStoreTable>;

/**
 * A product offered by a retailer in a specific store.
 */
export const productInStoreTable = pgTable(
  "product_in_store",
  {
    _barcode: text("barcode"), // TODO remove

    retailer: text("retailer").notNull(),
    sku: text("id").notNull(),
    storeId: text("store_id"),

    // the JSON data returned by the retailer's API.
    // we currently store this information for each retailer/store combination
    // as it may contain store-specific information such as stock levels.
    json: json("json").$type<ProductDataJSON>().notNull(),

    // categories this product was found in.
    // XXX this should not differ from store to store and we'd be saving
    //     unnecessary amounts of duplicate data. We should consider moving
    //     this to the product table. But Careful! we're currently referencing
    //     this column in some queries; do a search for `category_ids` in the
    //     codebase.
    categoryIds: text("category_ids").array().default([]).notNull(),

    lastSynced: timestamp("last_synced", { mode: "date", withTimezone: true }),

    // generated keys
    productKey: text("product_key")
      .generatedAlwaysAs(
        (): SQL =>
          sql`${productInStoreTable.retailer} || '-' || ${productInStoreTable.sku}`
      )
      .notNull(),
    storeKey: text("store_key")
      .generatedAlwaysAs(
        (): SQL =>
          sql`${productInStoreTable.retailer} || '-' || ${productInStoreTable.storeId}`
      )
      .notNull(),
    key: text("key")
      .generatedAlwaysAs(
        (): SQL =>
          sql`${productInStoreTable.retailer} || '-' || ${productInStoreTable.storeId} || '-' || ${productInStoreTable.sku}`
      )
      .notNull(),
  },
  (tbl) => ({
    pk: primaryKey({
      columns: [tbl.sku, tbl.retailer, tbl.storeId],
    }),
    idRetailerIdx: unique("idx_product_in_store_id_retailer_storeId").on(
      tbl.sku,
      tbl.retailer,
      tbl.storeId
    ),
    productKeyIdx: index("idx_product_in_store_product_key").on(tbl.productKey),
    storeKeyIdx: index("idx_product_in_store_store_key").on(tbl.storeKey),
    keyIdx: unique("idx_product_in_store_key").on(tbl.key),
  })
).enableRLS();

relations(productInStoreTable, ({ one }) => ({
  store: one(storeTable, {
    fields: [productInStoreTable.retailer, productInStoreTable.storeId],
    references: [storeTable.retailer, storeTable.id],
  }),
}));

/**
 * Product price & stock data
 */

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// region: Scraping
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export const jobTable = pgTable("job_state", {
  id: text("key").primaryKey(),
  title: text("title"),
  startedAt: timestamp("started_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
  endedAt: timestamp("ended_at", { mode: "date", withTimezone: true }),
  parentJobId: text("parent_job_id"), // TODO Recursive FK constraint?
  status: text("status")
    .$type<"RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED">()
    .notNull(),

  // inngest specific fields
  inngestFn: text("inngest_fn").notNull(),
  inngestEventId: text("inngest_event_id"),
  inngestRunId: text("inngest_run_id"),

  // discord integration
  discordMessageId: text("discord_message_id"),
});

export type ScrapeJob = t.TypeOf<typeof ScrapeJobCodec>;
export type ScrapeJobJSON = t.OutputOf<typeof ScrapeJobCodec>;
export const ScrapeJobCodec = t.strict(
  {
    retailer: RetailerCodec,
    data: t.unknown,
  },
  "ScrapeJob"
);

export const scrapeJobTable = pgTable("scrape_job", {
  retailer: text("retailer").$type<RetailerJSON>().primaryKey(),
  json: json("json").$type<ScrapeJobJSON>(),

  // retailer specific columns used for atomic operations
  pns_tokens: json("pns_tokens").$type<{
    accessToken: string;
    refreshToken: string | null;
  }>(),
}).enableRLS();

export const cacheTable = pgTable("cache", {
  key: text("key").primaryKey(),
  value: json("value"),
  updatedAt: timestamp("last_synced", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  ttl: integer("ttl"),
}).enableRLS();

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// region: Global
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export const MAIN_CONFIG_KEY = "main";

export interface CategoryTreeNode {
  name: string;
  id: string;
  children: CategoryTreeNode[];
}

export type CategoryTreeNodeJSON = t.OutputOf<typeof CategoryTreeNodeCodec>;
export const CategoryTreeNodeCodec: t.Type<CategoryTreeNode> = t.recursion(
  "CategoryTreeNode",
  (self) =>
    t.strict({
      name: t.string,
      id: t.string,
      children: t.array(self),
    })
);

export type CategoryTreeNodeL1 = CategoryTreeNode;
export type CategoryTreeNodeL2 = CategoryTreeNode["children"][number];
export type CategoryTreeNodeL3 = CategoryTreeNodeL2["children"][number];
export type AnyCategoryTreeNode =
  | CategoryTreeNodeL1
  | CategoryTreeNodeL2
  | CategoryTreeNodeL3;

export const configTable = pgTable("config", {
  key: text("key").primaryKey().default(MAIN_CONFIG_KEY), // singleton key
  categoryTree: json("category_tree").$type<CategoryTreeNode[]>().default([]),
  storeMappings: json("store_mappings")
    .$type<Record<StoreId, string>>()
    .default({}),
});

export type CategoryMappingJSON = t.TypeOf<typeof CategoryMappingCodec>;
export const CategoryMappingCodec = t.strict(
  {
    connections: t.array(
      t.strict(
        {
          sourceId: t.string,
          targetId: t.string,
        },
        "Connection"
      )
    ),
  },
  "CategoryMapping"
);

export const categoryMappingTable = pgTable("category_mapping", {
  retailer: text("retailer").$type<RetailerJSON>().primaryKey(),
  json: json("json").$type<CategoryMappingJSON>(),
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// region: Historical Price Data
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// create a more efficient index for the historical price table
export const pisKeyMappingTable = pgTable("pis_key_mapping", {
  id: serial("id").primaryKey(),
  pisKey: text("pis_key").unique().notNull(),
});

export const historicalPriceTable = pgTable(
  "historical_price",
  {
    // pointer to product-in-store table
    pisKeyId: integer("pis_key_id")
      .references(() => pisKeyMappingTable.id)
      .notNull(),

    // date
    date: date("date", {
      mode: "date",
    }).notNull(),

    // unit of measure
    unitQty: real("unit_qty"),
    unitQtyUom: varchar("unit_qty_uom", { length: 16 }).$type<UOM>(),

    // prices are in NZD cents
    originalPrice: real("price").notNull(),

    // NULL where not applicable
    originalUnitPrice: real("unit_price"),

    // sale & club & multi-buy prices
    // NULL indicates item is not on sale, available at a discounted club price,
    // or available at a multi-buy price; respectively.
    salePrice: real("sale_price"),
    clubPrice: real("club_price"),
    multiBuyPrice: real("multi_buy_price"),
    multiBuyThreshold: real("multi_buy_threshold"),
  },
  (tbl) => ({
    pisKeyIdx: unique("idx_historical_price_pis_key_date").on(
      tbl.pisKeyId,
      tbl.date
    ),
  })
);

export type PriceInfo = InferSelectModel<typeof historicalPriceTable> & {
  unitDisplay: string | null; // TODO add to DB
};
