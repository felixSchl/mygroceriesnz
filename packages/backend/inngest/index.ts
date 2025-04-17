import type { InngestFunction } from "inngest";
import {
  createInngestClient,
  type GetContext,
  type InngestClient,
} from "./client.js";
import dailySyncJob from "./fns/daily-sync.js";
import indexProductsJob from "./fns/index-products.js";
import scrapeBarcodesJob from "./fns/scrape-barcodes.js";
import scrapeProductsJob from "./fns/scrape-products.js";
import indexSearchJob from "./fns/index-search.js";
import processImagesJob from "./fns/process-images.js";
import { requestJobCancellation } from "./fns/job.js";

export type { InngestClient };

export type Inngest = {
  client: InngestClient;
  functions: InngestFunction.Any[];
};

export type InngestContext = ReturnType<GetContext<any>>;

export function createInngest<ReqArgs>(
  getContext: GetContext<ReqArgs>
): Inngest {
  const client = createInngestClient(getContext);
  function job(fn: (innges: typeof client) => any): InngestFunction.Any[] {
    const bound = fn(client);
    return [bound.run];
  }
  return {
    client,
    functions: [
      ...job(scrapeProductsJob),
      ...job(scrapeBarcodesJob),
      ...job(dailySyncJob),
      ...job(indexProductsJob),
      ...job(indexSearchJob),
      ...job(processImagesJob),
      requestJobCancellation(client),
    ],
  };
}
