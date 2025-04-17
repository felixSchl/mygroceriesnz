import {
  formatStoreId,
  parseStoreId,
  RetailerCodec,
  type Retailer,
} from "@repo/db";
import { z } from "zod";
import { publicProcedure } from "./core.js";

const StoreKey = z.string(); // TODO
const RetailerZodCodec = z.enum(["ww", "nw", "pns"]);

export const publicRouter = {
  me: publicProcedure.query(({ ctx }) => {
    // TODO
    return ctx.user == null ? null : {};
  }),

  getCategories: publicProcedure.query(async ({ ctx }) => {
    const tree = await ctx.db.getCategoryTree();

    // christmas is over, hide the christmas tree (cat 42.)
    // TODO make this data-driven.
    return tree.filter((node) => node.id !== "42");
  }),

  searchStores: publicProcedure
    .input(
      z.object({
        q: z.string(),
        loc: z
          .object({
            lat: z.number(),
            lng: z.number(),
          })
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return await ctx.search.searchStores({
        query: input.q ?? "",
        limit: 20,
        geo: input.loc
          ? {
              lat: input.loc.lat.toString(),
              lng: input.loc.lng.toString(),
            }
          : undefined,
      });
    }),

  search: publicProcedure
    .input(
      z.object({
        q: z.string(),
        page: z.number().optional(),
        category: z.string().optional(),
        location: z
          .object({
            lat: z.number(),
            lng: z.number(),
          })
          .optional(),
        stores: z.array(StoreKey).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 1;

      // 1. prefer stores from input
      const stores =
        input.stores
          ?.map((x) => {
            const result = parseStoreId(x);
            if (!result) return null;
            return {
              retailer: result.retailer,
              store: result.id,
            };
          })
          .filter((x) => x != null) ?? [];

      // 2. else, try use nearby stores based on location (could be merged.)
      if (input.location) {
        stores.push(
          ...(
            await ctx.search.searchStores({
              query: "",
              limit: 10,
              geo: {
                lat: input.location.lat.toString(),
                lng: input.location.lng.toString(),
              },
            })
          ).map((s) => ({
            retailer: s.retailer,
            store: s.id, // TODO rename field for consistency
          }))
        );
      }

      // 3. TODO here we could just use any stores... but why would the user
      //         ever end up here...

      const results = await ctx.search.searchCatalog({
        query: input.q,
        page,
        limit: 20,
        category: input.category,
        stores: stores.map((x) => formatStoreId(x.retailer, x.store)),
      });

      return {
        total: results.total,
        hits: results.hits.map((hit) => {
          return {
            id: hit.id,
            brand: hit.brand,
            title: hit.title,
            image: hit.image,
            description: hit.description,
            categories: hit.categories,
          };
        }),
      };
    }),

  getPrices: publicProcedure
    .input(
      z.object({
        location: z
          .object({
            lat: z.number(),
            lng: z.number(),
          })
          .optional(),
        productIds: z.array(z.string()),
        stores: z.array(StoreKey),
      })
    )
    .query(async ({ ctx, input }) => {
      // 1. prefer stores from input
      const stores =
        input.stores
          ?.map((x) => {
            const result = parseStoreId(x);
            if (!result) return null;
            return {
              retailer: result.retailer,
              store: result.id,
            };
          })
          .filter((x) => x != null) ?? [];

      // 2. else, try use nearby stores based on location (could be merged.)
      if (input.location) {
        stores.push(
          ...(
            await ctx.search.searchStores({
              query: "",
              limit: 10,
              geo: {
                lat: input.location.lat.toString(),
                lng: input.location.lng.toString(),
              },
            })
          ).map((s) => ({
            retailer: s.retailer,
            store: s.id,
          }))
        );
      }

      // 3. resolve product ids to meta product ids
      const productIds: string[] = [];

      // 3.1. collect product skus to resolve
      const productSkusToResolve: {
        retailer: Retailer;
        sku: string;
      }[] = [];
      for (const id of input.productIds) {
        // support for querying by retailer sku, the format is:
        // sku-<retailer>:<sku>

        // if already a meta product id, add it to the list
        if (!id.startsWith("sku-")) {
          productIds.push(id);
          continue;
        }

        // otherwise, parse the retailer and sku & queue for resolution
        const [retailerRaw, skuRaw] = id.slice(4).split(":");
        if (!retailerRaw || !skuRaw) continue;
        const retailerResult = RetailerCodec.decode(retailerRaw);
        if (retailerResult._tag === "Left") continue;
        productSkusToResolve.push({
          retailer: retailerResult.right,
          sku: skuRaw,
        });
      }

      // 3.2. resolve product skus to meta product ids
      const metaProductIds =
        await ctx.db.getMetaProductIdsForSkus(productSkusToResolve);

      console.log(stores);

      return await ctx.db.getPrices({
        stores,
        allowFallbacks: true,
        products: Array.from(
          new Set(
            [
              ...productIds,
              ...metaProductIds.map((x) => x.metaProductId),
            ].filter((x) => x != null)
          )
        ),
      });
    }),

  productInfo: publicProcedure
    .input(
      z.object({
        noPrices: z.boolean().optional(),
        productId: z.string(),
        location: z
          .object({
            lat: z.number(),
            lng: z.number(),
          })
          .optional(),
        stores: z.array(StoreKey).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.getMetaProduct(input.productId);
      if (row == null) return null;

      // 1. prefer stores from input
      const stores =
        input.stores
          ?.map((x) => {
            const result = parseStoreId(x);
            if (!result) return null;
            return {
              retailer: result.retailer,
              store: result.id,
            };
          })
          .filter((x) => x != null) ?? [];

      // 2. else, try use nearby stores based on location (could be merged.)
      if (input.location) {
        stores.push(
          ...(
            await ctx.search.searchStores({
              query: "",
              limit: 10,
              geo: {
                lat: input.location.lat.toString(),
                lng: input.location.lng.toString(),
              },
            })
          ).map((s) => ({
            retailer: s.retailer,
            store: s.id,
          }))
        );
      }

      // 3. TODO here we could just use any stores... but why would the user
      //         ever end up here...

      const prices = input.noPrices
        ? []
        : await ctx.db.getPrices({
            products: [input.productId],
            stores,
            allowFallbacks: true,
          });

      // load product details (nutrition info, description)
      // this is a read-through-cache
      // ...

      return { ...row, prices };
    }),

  adminSignIn: publicProcedure
    .input(
      z.object({
        key: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.adminSignIn(input.key);
    }),

  getStoresSyncDates: publicProcedure
    .input(z.array(StoreKey))
    .query(async ({ ctx, input }) => {
      return await ctx.db.getStoresSyncDates(input);
    }),

  getRecentStores: publicProcedure.query(async ({ ctx }) => {
    return await ctx.db.getRecentStores();
  }),

  // TODO merge this with 'getPrices' and reduce complexity
  getCartPrices: publicProcedure
    .input(
      z.object({
        items: z.array(z.string()),
        location: z
          .object({
            lat: z.number(),
            lng: z.number(),
          })
          .nullish(),
        stores: z.array(
          z.object({
            retailer: RetailerZodCodec,
            storeId: z.string(),
          })
        ),
      })
    )
    .query(async ({ input, ctx }) => {
      // 1. prefer stores from input
      const stores =
        input.stores?.map((x) => ({
          retailer: x.retailer,
          store: x.storeId, // TODO rename field for consistency
        })) ?? [];

      // 2. else, try use nearby stores based on location (could be merged.)
      if (input.location) {
        stores.push(
          ...(
            await ctx.search.searchStores({
              query: "",
              limit: 10,
              geo: {
                lat: input.location.lat.toString(),
                lng: input.location.lng.toString(),
              },
            })
          ).map((s) => ({
            retailer: s.retailer,
            store: s.id, // TODO rename field for consistency
          }))
        );
      }

      const prices = await ctx.db.getPrices({
        products: input.items,
        stores,
      });

      // get meta information
      const meta = await ctx.db.getMetaProductsForCart(input.items);
      return meta.map((meta) => {
        return {
          ...meta,
          prices: prices.filter((p) => p.productId === meta.id),
        };
      });
    }),
};
