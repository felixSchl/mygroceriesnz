import { createJob } from "./job.js";

export default createJob(
  {
    fn: "index/search",
    toJobTitle: async ({}) => {
      return `Refresh Search Index`;
    },
  },
  async ({ step, ctx }) => {
    await step.run("recreate-product-scratch-index", () => {
      return ctx.search.recreateScratchProductIndex();
    });

    let page = 0;
    let total = 0;
    while (true) {
      const count = await step.run(
        `sync-product-search-index-page-${page}`,
        () => {
          return ctx.search.syncProductIndexPage(ctx.db, page);
        }
      );
      if (count === 0) {
        break;
      }

      page++;
      total += count;
    }

    await step.run("swap-product-search-index", () => {
      return ctx.search.swapScratchProductIndex();
    });

    await step.run("sync-store-search-index", () => {
      return ctx.search.syncStoreIndex(ctx.db);
    });

    return {
      totalProducts: total,
    };
  }
);
