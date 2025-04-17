import type { MetaProductDataJSON } from "@repo/db";
import { CategoryQuery } from "@repo/db/categories";
import { notEmpty } from "@repo/utils";
import { createJob } from "./job.js";
import scrapeBarcodes from "./scrape-barcodes.js";

export default createJob(
  {
    fn: "index/products",
    internal: true,
    toJobTitle: async ({}) => {
      return `Reindex products table, resolve barcodes, and re-index the meta products table`;
    },
  },
  async ({ step, ctx, inngest }) => {
    await step.run("reindex-products-table", async () => {
      await ctx.db.reindexProducts({});
    });

    await step.invoke("scrape-barcodes", {
      function: scrapeBarcodes(inngest).run,
      data: {},
    });

    await step.run("sync-meta-products-table", async () => {
      await ctx.db.syncMetaProducts();
    });

    const size = 5000;
    for (let page = 0; ; page++) {
      const thisPage = page; // capture
      const hasMore = await step.run(
        `reindex-meta-products-table-${thisPage}`,
        async () => {
          // load next batch
          const rows = await ctx.db.selectMetaProductsForIndexing({
            limit: size,
            page: thisPage,
          });

          // nothing left; we're finished!
          if (rows.length === 0) return false;

          console.log(`Processing ${rows.length} meta products...`);

          // front-load category mapping look-ups
          const catQ = await CategoryQuery.load(ctx.db);

          // pass 1: resolve data (no writes)
          // let's go! iterate each row and resolve the best available data.
          const actions: (
            | {
                id: string;
                action: "update";
                updates: {
                  title: string;
                  image: string | null;
                  brandId: string | null;
                  brandName: string | null;
                  categoryIds: string[];
                  originalJson: MetaProductDataJSON | null;
                };
              }
            | {
                id: string;
                action: "delete";
              }
          )[] = rows.map((row) => {
            const jsons = row.jsons.filter(notEmpty);

            // if there are no products backing this, we should delete it
            if (jsons.length === 0) {
              return {
                id: row.meta.id,
                action: "delete",
              };
            }

            // resolve title
            let title: string | null = null;
            for (const json of row.jsons) {
              if (title != null) break;

              switch (json?.retailer) {
                case "nw":
                case "pns": {
                  title =
                    json.name +
                    (json.displayName ? ` ${json.displayName}` : "");
                  break;
                }
                case "ww": {
                  title = json.name; // TODO now to do add the 500g etc?
                  break;
                }
              }
            }

            // resolve brand
            const brand = ctx.db.helper_resolveBrand(row.meta, jsons);

            // resolve image
            let image: string | null = null;
            for (const json of jsons) {
              if (image != null) break;
              switch (json?.retailer) {
                case "nw":
                case "pns": {
                  const id = json.productId.replace(/-.*$/g, "");
                  image = `https://a.fsimg.co.nz/product/retail/fan/image/400x400/${id}.png`;
                  break;
                }
                case "ww":
                  image = json.images.big;
                  break;
              }
            }

            // resolve categories
            const categories = Array.from(
              ctx.db.helper_resolveCategories(catQ, jsons, row.categoryIds)
            );

            if (categories.length === 0) {
              console.log(`[W] No categories found for product ${row.meta.id}`);
            }

            return {
              id: row.meta.id,
              action: "update",
              updates: {
                // TODO while this should never happen, this is probably not the
                //      best way to handle it; find a better way to handle this.
                title: title ?? "Unnamed Product",
                brandName: brand?.name ?? null,
                brandId: brand?.id ?? null,
                image,
                categoryIds: categories,
                originalJson: row.meta.json,
              },
            };
          });

          // pass 2: auto-create brand entries
          const brands = new Map<
            string,
            {
              id: string;
              name: string;
            }
          >();
          for (const action of actions) {
            if (action.action === "delete") continue;
            const updates = action.updates;
            if (updates.brandId && updates.brandName) {
              brands.set(updates.brandId, {
                id: updates.brandId,
                name: updates.brandName,
              });
            }
          }
          await ctx.db.autoCreateBrands(Array.from(brands.values()));

          // pass 3: write updates to the meta products table
          const updates = actions
            .filter((update) => update.action === "update")
            .map((x) => ({ ...x.updates, id: x.id }));
          const deletes = actions
            .filter((update) => update.action === "delete")
            .map((x) => x.id);
          await ctx.db.deleteMetaProducts(deletes);
          await ctx.db.updateMetaProducts(
            updates.map((update) => ({
              ...update,
              json: {
                ...(update.originalJson ?? {
                  // TODO improve this; this case should really never happen anyway though.
                  title: update.title,
                  retailers: [],
                  categories: [],
                  image: null,
                  unit: "Each",
                }),
                categories: update.categoryIds,
                image: update.image,
              },
            }))
          );

          return true; // there's more to do
        }
      );
      if (!hasMore) break;
    }

    await step.run("update-brand-index", async () => {
      await ctx.db.reindexBrands();
    });
  }
);
