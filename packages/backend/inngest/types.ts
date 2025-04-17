import { EventSchemas } from "inngest";
import { z } from "zod";

export const schemas = new EventSchemas().fromZod({
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Job System
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  // internal use only
  "job.cancellation_requested": {
    data: z.object({
      jobId: z.string(),
      parentJobId: z.string().nullable(),
    }),
  },

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Daily Sync
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  "daily-sync.requested": {
    data: z.object({
      // job system integration
      parentJobId: z.string().optional(),
    }),
  },

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Upstream sync
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  "scrape/products.requested": {
    data: z.object({
      retailer: z.enum(["ww", "pns", "nw"]),
      storeId: z.string(),
      mode: z.optional(z.enum(["full", "fast"])),

      // job system integration
      parentJobId: z.string().optional(),
    }),
  },

  "scrape/barcodes.requested": {
    data: z.object({
      // job system integration
      parentJobId: z.string().optional(),
    }),
  },

  "process/images.requested": {
    data: z.object({
      // job system integration
      parentJobId: z.string().optional(),
    }),
  },

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // Indexing
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  "index/search.requested": {
    data: z.object({}),
  },

  "index/products.requested": {
    data: z.object({}),
  },
});
