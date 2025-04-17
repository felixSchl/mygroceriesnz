import { concurrently2 } from "@repo/utils";
import { createJob } from "./job.js";
import scrapeProducts from "./scrape-products.js";
import indexProducts from "./index-products.js";
import indexSearch from "./index-search.js";
import type { Retailer } from "@repo/db";

// IMPORTANT update this when adding new retailers
export const ALL_RETAILERS: Retailer[] = ["ww", "pns", "nw"];

export default createJob(
  {
    fn: "daily-sync",
    toJobTitle: async ({}) => {
      return `Daily sync`;
    },
    // throttle: {
    //   period: "1d",
    //   limit: 1,
    // },
  },
  async ({ inngest, step, jobId, ctx }) => {
    const stores = await step.run("get-stores-pending-sync", () =>
      ctx.db.getStoresPendingSync()
    );

    // scrape products from each store
    await Promise.all(
      ALL_RETAILERS.map(async (retailer) => {
        const storesByRetailer = stores.filter(
          (store) => store.retailer === retailer
        );
        await concurrently2(4, storesByRetailer, async (store) => {
          await step.invoke(`scrape-products-${retailer}-${store.id}`, {
            function: scrapeProducts(inngest).run,
            data: {
              retailer,
              storeId: store.id,
              parentJobId: jobId,
            },
          });
        });
      })
    );

    // update product index
    await step.invoke("update-product-index", {
      function: indexProducts(inngest).run,
      data: {
        parentJobId: jobId,
      },
    });

    // update search index
    await step.invoke("update-search-index", {
      function: indexSearch(inngest).run,
      data: {
        parentJobId: jobId,
      },
    });
  }
);
