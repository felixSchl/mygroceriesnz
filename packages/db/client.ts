import { decodeMaybe } from "@repo/io-ts";
import { concurrently2, processInChunks_ } from "@repo/utils";
import {
  and,
  eq,
  gt,
  inArray,
  type InferInsertModel,
  type InferSelectModel,
  isNull,
  not,
  or,
  sql,
} from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import slugify from "slugify-ts";
import type { CategoryQuery } from "./categories.js";
import {
  brandTable,
  cacheTable,
  CategoryMappingCodec,
  type CategoryMappingJSON,
  categoryMappingTable,
  type CategoryTreeNode,
  configTable,
  historicalPriceTable,
  jobTable,
  MAIN_CONFIG_KEY,
  type MetaProductDataJSON,
  metaProductTable,
  parseStoreId,
  pisKeyMappingTable,
  type ProductData,
  ProductDataCodec,
  type ProductDataJSON,
  ProductInStoreCodec,
  productInStoreTable,
  productTable,
  type Retailer,
  RetailerCodec,
  type RetailerJSON,
  scrapeJobTable,
  type StoreData,
  StoreDataCodec,
  type StoreId,
  storeTable,
  type SyncSchedule,
} from "./schema.js";
import { extractPricingInfo } from "./retailers/index.js";

// experimental: record prices over time.
// TODO archive old prices (don't need to be in DB and on SSD)
const HISTORICAL_PRICING_ENABLED = true;

// IMPORTANT update this when adding new retailers
export const ALL_RETAILERS: Retailer[] = ["ww", "pns", "nw"];

// TODO
type StoreKey = string;

export class DBClient {
  constructor(
    public readonly raw: PostgresJsDatabase,
    public readonly close: () => void
  ) {}

  static create(databaseUrl: string): DBClient {
    const raw = postgres(databaseUrl);
    return new DBClient(
      drizzle(raw, {
        logger: false,
      }),
      () => {
        raw.end();
      }
    );
  }

  //----------------------------------------------------------------------------
  // region: Cataloguing
  //----------------------------------------------------------------------------

  async getStores(opts?: {
    filters: {
      retailer?: Retailer;
      missingLocation?: boolean;
    };
  }) {
    const rows = await this.raw
      .select()
      .from(storeTable)
      .where(
        and(
          ...(!opts?.filters.retailer
            ? [inArray(storeTable.retailer, ALL_RETAILERS)]
            : [
                eq(
                  storeTable.retailer,
                  RetailerCodec.encode(opts.filters.retailer)
                ),
              ]),
          ...(opts?.filters.missingLocation
            ? [isNull(storeTable.location)]
            : [])
        )
      )
      // bring in job data for the store; note we do not need to group by store
      // here because there must only be one job per store per retailer.
      .leftJoin(
        jobTable,
        eq(
          jobTable.id,
          sql`'scrape/products:' || ${storeTable.retailer} || '-' || ${storeTable.id}`
        )
      )
      .orderBy(
        storeTable.lastSyncedAt,
        sql`
        CASE
          WHEN ${jobTable.status} = 'RUNNING' THEN ${jobTable.startedAt}
          WHEN ${jobTable.status} = 'COMPLETED' THEN ${jobTable.endedAt}
          WHEN ${jobTable.status} = 'FAILED' THEN ${jobTable.endedAt}
          WHEN ${jobTable.status} = 'CANCELLED' THEN ${jobTable.endedAt}
          ELSE ${jobTable.startedAt}
        END
      `
      );

    return rows.map((row) => {
      const r = StoreDataCodec.decode(row.store.json);
      return {
        ...row.store,
        json: r._tag === "Right" ? r.right : null,
        job: row.job_state ?? null,
      };
    });
  }

  // TODO this should actually iterate...
  async iterateStoresForSearchIndex() {
    return this.raw
      .select()
      .from(storeTable)
      .where(inArray(storeTable.retailer, ALL_RETAILERS));
  }

  // TODO this should actually iterate...
  async iterateMetaProductsForSearchIndex(params: {
    page: number;
    limit: number;
  }) {
    const rows = await this.raw
      .selectDistinctOn([metaProductTable.id], {
        meta_product: metaProductTable,
        brand: sql<{
          id: string;
          name: string;
        }>`(
          SELECT json_build_object(
            'id', b.id,
            'name', b.name
          )
          FROM ${brandTable} b
          WHERE b.id = ${metaProductTable.brand}
          LIMIT 1
        )`.as("brand"),
        stores: sql<Array<string>>`
          COALESCE(
            array_agg(DISTINCT ${storeTable.key}),
            '{}'::text[]
          )`,
      })
      .from(metaProductTable)
      .leftJoin(
        productTable,
        eq(metaProductTable.id, productTable.metaProductId)
      )
      .leftJoin(
        productInStoreTable,
        eq(productTable.key, productInStoreTable.productKey)
      )
      .leftJoin(storeTable, eq(storeTable.key, productInStoreTable.storeKey))
      .groupBy(metaProductTable.id)
      .limit(params.limit)
      .offset(params.page * params.limit);

    return rows.map((row) => ({
      ...row.meta_product,
      brand: row.brand?.name ?? row.brand?.id,
      stores: row.stores,
    }));
  }

  async upsertStores(
    stores: {
      id: string;
      retailer: Retailer;
      data: StoreData;
    }[]
  ) {
    if (stores.length === 0) return;
    for (const store of stores) {
      await this.raw
        .insert(storeTable)
        .values({
          id: store.id,
          retailer: RetailerCodec.encode(store.retailer),
          json: StoreDataCodec.encode(store.data),
        })
        .onConflictDoUpdate({
          target: [storeTable.id, storeTable.retailer],
          set: {
            json: StoreDataCodec.encode(store.data),
          },
        });
    }
  }

  async upsertProducts(
    products: (ProductData &
      Partial<{
        categoryIds: string[];
      }>)[]
  ) {
    if (products.length === 0) return;

    function toSKU(p: ProductData) {
      switch (p.retailer) {
        case "pns":
        case "nw":
          return p.productId;
        case "ww":
          return p.sku;
      }
    }

    const now = new Date();

    // insert products into product_in_store table
    const rows = await this.raw
      .insert(productInStoreTable)
      .values(
        products.map((p) => ({
          retailer: RetailerCodec.encode(p.retailer),
          storeId: p.storeId,
          sku: toSKU(p),
          json: ProductDataCodec.encode(p),
          categoryIds: p.categoryIds,
          lastSynced: now,
        }))
      )
      .onConflictDoUpdate({
        target: [
          productInStoreTable.sku,
          productInStoreTable.retailer,
          productInStoreTable.storeId,
        ],
        set: {
          lastSynced: now,

          // prefer latest JSON
          json: sql`EXCLUDED.json`,

          // merge category IDs (ensure no duplicates)
          // TODO should we just overwrite them? why does PIS even have categories?
          categoryIds: sql`
            ARRAY(
                SELECT DISTINCT unnest(
                    COALESCE(EXCLUDED.category_ids, '{}') ||
                    COALESCE(${productInStoreTable}.category_ids, '{}')
                )
            )`,
        },
      });

    // record daily pricing in historical price table.
    if (HISTORICAL_PRICING_ENABLED) {
      // resolve the space-efficient 'pisKeyId's for this batch of products

      const pisKeys = products.map((p) =>
        // derive the product-in-store key
        // IMPORTANT this MUST be consistent with the key in the product_in_store.
        // TODO extract this (must be consistent!)
        [p.retailer, p.storeId, toSKU(p)].join("-")
      );

      // 1. ensure the mapping exists
      await this.raw
        .insert(pisKeyMappingTable)
        .values(pisKeys.map((pisKey) => ({ pisKey })))
        .onConflictDoNothing();

      // 2. load all the pis key mappings for this batch
      // another round trip to get all the pisKeyIds
      const rows = await this.raw
        .select({
          id: pisKeyMappingTable.id,
          pisKey: pisKeyMappingTable.pisKey,
        })
        .from(pisKeyMappingTable)
        .where(inArray(pisKeyMappingTable.pisKey, pisKeys));

      // create an O(1) lookup in memory for pisKeyId
      const pisKeyIdMap = new Map(rows.map((x) => [x.pisKey, x.id]));

      // 3. insert data into historical_price table
      await this.raw
        .insert(historicalPriceTable)
        .values(
          products.map((p) => {
            const priceData = extractPricingInfo(p);

            // derive the product-in-store key
            // IMPORTANT this MUST be consistent with the key in the product_in_store.
            // TODO extract this (must be consistent!)
            const pisKey = [p.retailer, p.storeId, toSKU(p)].join("-");

            const pisKeyId = pisKeyIdMap.get(pisKey);
            if (pisKeyId == null) {
              // should never happen
              throw new Error(
                `Invariant Violation: No pisKeyId found for ${pisKey}`
              );
            }

            return {
              date: now,
              ...priceData,
              pisKeyId,
            };
          })
        )
        .onConflictDoUpdate({
          target: [historicalPriceTable.pisKeyId, historicalPriceTable.date],
          set: {
            unitQty: sql`EXCLUDED.unit_qty`,
            unitQtyUom: sql`EXCLUDED.unit_qty_uom`,
            originalPrice: sql`EXCLUDED.price`,
            originalUnitPrice: sql`EXCLUDED.unit_price`,
            salePrice: sql`EXCLUDED.sale_price`,
            clubPrice: sql`EXCLUDED.club_price`,
            multiBuyPrice: sql`EXCLUDED.multi_buy_price`,
            multiBuyThreshold: sql`EXCLUDED.multi_buy_threshold`,
          },
        });
    }

    return rows;
  }

  async getMetaProduct(id: string) {
    const [row] = await this.raw
      .select({
        id: metaProductTable.id,
        title: metaProductTable.title,
        description: metaProductTable.description,
        categoryIds: metaProductTable.categoryIds,
        images: metaProductTable.images,
        json: metaProductTable.json,
      })
      .from(metaProductTable)
      .where(eq(metaProductTable.id, id))
      .limit(1);
    if (!row) return null;
    const { json, ...item } = row;
    return {
      ...item,
      image: json?.image ?? null,
    };
  }

  //----------------------------------------------------------------------------
  // region: PNS Support
  //----------------------------------------------------------------------------

  async pns_setTokens(
    retailer: Retailer,
    tokens: {
      accessToken: string;
      refreshToken: string | null;
    }
  ) {
    await this.raw
      .insert(scrapeJobTable)
      .values({
        retailer: RetailerCodec.encode(retailer),
        pns_tokens: tokens,
      })
      .onConflictDoUpdate({
        target: [scrapeJobTable.retailer],
        set: {
          pns_tokens: tokens,
        },
      });
  }

  async pns_getTokens(retailer: Retailer) {
    const [row] = await this.raw
      .select({ token: scrapeJobTable.pns_tokens })
      .from(scrapeJobTable)
      .where(eq(scrapeJobTable.retailer, RetailerCodec.encode(retailer)))
      .limit(1);
    return row?.token ?? null;
  }

  async pns_delTokens() {
    await this.raw
      .update(scrapeJobTable)
      .set({ pns_tokens: null })
      .where(eq(scrapeJobTable.retailer, RetailerCodec.encode("pns")));
  }

  //----------------------------------------------------------------------------
  // region: Admin Support
  //----------------------------------------------------------------------------

  async admin_searchProducts(opts?: {
    limit?: number;
    offset?: number;
    q?: string;
  }) {
    const rows = await this.raw
      .select()
      .from(metaProductTable)
      .where(
        or(
          ...[
            opts?.q
              ? sql`to_tsvector('english', ${metaProductTable.title}) @@ plainto_tsquery('english', ${opts.q})`
              : null,
            opts?.q ? eq(metaProductTable.barcode, opts.q.trim()) : null,
          ].filter(notEmpty)
        )
      )
      .limit(opts?.limit ?? 20)
      .offset(opts?.offset ?? 0);

    return rows;
  }

  /**
   * Create 'product' table rows for all products in the 'product_in_store'
   * table.
   */
  async reindexProducts(params: {}) {
    // we want exactly one row per product in the 'product' table that we can
    // await this.raw.execute(
    //   sql`
    //   INSERT INTO product (retailer, id, barcode, "json", category_ids)
    //     SELECT
    //       retailer,
    //       id,
    //       "json"->>'barcode' AS barcode,
    //       "json",
    //       category_ids
    //     FROM (
    //       SELECT
    //         retailer,
    //         id,
    //         "json",
    //         category_ids,
    //         -- select the best JSON
    //         ROW_NUMBER() OVER (
    //           PARTITION BY
    //             retailer,
    //             id
    //             ORDER BY
    //               -- prioritize non-null JSON
    //               (CASE WHEN "json" IS NULL THEN 1 ELSE 0 END) ASC,
    //               -- prioritize many category IDs
    //               ARRAY_LENGTH(category_ids, 1),
    //               id ASC
    //         ) AS rnk
    //       FROM product_in_store
    //     ) subquery
    //     WHERE rnk = 1
    //   ON CONFLICT (retailer, id)
    //     DO UPDATE
    //       SET
    //         "json" = EXCLUDED."json",
    //         barcode = CASE
    //           WHEN EXCLUDED.barcode IS NOT NULL
    //             THEN EXCLUDED.barcode
    //             ELSE product.barcode
    //           END,
    //         category_ids = ARRAY(
    //           SELECT DISTINCT unnest(
    //             COALESCE(EXCLUDED.category_ids, '{}') ||
    //             COALESCE(product.category_ids, '{}')
    //           )
    //         )
    //       ;`
    // );
  }

  async reindexBrands() {
    await this.raw.execute(
      sql`
      UPDATE brand SET product_count = (
        SELECT
          COUNT(DISTINCT id)
        FROM
          meta_product p
        WHERE
          p.brand = brand.id
      );`
    );
  }

  // TODO refactor this such that the iteration is done in the caller which
  //      would allow better inngest job management.
  async reindexBarcodes(params: {
    concurrency: number;
    loadBarcode: (
      product: ProductDataJSON | null
    ) => Promise<string | undefined | null>;
  }) {
    // re-index bar codes
    const size = 1000; // query batch size (queries are slow, so find a good balance here)

    let discovered = 0;

    let first: string | null = null;
    for (let page = 0; ; ) {
      console.log(`querying next batch of products (${size})...`);
      const xs = await this.raw
        .select()
        .from(productTable)
        .where(isNull(productTable.barcode))
        // IMPORTANT we do not need to move the offset because as we're filling
        //           in bar codes the query will automatically skip over rows
        //           that have already been indexed. For this to work we store
        //           missing / broken bar codes as "" and those not indexed as
        //           NULL.
        .limit(size)
        .orderBy(productTable.sku);

      if (first != null && xs[0]?.key === first) {
        console.log("completed reindexing barcodes (no more data)");
        break;
      }

      first = xs[0]?.key ?? null;

      console.log(`reindexing barcodes; page=${page}; size=${xs.length}`);

      if (xs.length === 0) {
        console.log("completed reindexing barcodes (no more data.)");
        break;
      }

      // resolve bar codes concurrently
      const out: [string, Retailer, string][] = [];
      await concurrently2(params.concurrency, xs, async (x) => {
        if (x.barcode) return; // already indexed

        const data = await params.loadBarcode(x.json);

        if (data != null) {
          discovered++;
        }

        out.push([
          x.sku,
          x.retailer,
          // IMPORTANT we store missing / broken bar codes as "" to
          //           differentiate them from "never indexed."
          data ?? "",
        ]);
      });

      // perpare batch of UPDATE queries to write bar codes to the db
      const [y, ...ys] = out
        .filter(notEmpty)
        .map(([id, retailer, barcode]) => {
          return this.raw
            .update(productTable)
            .set({ barcode: barcode ?? "" })
            .where(
              and(eq(productTable.retailer, retailer), eq(productTable.sku, id))
            );
        })
        .filter(notEmpty);

      if (y != null) {
        console.log(`writing ${ys.length + 1} barcodes...`);
        // TODO Use batch API once it is available
        //  SEE https://github.com/drizzle-team/drizzle-orm/issues/2291
        // await this.db.batch([y, ...ys]);
        for (const x of [y, ...ys]) {
          await x;
        }
      }
    }

    return discovered;
  }

  async selectMetaProductsForIndexing(param: { limit: number; page: number }) {
    const { limit, page } = param;
    const rows = await this.raw
      .select({
        meta: metaProductTable,
        jsons: sql<
          (ProductDataJSON | null)[]
        >`JSON_AGG(${productTable.json})`.as("jsons"),
        categoryIds: sql<{ [retailer: string]: string[] }>`JSONB_OBJECT_AGG(
            COALESCE(${productTable}.retailer, '?'),
            COALESCE(${productTable}.category_ids, '{}'::text[])
        )`.as("categoryIds"),
      })
      .from(metaProductTable)
      .leftJoin(
        productTable,
        eq(metaProductTable.id, productTable.metaProductId)
      )
      .limit(limit)
      .offset(page * limit)
      .groupBy(metaProductTable.id);
    return rows.filter((row) => row.jsons.some((x) => x != null));
  }

  /**
   * ...
   */
  async reindexMetaProducts(
    resolveJSON: (
      rows: {
        meta: InferSelectModel<typeof metaProductTable>;
        jsons: (ProductDataJSON | null)[];
      }[]
    ) => Promise<{ json: MetaProductDataJSON }[]>
  ) {
    let page = 0;
    const size = 1000;
    const seenBrands = new Set<string>();
    for (; ; page++) {
      // select from our catalog of all products and sample the JSON data we
      // collected from each of the retailers for this product.
      const rows = await this.raw
        .select({
          meta: metaProductTable,
          jsons: sql<
            (ProductDataJSON | null)[]
          >`JSON_AGG(${productTable.json})`.as("jsons"),
        })
        .from(metaProductTable)
        .leftJoin(
          productTable,
          eq(metaProductTable.id, productTable.metaProductId)
        )
        .limit(size)
        .offset(page * size)
        .groupBy(metaProductTable.id);

      if (rows.length === 0) {
        console.log("completed reindexing meta products (no more data)");
        break;
      }

      // resolve out-of-band information on the products
      // IMPORTANT these are matched up by index!
      const results = await resolveJSON(rows);

      const [u, ...us] = results
        .flatMap(({ json }, ix) => {
          const row = rows[ix];
          if (row == null) return;

          // find brand
          let brand: string | null = row.meta.brand;
          for (const json of row.jsons) {
            if (json?.brand) {
              brand = json.brand;
              break;
            }
          }

          // canoncialise any inferred brand (only if no brand is set)
          let brandId: string | null = null;
          let addBrand = false;
          if (brand != null) {
            brandId = slugify(brand);

            // cache brands to avoid unnecessary (but harmless) writes
            addBrand = !seenBrands.has(brandId);
            seenBrands.add(brandId);
          }

          // TODO consider using the title to generate a slug for better SEO &
          //      UX.
          // let slug = row.slug;
          // if (slug == null && json.title) {
          //   slug = slugify(json.title);
          // }

          return [
            // ensure brand exists
            addBrand && brandId != null
              ? () =>
                  this.raw
                    .insert(brandTable)
                    .values({
                      id: brandId,
                      name: brand,
                      productCount: 0,
                    })
                    .onConflictDoNothing()
              : null,

            // update meta product
            () =>
              this.raw
                .update(metaProductTable)
                .set({
                  // slug,
                  brand: brandId,
                  title: json.title,
                  json: {
                    ...row.meta.json,
                    ...json,
                  },
                })
                .where(eq(metaProductTable.id, row.meta.id)),
          ];
        })
        .filter(notEmpty);

      if (u != null) {
        // TODO Use batch API once it is available
        //  SEE https://github.com/drizzle-team/drizzle-orm/issues/2291
        // await this.db.batch([u, ...us]);
        for (const x of [u, ...us]) {
          await x();
        }
      }
    }
  }

  /**
   * Allocate meta product IDs to products that do not have one.
   */
  async syncMetaProducts() {
    // PERF this is used for performance reasons only, and has no other bearing
    //      on the logic.
    const metaProductIdByBarcodeCache = new Map<string, string>();

    let totalInserted = 0;
    let totalUpdates = 0;

    let page = 0;
    const size = 1000;
    for (; ; page++) {
      const rows = await this.raw
        .select()
        .from(productTable)
        // NOTE we do not filter by 'metaProductId' because we want to allocate
        //      meta product IDs to all products that do not have one which
        //      would keep shifting the offset as we allocate meta product IDs.
        .where(and(gt(productTable.barcode, ""), not(productTable.ignored)))
        .limit(size)
        .offset(page * size);

      // break if we've reached the end
      if (rows.length === 0) break;

      // allocate meta product IDs (by barcode)
      const barcodes = rows.map((row) => row.barcode).filter(notEmpty);

      // insert meta products in chunks of 1000
      await processInChunks_(100, barcodes, async (barcodes) => {
        totalInserted += barcodes.length;
        await this.raw
          .insert(metaProductTable)
          .values(
            barcodes.map((barcode) => ({
              id: barcode,
              barcode,
            }))
          )
          .onConflictDoNothing();
      });

      // next, set the meta product ID for each product
      await processInChunks_(100, rows, async (rows) => {
        for (const row of rows) {
          if (row.metaProductId != null) continue;
          if (row.barcode == null) continue;
          totalUpdates++;
          await this.raw
            .update(productTable)
            .set({
              metaProductId: row.barcode,
            })
            .where(eq(productTable.sku, row.sku));
        }
      });

      console.log(
        `synced page ${page}; inserted (tot) ${totalInserted}; updated (tot) ${totalUpdates}`
      );
    }

    console.log(
      `synced ${totalUpdates} meta products; inserted ${totalInserted}`
    );
    return {
      totalInserted,
      totalUpdates,
    };
  }

  /**
   * Cache the result of a computation for a given key and a given amount of time.
   * Set 'maxAge' to 'Infinity' to cache the result indefinitely.
   */
  async cached<T>(
    key: string,
    maxAge: number,
    fn: (skip: (val: T) => T) => Promise<T>
  ): Promise<T> {
    const [row] = await this.raw
      .select()
      .from(cacheTable)
      .where(eq(cacheTable.key, key))
      .limit(1);

    if (
      row != null &&
      (row.ttl == null ||
        maxAge === Infinity ||
        row.updatedAt.getTime() + (row.ttl ?? maxAge) > Date.now())
    ) {
      return row.value as T;
    } else if (row != null) {
      // TODO(PROD) remove this log statement
      console.log("cache expired", key);
    }

    let skip = false;

    const result = await fn((arg) => {
      skip = true;
      return arg;
    });

    if (!skip && typeof result !== "undefined") {
      // console.log("caching", key, result);
      await this.raw
        .insert(cacheTable)
        .values({
          key,
          value: result ?? null,
          updatedAt: new Date(),
          ttl: maxAge === Infinity ? null : maxAge,
        })
        .onConflictDoUpdate({
          target: [cacheTable.key],
          set: {
            value: result ?? null,
            updatedAt: new Date(),
            ttl: maxAge === Infinity ? null : maxAge,
          },
        });
    }

    return result;
  }

  async getCacheEntry<T>(key: string): Promise<T | null> {
    const [row] = await this.raw
      .select()
      .from(cacheTable)
      .where(eq(cacheTable.key, key))
      .limit(1);
    return row?.value as T | null;
  }

  async setCacheEntry<T>(key: string, value: T) {
    await this.raw
      .insert(cacheTable)
      .values({
        key,
        value,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [cacheTable.key],
        set: {
          value,
          updatedAt: new Date(),
        },
      });
  }

  async delCacheEntry(key: string) {
    await this.raw.delete(cacheTable).where(eq(cacheTable.key, key));
  }

  async upsertJob(
    id: string,
    job: Omit<InferInsertModel<typeof jobTable>, "id">
  ) {
    await this.raw
      .insert(jobTable)
      .values({
        id,
        ...job,
      })
      .onConflictDoUpdate({
        target: [jobTable.id],
        set: {
          ...job,
        },
      });
  }

  async updateJob(
    id: string,
    job: Partial<Omit<InferInsertModel<typeof jobTable>, "id">>
  ) {
    const [row] = await this.raw
      .update(jobTable)
      .set({
        ...job,
      })
      .where(eq(jobTable.id, id))
      .returning();
    return row ?? null;
  }

  async getJob(id: string) {
    const [row] = await this.raw
      .select()
      .from(jobTable)
      .where(eq(jobTable.id, id))
      .limit(1);
    return row ?? null;
  }

  async getRunningChildrenJobs(query: { parentJobId: string }) {
    const rows = await this.raw
      .select()
      .from(jobTable)
      .where(
        and(
          eq(jobTable.parentJobId, query.parentJobId),
          eq(jobTable.status, "RUNNING")
        )
      );
    return rows;
  }

  async getMetaProductIdsForSkus(
    skus: {
      sku: string;
      retailer: Retailer;
    }[]
  ): Promise<
    {
      sku: string;
      retailer: Retailer;
      metaProductId: string;
    }[]
  > {
    if (skus.length === 0) return [];

    // Create product keys in the same format as stored in the DB
    // refer to the schema definition for more details
    const productKeys = skus.map((sku) => `${sku.retailer}-${sku.sku}`);

    const rows = await this.raw
      .select({
        productKey: productTable.key,
        metaProductId: productTable.metaProductId,
      })
      .from(productTable)
      .where(inArray(productTable.key, productKeys));

    return rows
      .map((row) => {
        if (row.metaProductId == null) return null;
        // Split the product key back into retailer and sku
        const [retailer, sku] = row.productKey.split("-");
        if (!sku) return null;
        return {
          sku,
          retailer: retailer as Retailer,
          metaProductId: row.metaProductId,
        };
      })
      .filter((x) => x != null);
  }

  /**
   * Load prices for a set of products in a set of stores. The passed-in stores
   * are the stores that the user has selected.  We'll try to find price
   * information for each of the selected stores, but we'll take the liberty to
   * default to other stores if we can't find recent data (> ~1 week).
   */
  async getPrices(query: {
    products: string[]; // meta product IDs
    stores: { retailer: Retailer; store: string }[]; // stores to query
    allowFallbacks?: boolean; // new option to control fallback behavior
  }) {
    if (query.products.length === 0) return [];

    // TODO implement a more efficient means to do this by pre-calculating a lot
    //      of this stuff. See SHO-82
    const rows = await this.raw.execute<{
      metaProductId: string;
      retailer: RetailerJSON;
      retailerSku: string;
      storeId: string;
      storeName: string;
      lastSyncedAt: string | null;
      productInStoreJson: ProductDataJSON | null;
      requestedStoreKey: string;
      isFallbackPrice: boolean;
      originalStoreName: string;
      originalStoreId: string;
    }>(sql`
      WITH RECURSIVE
        -- First, set up our input stores and get their locations
        input_stores AS (
          SELECT
            s.key as store_key,
            value->>'retailer' as retailer,
            value->>'store' as store_id,
            s.location -- Get location for distance calculations
          FROM json_array_elements(${JSON.stringify(query.stores)}) as inputs
          LEFT JOIN store s
            -- TODO(PERF) use "key"
            ON s.retailer = inputs.value->>'retailer'
            AND s.id = inputs.value->>'store'
        ),

        -- Check if we have direct matches first
        direct_matches AS (
          SELECT DISTINCT i.store_key
          FROM input_stores i
          JOIN product_in_store pis ON pis.store_key = i.store_key
          JOIN product p ON p.product_key = pis.product_key
          WHERE p.meta_product_id IN ${query.products}
        ),

        -- Then recursively follow fallback relationships ONLY if no direct match exists
        store_hierarchy AS (
          -- Base case: start with requested stores that DON'T have direct matches
          SELECT
            s.key as store_key,
            s.key as requested_store_key,
            0 as depth,
            false as is_fallback,
            s.fallback_store_id
          FROM input_stores i
          JOIN store s ON i.store_key = s.key
          WHERE NOT EXISTS (
            SELECT 1 FROM direct_matches d
            WHERE d.store_key = i.store_key
          )

          UNION ALL

          -- Recursive case: follow fallback relationships
          SELECT
            -- fallbacks are always by same retailer
            s.retailer || '-' || s.fallback_store_id as store_key,
            sh.requested_store_key,
            sh.depth + 1 as depth,
            true as is_fallback,
            s.fallback_store_id
          FROM store_hierarchy sh
          JOIN store s ON s.key = sh.store_key
          WHERE sh.fallback_store_id IS NOT NULL
            AND sh.depth < 1
        ),

        -- Geographic fallbacks without ordering, ONLY if no direct match exists
        nearby_stores AS (
          SELECT
            s.key as store_key,
            i.store_key as requested_store_key,
            i.location <-> s.location AS distance,
            s.retailer
          FROM input_stores i
          JOIN store s ON
            -- TODO decide if we want to allow fallbacks for all retailers
            1 = 1
            -- s.retailer = i.retailer
            AND s.key NOT IN (SELECT store_key FROM store_hierarchy)
          WHERE
            -- allow fallbacks?
            1 = ${query.allowFallbacks ? 1 : 0}
            AND i.location IS NOT NULL
            AND s.location IS NOT NULL
            -- AND s.last_synced_at > NOW() - INTERVAL '7 days'
            AND NOT EXISTS (
              SELECT 1 FROM direct_matches d
              WHERE d.store_key = s.key
            )
        ),

        -- Select top 5 nearest stores (only if fallbacks allowed)
        geo_fallbacks AS (
          SELECT
            store_key,
            requested_store_key,
            3 as depth,
            true as is_fallback
          FROM (
            SELECT
              *,
              ROW_NUMBER() OVER (
                PARTITION BY requested_store_key
                ORDER BY distance
              ) as rn
            FROM nearby_stores
          ) ranked
          WHERE rn <= 5
        ),

        -- Combine direct matches, regular hierarchy, and geo fallbacks
        combined_hierarchy AS (
          -- Direct matches first
          SELECT
            store_key,
            store_key as requested_store_key,
            0 as depth,
            false as is_fallback
          FROM direct_matches

          UNION ALL

          -- Then fallback hierarchy
          SELECT
            store_key,
            requested_store_key,
            depth,
            is_fallback
          FROM store_hierarchy

          UNION ALL

          -- Then fallback by geo distance
          SELECT
            store_key,
            requested_store_key,
            depth,
            is_fallback
          FROM geo_fallbacks
        )
      SELECT
        p.meta_product_id AS "metaProductId",
        pis.retailer,
        pis.store_id AS "storeId",
        pis.json AS "productInStoreJson",
        p.id as "retailerSku",
        s.json->>'name' AS "storeName",
        s.last_synced_at AS "lastSyncedAt",
        sh.requested_store_key as "requestedStoreKey",
        sh.is_fallback as "isFallbackPrice",
        -- Add original store information
        orig_s.json->>'name' AS "originalStoreName",
        orig_s.id AS "originalStoreId"
      FROM combined_hierarchy sh
      JOIN product_in_store pis ON pis.store_key = sh.store_key
      JOIN product p ON p.product_key = pis.product_key
      JOIN meta_product mp ON mp.id = p.meta_product_id
      JOIN store s ON s.key = pis.store_key
      -- Add join to get original store information
      LEFT JOIN store orig_s ON orig_s.key = sh.store_key
      WHERE
        p.meta_product_id IN ${query.products}
      ORDER BY
        sh.depth,           -- Prefer direct matches
        pis.last_synced DESC
    `);

    // Process results and handle price extraction
    let out = rows
      .map((row) => {
        const json = decodeMaybe(ProductInStoreCodec, row.productInStoreJson);
        if (!json) return null;

        // TODO this should be moved into the DB (now that we track historical
        // prices and extracted this fn)
        const priceData = extractPricingInfo(json);

        return {
          productId: row.metaProductId,
          storeId: row.storeId,
          storeName: row.storeName,
          retailer: row.retailer,
          retailerSku: row.retailerSku,
          lastSyncedAt: row.lastSyncedAt,
          requestedStoreKey: row.requestedStoreKey,
          isFallbackPrice: row.isFallbackPrice,
          originalStoreId: row.originalStoreId,
          ...priceData,
        };
      })
      .filter((x) => x != null);

    // remove duplicates
    const seen = new Set<string>();
    out = out.filter((x) => {
      const key = `${x.productId}-${x.retailer}-${x.storeId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (query.allowFallbacks) {
      return out;
    }

    // remove stores we did not ask for
    return out.filter((x) =>
      query.stores.some(
        (y) => y.retailer === x.retailer && y.store === x.storeId
      )
    );
  }

  async updateStoreLastSyncedAt(
    retailer: Retailer,
    storeId: string,
    opts?: {
      now?: Date;
    }
  ) {
    await this.raw
      .update(storeTable)
      .set({ lastSyncedAt: opts?.now ?? new Date() })
      .where(
        and(eq(storeTable.retailer, retailer), eq(storeTable.id, storeId))
      );
  }

  async updateStore(
    retailer: Retailer,
    storeId: string,
    opts: Partial<{
      location: {
        lat: number;
        lng: number;
        json: any; // TODO type this
      };
      syncSchedule: SyncSchedule;
    }>
  ) {
    // collect updates
    const updates: PgUpdateSetSource<typeof storeTable> = {};

    let ok = false;
    if (opts.location) {
      ok = true;
      updates.location = { x: opts.location.lat, y: opts.location.lng };
      updates.locationJson = opts.location.json;
    }

    if (opts.syncSchedule) {
      ok = true;
      updates.syncSchedule = opts.syncSchedule;
    }

    if (!ok) return;

    await this.raw
      .update(storeTable)
      .set(updates)
      .where(
        and(
          eq(storeTable.retailer, retailer),
          eq(storeTable.id, storeId) //
        )
      );
  }

  async discoverCategoryTreeSlow_PNS_NW(): Promise<CategoryTreeNode[]> {
    // this query returns the distinct category trees for all products in the
    // PNS/NW json format, ordered by the category tree, for example:
    // "A"
    // "A"/"A"
    // "A"/"B"
    // "A"/"B"/"C"
    // "B"/"A"
    const rows = await this.raw.execute<{
      json: {
        level0?: string;
        level1?: string;
        level2?: string;
      };
    }>(
      sql`
select json::json from (
  select distinct json::text from (
    select json
      from (
        select json_array_elements(json->'categoryTrees') json
        from product
        where retailer = 'pns' or retailer = 'nw'
      ) x
    order by
      (json->>'level0'::text) ||
      (json->>'level1'::text) ||
      (json->>'level2'::text)
  ) y
) z order by json::text`
    );

    const root: CategoryTreeNode[] = [];

    let currentL0: CategoryTreeNode | null = null;
    let currentL1: CategoryTreeNode | null = null;
    let currentL2: CategoryTreeNode | null = null;

    for (const row of rows) {
      let fakeId = "";

      for (const l of ["level0", "level1", "level2"] as const) {
        const levelName = row.json[l];
        if (!levelName) break; // skip empty categories

        // IMPORTANT the product JSON does not contain IDs for the PNS
        //           categories. so, in lieu of a real ID we use the fully
        //           qualified category name (e.g. "A"/"B"/"C") as the ID.
        switch (l) {
          case "level0": {
            fakeId = levelName;
            if (currentL0 == null || currentL0.id !== fakeId) {
              currentL0 = { id: fakeId, name: levelName, children: [] };
              root.push(currentL0);
            }
            break;
          }
          case "level1": {
            fakeId += "/" + levelName;
            if (currentL1 == null || currentL1.id !== fakeId) {
              currentL1 = { id: fakeId, name: levelName, children: [] };
              currentL0!.children.push(currentL1);
            }
            break;
          }
          case "level2": {
            fakeId += "/" + levelName;
            if (currentL2 == null || currentL2.id !== fakeId) {
              currentL2 = { id: fakeId, name: levelName, children: [] };
              currentL1!.children.push(currentL2);
            }
            break;
          }
        }
      }
    }

    return root;
  }

  async getCategoryTree() {
    const [row] = await this.raw
      .select()
      .from(configTable)
      .where(eq(configTable.key, MAIN_CONFIG_KEY))
      .limit(1);
    return row?.categoryTree ?? [];
  }

  async updateCategoryTree(tree: CategoryTreeNode[]) {
    await this.raw
      .insert(configTable)
      .values({ categoryTree: tree })
      .onConflictDoUpdate({
        target: [configTable.key],
        set: { categoryTree: tree },
      });
  }

  async getCategoryMappings(query: { retailer: Retailer }) {
    // IMPORTANT 'pns' & 'nw' use the same category tree, so we need to map only one.
    const retailer = query.retailer === "nw" ? "pns" : query.retailer;
    const [row] = await this.raw
      .select({
        json: categoryMappingTable.json,
      })
      .from(categoryMappingTable)
      .where(eq(categoryMappingTable.retailer, retailer))
      .limit(1);
    if (row == null) return [];
    const json = decodeMaybe(CategoryMappingCodec, row.json);
    return json?.connections ?? [];
  }

  async updateCategoryMappings(
    retailer: Retailer,
    mappings: CategoryMappingJSON
  ) {
    // IMPORTANT 'pns' & 'nw' use the same category tree, so we need to map only one.
    retailer = retailer === "nw" ? "pns" : retailer;
    await this.raw
      .insert(categoryMappingTable)
      .values({
        retailer,
        json: CategoryMappingCodec.encode(mappings),
      })
      .onConflictDoUpdate({
        target: [categoryMappingTable.retailer],
        set: { json: CategoryMappingCodec.encode(mappings) },
      });
  }

  async updateStoreMappings(storeMappings: Record<StoreId, string>) {
    await this.raw
      .insert(configTable)
      .values({ storeMappings })
      .onConflictDoUpdate({
        target: [configTable.key],
        set: { storeMappings },
      });
  }

  async getStoreMappings() {
    const [row] = await this.raw
      .select({
        storeMappings: configTable.storeMappings,
      })
      .from(configTable)
      .where(eq(configTable.key, MAIN_CONFIG_KEY))
      .limit(1);
    return row?.storeMappings ?? {};
  }

  helper_resolveBrand(
    meta: InferSelectModel<typeof metaProductTable>,
    jsons: ProductDataJSON[]
  ): null | {
    id: string;
    name: string;
  } {
    // resolve brand from meta
    let brand: string | null = meta.brand;

    // find brand name from any of the JSON datasets.
    for (const json of jsons) {
      if (json?.brand) {
        brand = json.brand;
        break;
      }
    }

    if (!brand) return null;

    // canonicalise brand to avoid duplicates
    const brandId = slugify(brand);

    return {
      name: brand,
      id: brandId,
    };
  }

  helper_resolveCategories(
    query: CategoryQuery,
    jsons: ProductDataJSON[],
    categoryIds: { [retailer: string]: string[] }
  ): Set<string> {
    const out = new Set<string>();
    for (const json of jsons) {
      if (
        // PNS & NW use the same category structure
        json.retailer === "pns" ||
        json.retailer === "nw"
      ) {
        // IMPORTANT currently PNS/NW _do not_ use the 'categoryIds' feature.
        //           it was added later for WW. We should probably update the
        //           PNS/NW scraping accordingly.
        for (const cat of json.categoryTrees ?? []) {
          // for PNS & NW the "id" is '<level0>/<level1>/<level2>'; see DBClient.ts
          let catId = "";
          for (const level of ["level0", "level1", "level2"] as const) {
            const id = cat[level];
            if (!id) break;
            catId = catId === "" ? id : catId + "/" + id;
          }
          if (!catId) continue;

          let ok = false;
          for (const cat of query.resolve(json.retailer, catId)) {
            ok = true;
            out.add(cat);
          }
          if (!ok) {
            console.log(`[${json.retailer}] unknown category`, catId);
          }
        }
      }
    }

    // unified 'categoryIds' (resolved during product indexing.)
    // TODO extract all retailers
    for (const retailer of ["pns", "nw", "ww"] as const) {
      for (const retailerCatId of categoryIds[retailer] ?? []) {
        for (const cat of query.resolve(retailer, retailerCatId)) {
          out.add(cat);
        }
      }
    }

    return out;
  }

  async autoCreateBrands(
    brands: {
      id: string;
      name: string;
    }[]
  ) {
    if (brands.length === 0) return;
    // if we have a brand that does not exist in the brand table, we add it.
    // if the brand already exists, we do nothing.
    await this.raw.insert(brandTable).values(brands).onConflictDoNothing();
  }

  async deleteMetaProducts(ids: string[]) {
    if (ids.length === 0) return;
    await this.raw
      .delete(metaProductTable)
      .where(inArray(metaProductTable.id, ids));
  }

  async updateMetaProducts(
    items: {
      id: string;
      title: string;
      brandId: string | null;
      json: MetaProductDataJSON;
      categoryIds: string[];
    }[]
  ) {
    // TODO(PERF) figure out if it's possible to do this in a single query
    for (const item of items) {
      await this.raw
        .update(metaProductTable)
        .set({
          title: item.title,
          brand: item.brandId,
          json: item.json,
          categoryIds: item.categoryIds,
        })
        .where(eq(metaProductTable.id, item.id));
    }
  }

  async getDiskUsageStatistics() {
    const stats = await this.raw.execute<DiskUsageStatisticsRow>(sql`
      WITH store_counts AS (
        SELECT retailer, COUNT(*) as store_count
        FROM store
        GROUP BY retailer
      ),
      table_stats AS (
        -- Product in store stats per retailer
        SELECT
          'product_in_store' as table_name,
          retailer,
          COUNT(*) as total_rows,
          ROUND(COUNT(*)::numeric / NULLIF(sc.store_count, 0), 2) as avg_rows_per_store,
          (SELECT COUNT(DISTINCT store_id) FROM product_in_store WHERE retailer = product_in_store.retailer) as store_count,
          pg_size_pretty(SUM(pg_column_size(product_in_store.*))) as table_size,
          pg_size_pretty(
            COALESCE(
              (
                SELECT SUM(pg_relation_size(indexrelid))
                FROM pg_index i
                WHERE i.indrelid = 'product_in_store'::regclass
              ),
              0
            )
          ) as index_size,
          pg_size_pretty(
            SUM(pg_column_size(product_in_store.*)) +
            COALESCE(
              (
                SELECT SUM(pg_relation_size(indexrelid))
                FROM pg_index i
                WHERE i.indrelid = 'product_in_store'::regclass
              ),
              0
            )
          ) as total_size,
          pg_size_pretty(
            (SUM(pg_column_size(product_in_store.*)) +
            COALESCE(
              (
                SELECT SUM(pg_relation_size(indexrelid))
                FROM pg_index i
                WHERE i.indrelid = 'product_in_store'::regclass
              ),
              0
            )) / NULLIF((SELECT COUNT(DISTINCT store_id) FROM product_in_store WHERE retailer = product_in_store.retailer), 0)
          ) as avg_size_per_store
        FROM product_in_store
        LEFT JOIN store_counts sc USING (retailer)
        GROUP BY retailer, sc.store_count

        UNION ALL

        -- Product table stats
        SELECT
          'product' as table_name,
          retailer,
          COUNT(*) as total_rows,
          NULL as avg_rows_per_store,
          NULL as store_count,
          pg_size_pretty(SUM(pg_column_size(product.*))) as table_size,
          pg_size_pretty(
            COALESCE(
              (
                SELECT SUM(pg_relation_size(indexrelid))
                FROM pg_index i
                WHERE i.indrelid = 'product'::regclass
              ),
              0
            )
          ) as index_size,
          pg_size_pretty(
            SUM(pg_column_size(product.*)) +
            COALESCE(
              (
                SELECT SUM(pg_relation_size(indexrelid))
                FROM pg_index i
                WHERE i.indrelid = 'product'::regclass
              ),
              0
            )
          ) as total_size,
          NULL as avg_size_per_store
        FROM product
        GROUP BY retailer

        UNION ALL

        -- Meta product table stats (no retailer breakdown)
        SELECT
          'meta_product' as table_name,
          NULL as retailer,
          COUNT(*) as total_rows,
          NULL as avg_rows_per_store,
          NULL as store_count,
          pg_size_pretty(SUM(pg_column_size(meta_product.*))) as table_size,
          pg_size_pretty(
            COALESCE(
              (
                SELECT SUM(pg_relation_size(indexrelid))
                FROM pg_index i
                WHERE i.indrelid = 'meta_product'::regclass
              ),
              0
            )
          ) as index_size,
          pg_size_pretty(
            SUM(pg_column_size(meta_product.*)) +
            COALESCE(
              (
                SELECT SUM(pg_relation_size(indexrelid))
                FROM pg_index i
                WHERE i.indrelid = 'meta_product'::regclass
              ),
              0
            )
          ) as total_size,
          NULL as avg_size_per_store
        FROM meta_product
      )
      SELECT * FROM table_stats
      ORDER BY table_name, retailer NULLS FIRST;
    `);

    return stats;
  }

  async reindexStoreFallbacks() {
    const mappings = await this.getStoreMappings();
    for (const [encodedStoreId, fallbackStoreId] of Object.entries(mappings)) {
      const result = parseStoreId(encodedStoreId);
      if (!result) continue;
      const { retailer, id } = result;

      if (fallbackStoreId == null) continue;
      await this.raw
        .update(storeTable)
        .set({
          fallbackStoreId,
        })
        .where(and(eq(storeTable.retailer, retailer), eq(storeTable.id, id)));
    }
  }

  async getStoresPendingSync(opts?: { includeFallbackStores?: boolean }) {
    return (
      this.raw
        .select({
          id: storeTable.id,
          retailer: storeTable.retailer,
          syncSchedule: storeTable.syncSchedule,
          lastSyncedAt: storeTable.lastSyncedAt,
          fallbackStoreId: storeTable.fallbackStoreId,
        })
        .from(storeTable)
        .where(
          and(
            // Only include stores that are scheduled for sync
            not(eq(storeTable.syncSchedule, "never")),

            // Check if store needs sync based on schedule
            or(
              // Never synced stores (null last_synced_at)
              isNull(storeTable.lastSyncedAt),
              sql`${storeTable.lastSyncedAt} < NOW() - INTERVAL '12 hours'`
            )
          )
        )
        // Order by oldest first
        .orderBy(sql`${storeTable.lastSyncedAt} asc nulls first`)
    );
  }

  async getStoresSyncDates(stores: StoreKey[]) {
    return this.raw
      .select({
        key: storeTable.key,
        lastSyncedAt: storeTable.lastSyncedAt,
      })
      .from(storeTable)
      .where(inArray(storeTable.key, stores));
  }

  async getMetaProductsWithoutImages(params: {
    limit: number;
    offset: number;
  }): Promise<
    {
      meta: InferSelectModel<typeof metaProductTable>;
      jsons: (ProductDataJSON | null)[];
    }[]
  > {
    return this.raw
      .select({
        meta: metaProductTable,
        jsons: sql<
          (ProductDataJSON | null)[]
        >`JSON_AGG(${productTable.json})`.as("jsons"),
      })
      .from(metaProductTable)
      .leftJoin(
        productTable,
        eq(metaProductTable.id, productTable.metaProductId)
      )
      .where(
        isNull(
          sql`array_length(${metaProductTable.images}, 1)`
        ) /* also means empty */
      )
      .limit(params.limit)
      .offset(params.offset)
      .groupBy(metaProductTable.id);
  }

  async getMetaProductsForCart(items: string[]) {
    return this.raw
      .select({
        id: metaProductTable.id,
        title: metaProductTable.title,
      })
      .from(metaProductTable)
      .where(inArray(metaProductTable.id, items));
  }

  async adminGetProductDetails(params: { id: string }) {
    const [row] = await this.raw
      .select({
        meta: {
          id: metaProductTable.id,
          title: metaProductTable.title,
          brand: metaProductTable.brand,
          json: metaProductTable.json,
        },
        stores: sql<
          Array<{
            id: string;
            retailer: string;
            key: string;
            name: string;
            lastSynced: Date;
            sku: string;
            json: any;
          }>
        >`
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id', ${storeTable.id},
                'retailer', ${storeTable.retailer},
                'key', ${storeTable.key},
                'name', ${storeTable.json}->>'name',
                'lastSynced', ${productInStoreTable.lastSynced},
                'sku', ${productInStoreTable.sku},
                'json', ${productInStoreTable.json}
              )
              ORDER BY ${storeTable.retailer} ASC, ${storeTable.id} ASC
            ),
            '[]'
          )`,
      })
      .from(metaProductTable)
      .leftJoin(
        productTable,
        eq(metaProductTable.id, productTable.metaProductId)
      )
      .leftJoin(
        productInStoreTable,
        and(
          eq(productTable.retailer, productInStoreTable.retailer),
          eq(productTable.sku, productInStoreTable.sku)
        )
      )
      .leftJoin(
        storeTable,
        and(
          eq(storeTable.retailer, productInStoreTable.retailer),
          eq(storeTable.id, productInStoreTable.storeId)
        )
      )
      .where(eq(metaProductTable.id, params.id))
      .groupBy(metaProductTable.id)
      .limit(1);

    if (!row) return null;
    return {
      meta: row.meta,
      stores: row.stores,
    };
  }

  async getStoreName(storeId: string) {
    const [row] = await this.raw
      .select({
        json: storeTable.json,
      })
      .from(storeTable)
      .where(eq(storeTable.id, storeId))
      .limit(1);
    return row?.json?.name ?? null;
  }

  async getStore(retailer: Retailer, storeId: string) {
    const [row] = await this.raw
      .select()
      .from(storeTable)
      .where(and(eq(storeTable.retailer, retailer), eq(storeTable.id, storeId)))
      .limit(1);
    return row ?? null;
  }

  async getStoreByKey(key: string) {
    const [row] = await this.raw
      .select()
      .from(storeTable)
      .where(eq(storeTable.key, key))
      .limit(1);
    return row ?? null;
  }

  async getSummaryStoreByKey(key: string) {
    const [row] = await this.raw
      .select({
        store: {
          id: storeTable.id,
          retailer: storeTable.retailer,
          name: sql<string>`${storeTable.json}->>'name'`,
          lastSyncedAt: storeTable.lastSyncedAt,
          syncSchedule: storeTable.syncSchedule,
        },
        productCount: sql<number>`COUNT(${productInStoreTable.sku})`,
        nextSyncDue: sql<Date>`
          CASE ${storeTable.syncSchedule}
            WHEN 'daily' THEN ${storeTable.lastSyncedAt} + INTERVAL '1 day'
            WHEN 'weekly' THEN ${storeTable.lastSyncedAt} + INTERVAL '7 days'
            WHEN 'monthly' THEN ${storeTable.lastSyncedAt} + INTERVAL '30 days'
            WHEN 'never' THEN NULL
            ELSE NULL
          END
        `,
      })
      .from(storeTable)
      .leftJoin(
        productInStoreTable,
        and(
          eq(storeTable.retailer, productInStoreTable.retailer),
          eq(storeTable.id, productInStoreTable.storeId)
        )
      )
      .where(eq(storeTable.key, key))
      .groupBy(storeTable.id, storeTable.retailer)
      .limit(1);

    return row ?? null;
  }

  async getRecentStores() {
    return this.raw
      .select({
        id: storeTable.id,
        retailer: storeTable.retailer,
        key: storeTable.key,
        name: sql<string>`${storeTable.json}->>'name'`,
        lastSyncedAt: storeTable.lastSyncedAt,
      })
      .from(storeTable)
      .orderBy(sql`${storeTable.lastSyncedAt} desc nulls last`)
      .limit(5);
  }
}

function notEmpty<T>(x: T | null | undefined): x is T {
  return x != null;
}

export type DiskUsageStatisticsRow = {
  table_name: string;
  retailer: string | null;
  total_rows: string;
  avg_rows_per_store: string | null;
  store_count: number;
  total_size: string;
  index_size: string;
  table_size: string;
  avg_size_per_store: string | null;
};
