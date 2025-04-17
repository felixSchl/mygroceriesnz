import * as WW from "@repo/adapter-ww";
import type { DiskUsageStatisticsRow } from "@repo/db";
import {
  CategoryMappingCodec,
  CategoryTreeNodeCodec,
  RetailerCodec,
  StoreIdCodec,
  SyncScheduleCodec,
  type CategoryTreeNode,
  type Retailer,
  type StoreId,
} from "@repo/db";
import * as DiscordBot from "@repo/discord-bot";
import * as t from "@repo/io-ts";
import { z } from "zod";
import { adminProcedure, router } from "./core.js";
import { iots } from "./io-ts.js";

export const adminRouter = router({
  searchProducts: adminProcedure
    .input(
      z.object({
        q: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.admin_searchProducts({
        q: input.q,
      });
    }),

  getCategoryTree: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.getCategoryTree();
  }),

  updateCategoryTree: adminProcedure
    .input(iots(t.array(CategoryTreeNodeCodec)))
    .mutation(async ({ ctx, input: nodes }) => {
      return ctx.db.updateCategoryTree(nodes);
    }),

  updateCategoryMappings: adminProcedure
    .input(
      iots(
        t.strict({
          retailer: RetailerCodec,
          mappings: CategoryMappingCodec,
        })
      )
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.updateCategoryMappings(input.retailer, input.mappings);
    }),

  getStoreMappings: adminProcedure.query<Record<StoreId, string>>(
    async ({ ctx }) => {
      return ctx.db.getStoreMappings();
    }
  ),

  updateStoreMappings: adminProcedure
    .input(
      iots(
        t.strict({
          mappings: t.record(StoreIdCodec, t.string),
        })
      )
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.updateStoreMappings(input.mappings);
    }),

  getRetailerCategoryTree: adminProcedure
    .input(iots(t.strict({ retailer: RetailerCodec })))
    .query<{
      retailer: Retailer;
      tree: CategoryTreeNode[];
      connections: { sourceId: string; targetId: string }[];
    }>(async ({ ctx, input }) => {
      if (input.retailer === "pns" || input.retailer === "nw") {
        const tree = await ctx.db.discoverCategoryTreeSlow_PNS_NW();
        const connections = await ctx.db.getCategoryMappings({
          retailer: input.retailer,
        });
        return { retailer: input.retailer, tree, connections };
      }
      if (input.retailer === "ww") {
        // WW categories are not inferred from local data, but are instead
        // loaded from the WW API.
        // TODO should we cache this for reliability sake?
        const shell = await WW.API.getShell(null);
        const tree = shell.categories;
        const connections = await ctx.db.getCategoryMappings({
          retailer: input.retailer,
        });
        return { retailer: input.retailer, tree, connections };
      }
      throw new Error("invalid retailer");
    }),

  stores: adminProcedure
    .input(
      z.object({
        retailer: z.enum(["all", "ww", "pns", "nw"]),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.getStores({
        filters: {
          retailer: input.retailer === "all" ? undefined : input.retailer,
        },
      });
    }),

  getSyncScreenData: adminProcedure.query(async ({ ctx }) => {
    return {
      // TODO(PERF) fetch in one query
      "daily-sync": await ctx.db.getJob("daily-sync"),
      "scrape/barcodes": await ctx.db.getJob("scrape/barcodes"),
      "process/images": await ctx.db.getJob("process/images"),
      "index/products": await ctx.db.getJob("index/products"),
      "index/search": await ctx.db.getJob("index/search"),
    };
  }),

  startJob: adminProcedure
    .input(
      z
        .object({
          fn: z.enum([
            "daily-sync",
            "scrape/barcodes",
            "process/images",
            "index/products",
            "index/search",
          ]),
        })
        .or(
          z.object({
            fn: z.literal("scrape/products"),
            retailer: z.enum(["ww", "pns", "nw"]),
            storeId: z.string(),
          })
        )
    )
    .mutation(async ({ input, ctx }) => {
      if (input.fn === "scrape/products") {
        await ctx.inngest.send({
          name: `scrape/products.requested`,
          data: input,
        });
        return;
      }

      await ctx.inngest.send({
        name: `${input.fn}.requested`,
        data: {},
      });
    }),

  cancelJob: adminProcedure
    .input(z.string())
    .mutation(async ({ input, ctx }) => {
      await ctx.inngest.send({
        name: `job.cancellation_requested`,
        data: {
          jobId: input,
          parentJobId: null,
        },
      });
    }),

  // summary for admin dashboard screen
  summary: adminProcedure.query<DiskUsageStatisticsRow[]>(async ({ ctx }) => {
    return ctx.db.getDiskUsageStatistics();
  }),

  // update a store
  updateStore: adminProcedure
    .input(
      iots(
        t.strict({
          storeId: t.string,
          retailer: RetailerCodec,
          updates: t.partial({
            syncSchedule: SyncScheduleCodec,
          }),
        })
      )
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.updateStore(input.retailer, input.storeId, input.updates);
    }),

  getStoresPendingSync: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.getStoresPendingSync();
  }),

  getProductDetails: adminProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.adminGetProductDetails(input);
    }),

  registerDiscordCommands: adminProcedure.mutation(async ({ ctx }) => {
    await DiscordBot.registerCommands({
      applicationId: ctx.discord.applicationId,
      botToken: ctx.discord.botToken,
    });
  }),
});
