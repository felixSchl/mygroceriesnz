import * as PNS from "@repo/adapter-pns";
import * as WW from "@repo/adapter-ww";
import { concurrently2, notEmpty, sleep } from "@repo/utils";
import type { GetFunctionInput } from "inngest";
import { PNSDBTokenStore } from "../../support/pns/PNSDBTokenStore.js";
import { type InngestClient } from "../client.js";
import { createJob } from "./job.js";
import { StoreIdCodec } from "@repo/db";

const storeNames = new Map<string, string>();

export default createJob(
  {
    fn: "scrape/products",
    toJobId: (event) => event.data.retailer + "-" + event.data.storeId,
    toJobIdCLE: 'event.data.retailer + "-" + event.data.storeId',
    toJobTitle: async (event, ctx) => {
      const retailer = event.data.retailer;
      const storeId = event.data.storeId;
      const key = StoreIdCodec.encode(`${retailer}-${storeId}`);

      // resolve store name
      const storeName = await (async () => {
        const cachedName = storeNames.get(key);
        if (cachedName) return cachedName;
        const name = await ctx.db.getStoreName(storeId);
        if (!name) return storeId; // fallback to storeId if we don't have a name
        storeNames.set(key, name);
        return name;
      })();

      const retailerName = {
        ww: "Woolworths",
        pns: "New World",
        nw: "New World",
      }[retailer];

      return `Sync products from ${retailerName} store ${storeName}`;
    },

    // TODO this doesn't work. for some reason it still applies if cancelled.
    // limit to 1 run per day per retailer/store
    // rateLimit: {
    //   limit: 1,
    //   period: "1d",
    // },

    // limit concurrent executions for the same retailer
    options: {
      concurrency: {
        limit: 6,
        key: `event.data.retailer`,
      },
    },
  },
  async ({ event, step, ctx }) => {
    const mode = event.data.mode ?? "fast";

    // scrape catalog
    const summary = await (async () => {
      if (event.data.retailer === "ww") {
        return await scrapeWoolworths(event.data.storeId, mode, step, ctx);
      }

      if (event.data.retailer === "pns" || event.data.retailer === "nw") {
        return await scrapeNewWorld(
          event.data.retailer,
          event.data.storeId,
          step,
          ctx
        );
      }

      throw new Error(`Unsupported retailer: ${event.data.retailer}`);
    })();

    await step.run("update-last-synced-at", async () => {
      await ctx.db.updateStoreLastSyncedAt(
        event.data.retailer,
        event.data.storeId,
        { now: new Date() }
      );
    });

    return summary;
  }
);

async function scrapeWoolworths(
  storeId: string,
  mode: "full" | "fast",
  step: GetFunctionInput<InngestClient>["step"],
  ctx: GetFunctionInput<InngestClient>["ctx"]
) {
  // load DAS filters for this run
  const categories = await step.run("load-das-filter", async () => {
    const response = await WW.API.getShell(storeId);
    return response.categories;
  });

  const items: {
    department: string;
    aisle: string;
    shelf: string;
    catId: string;
  }[] = [];

  for (const dept of categories) {
    for (const aisle of dept.children) {
      for (const shelf of aisle.children) {
        items.push({
          department: dept.name,
          aisle: aisle.name,
          shelf: shelf.name,
          catId: String(shelf.id),
        });
      }
    }
  }

  // there's a 1000 step limit per function. so we split the work by department/shelf.
  const grouped: Map<string, typeof items> = new Map();
  for (const item of items) {
    const groupKey = `${item.department}>${item.aisle}`;
    const xs = grouped.get(groupKey) ?? [];
    xs.push(item);

    grouped.set(groupKey, xs);
  }

  let total = 0;
  await concurrently2(6, Array.from(grouped.entries()), async ([k, items]) => {
    total += await step.run(
      `load-products:ww:dept=${k};mode=${mode}`,
      async () => {
        // items are grouped by department/aisle and map to a list of shelves.
        // in fast mode we don't iterate each each shelf (since we won't be
        // quering for it.) Thus, we only take the first shelf (any will do.)
        if (mode === "fast") {
          items = items.slice(0, 1);
        }

        let subtotal = 0;
        for (const item of items) {
          let totalInCat = 0;
          const { department, aisle, shelf, catId } = item;
          for (let page = 0; page < 121 /* max */; page++) {
            const count = await (async () => {
              const dasFilters = [
                `Department;;${department};false`,
                `Aisle;;${aisle};false`,
                mode === "full" ? `Shelf;;${shelf};false` : null,
              ].filter(notEmpty);

              console.log(
                `[ww]loading products; store-id=${storeId}; cat=${catId}; page=${page}; filters=${dasFilters.join("&")}`
              );

              // load products
              const result = await WW.API.searchProducts({
                page,
                dasFilters,
                storeId,
              });

              // handle API error
              if (result._tag === "Left") {
                throw new Error(
                  `failed to fetch products; error=${result.left}`
                );
              }

              // upsert products into database
              await ctx.db.upsertProducts(
                result.right.products.map((r) => ({
                  ...WW.ProductCodec.encode({
                    ...r,
                  }),
                  codec: 1,
                  storeId,
                  retailer: "ww",

                  // if we're in "fast" mode we do not have the category
                  // information available, since we are correlating categories
                  // based on where we found the product.
                  categoryIds: mode === "full" ? [catId] : undefined,
                }))
              );

              // // sleep for a random time between 200-300ms so as to not overload the server
              // const sleepTimes = [50, 200] as const;
              // const sleepTime =
              //   sleepTimes[Math.floor(Math.random() * sleepTimes.length)]!;
              // await sleep(sleepTime);

              // return count
              return result.right.products.length;
            })();

            totalInCat += count;
            subtotal += count;

            if (count === 0) break;
          }
        }
        return subtotal;
      }
    );
  });

  return {
    total,
  };
}

async function scrapeNewWorld(
  retailer: "pns" | "nw",
  storeId: string,
  step: GetFunctionInput<InngestClient>["step"],
  ctx: GetFunctionInput<InngestClient>["ctx"]
) {
  console.log(`[${retailer}]loading categories`);
  const tokenStore = new PNSDBTokenStore(ctx.db);

  const cats = await step.run("load-categories", async () => {
    const cats = await PNS.API.getCategories(storeId, retailer, tokenStore);
    console.log(`[${retailer}]loaded categories; count=${cats.length}`);
    return cats;
  });

  let total = 0;
  await concurrently2(6, cats, async ({ l0, l1 }) => {
    const cat = [l0, l1].filter(notEmpty).join(">"); // for debugging

    // skip some categories
    if (l0 === "Featured") {
      console.log(`skipping featured category; cat=${cat}`);
      return;
    }

    let totalInCat = 0;
    for (let page = 0; ; page++) {
      console.log(
        `[${retailer}]loading products; store=${storeId}; cat=${cat}; page=${page}`
      );

      const count = await step.run(
        `load-products;cat=${cat};page=${page}`,
        async () => {
          const result = await PNS.API.searchProducts(retailer, {
            tokenStore,
            storeId,
            page,
            category0NI: l0,
            category1NI: l1,
          });

          if (result == null) {
            throw new Error(`failed to fetch products (unknown error)`);
          }

          await ctx.db.upsertProducts(
            result.products.map((r) => ({
              ...r,
              codec: 1,
              storeId,
              retailer,
            }))
          );

          // // sleep for a random time between 200-300ms so as to not overload the server
          // const sleepTimes = [50, 200] as const;
          // const sleepTime =
          //   sleepTimes[Math.floor(Math.random() * sleepTimes.length)]!;
          // await sleep(sleepTime);

          return result.products.length;
        }
      );

      totalInCat += count;
      total += count;

      if (count === 0) break;
    }

    console.log(
      `[${retailer}]completed category; store=${storeId}; cat=${cat}; product-count=${totalInCat}`
    );
  });

  console.log(
    `[${retailer}]completed store; store=${storeId}; product-count=${total}`
  );

  return {
    total,
  };
}
