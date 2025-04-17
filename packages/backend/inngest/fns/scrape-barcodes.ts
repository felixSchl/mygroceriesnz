import * as PNS from "@repo/adapter-pns";
import { createJob } from "./job.js";
import { PNSDBTokenStore } from "../../support/pns/PNSDBTokenStore.js";
import { validateGTIN } from "@repo/utils";

export default createJob(
  {
    fn: "scrape/barcodes",
    internal: true,
    toJobTitle: async ({}) => {
      return `Resolve Barcodes`;
    },
    // concurrency: {
    //   limit: 1,
    // },
  },
  async ({ step, ctx }) => {
    console.log("scraping barcodes products.");

    // IMPORTANT implemented as a single step because the list we are processing
    //           mutates as we go and retrying the step on failure does not undo
    //           any of the work we managed to do complete the failure.
    //           Eventually, there will be no more work to do and the step will
    //           complete successfully.
    //      TODO after initial indexing we expect only a handful of barcodes to
    //           be missing whenever this step runs, so the step completes in
    //           acceptable time. we could instead lift the step into a while
    //           loop itself to make this more efficient.
    const count = await step.run("reindex-barcodes", async () => {
      return ctx.db.reindexBarcodes({
        concurrency: 20,
        loadBarcode: async (json) => {
          if (!json) return;

          // WW: barcodes are available in the product details; no need to scrape.
          if (json.retailer === "ww") {
            return json.barcode;
          }

          // NW/PNS: barcodes must be loaded separately.
          // we cache barcodes indefinitely because they are static
          // TODO we could remove them from the 'cached' table and do this look up
          //      on the products table instead (small space optimisation.)
          return ctx.db.cached(
            `barcode:${json.retailer}:${json.productId}`,
            Infinity, // barcode assignments are static
            async (skip) => {
              console.log(
                "[pns]resolving barcode; product=" +
                  json.productId +
                  "; using store-id=" +
                  json.storeId
              );

              // hit the API to get the product details
              const result = await PNS.API.getProductDetails({
                retailer: json.retailer,
                storeId: json.storeId,
                productId: json.productId,
                tokenStore: new PNSDBTokenStore(ctx.db),
              });

              if (result._tag === "Left") {
                console.log(
                  "[pns]failed to fetch product details; product=" +
                    json.productId +
                    "; error=" +
                    result.left
                );
                return skip(null);
              }

              if (
                result.right.sku == null ||
                !isValidBarcode(result.right.sku)
              ) {
                return null;
              }

              return result.right.sku;
            }
          );
        },
      });
    });

    return {
      barcodesDiscovered: count,
    };
  }
);

// TODO Extract
function isValidBarcode(value: string) {
  return validateGTIN(value)._tag === "Right";
}
