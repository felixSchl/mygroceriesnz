<script lang="ts" setup>
import JobCard from "~/components/admin/JobCard.vue";
definePageMeta({ layout: "admin" });

const trpc = useTrpc();

const { data, error, refresh } = await trpc.admin.getSyncScreenData.useQuery();

const POLL_INTERVAL = 2000;

// poll every 5 seconds
let i: any = null;
onMounted(() => {
  i =
    i ??
    setInterval(() => {
      refresh();
    }, POLL_INTERVAL);
});

onBeforeUnmount(() => {
  clearInterval(i);
  i = null;
});
</script>

<template>
  <div v-if="error">
    <AdminErrorScreen :error="error" />
  </div>
  <div v-else-if="!data">
    <AdminLoadingScreen />
  </div>
  <div v-else>
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 px-2 xl:px-0">
      <JobCard
        :poll-interval="POLL_INTERVAL"
        type="daily-sync"
        :job="data['daily-sync']"
      >
        <template #title>Daily Sync</template>
        <template #description>
          <div>
            The daily sync is scheduled to run at midnight NZT. This job
            downloads the entire product catalog from a handful of
            representative stores for each of the supported retailers, resolves
            any missing barcodes, uploads any missing images, updates the
            product catalog, and updates the search index.

            <div v-if="false" class="mt-4">
              <p class="text-lg font-bold">Breakdown</p>
              <ul class="list-disc list-outside mt-2 pl-[1em]">
                <li>
                  <strong class="text-accent-foreground">Download</strong> the
                  entire product catalog from a handful of representative stores
                  for each of the supported retailers.
                </li>
                <li>Run the <strong>Update product Index</strong> job.</li>
                <li>Run the <strong>Update Search Index</strong> job.</li>
              </ul>
            </div>
          </div>
        </template>
      </JobCard>

      <JobCard
        :poll-interval="POLL_INTERVAL"
        type="scrape/barcodes"
        :job="data['scrape/barcodes']"
      >
        <template #title>Fill Barcodes</template>
        <template #description>
          This job runs as part of daily sync, but can be scheduled individually
          as well. It finds any products missing barcodes and attempts to fill
          them in by scraping the retailer's website. Barcodes are assigned for
          the lifetime of the product, so this job only needs to be run once per
          retailer/SKU.
        </template>
      </JobCard>

      <JobCard
        :poll-interval="POLL_INTERVAL"
        type="process/images"
        :job="data['process/images']"
      >
        <template #title>Process Images</template>
        <template #description>
          Processes images for all products that don't have images.
        </template>
      </JobCard>

      <JobCard
        :poll-interval="POLL_INTERVAL"
        type="index/products"
        :job="data['index/products']"
      >
        <template #title>Update Product Index</template>
        <template #description>
          This job runs as part of daily sync, but can be scheduled individually
          as well. It collates the MyGroceries product catalog by sourcing
          available products from all retailers. The collated catalog serves as
          the source of truth for the search index.

          <div v-if="false" class="mt-4">
            <div class="text-lg font-bold">Breakdown</div>
            <ul class="list-disc list-outside mt-2 pl-[1em]">
              <li>
                Re-index the
                <strong class="text-accent-foreground"
                  >retailer products table</strong
                >
                by sampling product data available across all of the retailer's
                store locations. This information is used to query product
                information that is not store specific, such as it's barcode,
                name, and brand.
              </li>
              <li>Run the <strong>Fill Barcodes</strong> job.</li>
              <li>
                Synchronise
                <strong class="text-accent-foreground">
                  meta products table
                </strong>
                with the retailer products table. Create any missing meta
                products and update existing ones. When a new meta product is
                created, it is assigned a unique identifier that is used to link
                it to the
                <strong class="text-muted-foreground"
                  >retailer products table.</strong
                >
                Products are linked based on their
                <strong class="text-muted-foreground">barcode.</strong>
              </li>
              <li>
                Re-index the
                <strong class="text-accent-foreground">
                  meta products table
                </strong>
                by resolving meta data such brand information, category
                assignments, images, and more. This process also creates any
                missing entries in the
                <strong class="text-muted-foreground">brands table</strong>
                automatically.
              </li>
              <li>
                Re-index the
                <strong class="text-accent-foreground">brands table</strong> by
                calculating any missing brand information such as the number of
                products associated with the brand.
              </li>
            </ul>
          </div>
        </template>
      </JobCard>

      <JobCard
        :poll-interval="POLL_INTERVAL"
        type="index/search"
        :job="data['index/search']"
      >
        <template #title>Update Search Index</template>
        <template #description>
          This job runs as part of daily sync, but can be scheduled individually
          as well. It reindexes the MyGroceries product catalog to make it
          searchable by the search engine. The search index is used to power the
          search feature on the website & app.
        </template>
      </JobCard>
    </div>
  </div>
</template>
