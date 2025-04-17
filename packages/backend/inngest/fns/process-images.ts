import { type ProductDataJSON } from "@repo/db";
import { concurrently2 } from "@repo/utils";
import type { Jsonify } from "inngest/helpers/jsonify";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import Path from "node:path";
import sharp from "sharp";
import { createJob } from "./job.js";

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

interface RetailerImage {
  url: string;
  priority: number;
}

export default createJob(
  {
    fn: "process/images",
    toJobTitle: async ({}) => {
      return `Process images`;
    },
    options: {
      concurrency: {
        limit: 4,
      },
    },
  },
  async ({ step, ctx }) => {
    const size = 100; // Process in batches
    let processed = 0;

    for (let page = 0; ; page++) {
      // Get batch of products without images
      const hasMore = await step.run(
        `process-products-page-${page}`,
        async () => {
          const products = await ctx.db.getMetaProductsWithoutImages({
            limit: size,
            offset: page * size,
          });

          if (products.length === 0) return false;

          // prepare local download directory
          const cwd = process.cwd();
          const processingDir = Path.join(cwd, ".images");
          await fs.mkdir(processingDir, { recursive: true });

          // TODO crank up concurrency
          await concurrently2(1, products, async (product) => {
            const candidates = await getRetailerImages(product.jsons);
            if (candidates.length === 0) return;

            // Try each image in priority order
            for (const image of candidates) {
              // 1. download image to a temporary file on disk
              const fileName = crypto
                .createHash("sha256")
                .update(image.url)
                .digest("hex");
              const filePath = Path.join(processingDir, fileName);
              await ctx.db.cached(
                `image-${image.url}-data`,
                60 * 60 * 24 * 30, // 30 days
                async (skip) => {
                  const response = await fetch(image.url);
                  if (!response.ok) {
                    if (response.status >= 400) {
                      // 404, 403, etc. no point retrying
                      return null;
                    }
                    return skip(null);
                  }

                  const data = await response.arrayBuffer();
                  await fs.writeFile(filePath, Buffer.from(data));
                  return filePath;
                }
              );
              if (!filePath) continue;

              // 2. validate the image
              console.log("validating...", filePath);
              // const isValid = await ctx.db.cached(
              //   `image-${image.url}-valid`,
              //   60 * 60 * 24 * 30, // 30 days
              //   async () => {
              // return validateImage(filePath);
              //   }
              // );
              const isValid = await validateImage(filePath);
              if (!isValid) continue;

              throw new Error("Not implemented");
              // 3. upload to storage
              // TODO
            }
          });

          return true;
        }
      );
      if (!hasMore) break;
    }

    return { processed };
  }
);

async function getRetailerImages(
  jsons: Jsonify<(ProductDataJSON | null)[]>
): Promise<RetailerImage[]> {
  const images: RetailerImage[] = [];

  for (const json of jsons) {
    if (!json) continue;

    switch (json.retailer) {
      case "ww":
        if (json.images?.big) {
          images.push({ url: json.images.big, priority: 1 });
        }
        break;
      case "nw":
      case "pns": {
        const id = json.productId.replace(/[^0-9]/g, "");
        images.push({
          url: `https://a.fsimg.co.nz/product/retail/fan/image/400x400/${id}.png`,
          priority: 2,
        });
        break;
      }
    }
  }

  return images.sort((a, b) => a.priority - b.priority);
}

async function validateImage(filePath: string): Promise<boolean> {
  // Basic image validation first
  const metadata = await sharp(filePath).metadata();

  // check minimum size
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width < 100 ||
    metadata.height < 100
  ) {
    return false;
  }

  // check content; is this a placeholder image?
  const buffer = await fs.readFile(filePath);

  // ask openai
  // ...

  return true;
}
