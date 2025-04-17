<script lang="ts" setup>
definePageMeta({ layout: "admin" });

const trpc = useTrpc();

definePageMeta({
  layout: false,
});

const { data, status, error, refresh } = await useAsyncData<any>(
  async () => [],
);
// trpc.admin.searchUbiquitousProducts.useQuery({});
</script>

<template>
  <NuxtLayout name="admin">
    <div class="flex w-full">
      <div class="flex flex-col mx-auto w-full">
        <h1 class="text-2xl font-bold mb-4">Products</h1>

        <div class="mb-4">{{ data?.length ?? 0 }} products</div>

        <ul class="space-y-6">
          <li
            v-for="p in data"
            :key="p.barcode"
            class="bg-gray-50 p-4 flex flex-col rounded-lg border shadow"
          >
            <!-- head -->
            <div class="flex mb-4 items-center">
              <!-- summary top-right -->
              <div class="summary flex-1 flex gap-2 items-center">
                <div v-if="p.barcode" class="font-mono text-xs font-bold">
                  {{ p.barcode }}
                </div>
                <div v-else>
                  <span class="text-red-500"> No barcode </span>
                </div>
                <div class="text-sm">
                  <span
                    v-if="p.metaProductIds.length === 0"
                    class="text-red-500"
                  >
                    <i>Not catalogued</i>
                  </span>
                  <span
                    v-else-if="p.metaProductIds.length == 1"
                    class="text-blue-500"
                  >
                    <strong>Catalogued</strong>
                  </span>
                  <span
                    v-else-if="p.metaProductIds.length > 1"
                    class="text-orange-500"
                  >
                    <fa icon="exclamation-triangle" />
                    Catalogued multiple times ({{ p.metaProductIds.length }})
                  </span>
                  <span>{{ p.jsons.length }} retailers</span>
                </div>
              </div>

              <div class="flex gap-2">
                <button class="btn">Add to Catalog</button>
              </div>
            </div>

            <div class="flex flex-col gap-4">
              <div
                v-for="{ retailer, json } in p.jsons"
                :key="retailer"
                class="p-3 bg-gray-100 rounded"
              >
                <div class="font-bold mb-4">
                  <RetailerName :retailer="retailer" />
                </div>

                <div v-if="json.retailer === 'ww'">
                  <div
                    class="dark:text-gray-500 flex gap-2 summary items-start"
                  >
                    <div>{{ json.name }}</div>
                    <div>{{ json.variety }}</div>
                    <div>
                      <span v-if="json.brand">
                        {{ json.brand }}
                      </span>
                      <span v-else>
                        <span class="text-red-500">No brand</span>
                      </span>
                    </div>
                  </div>

                  <ul class="text-gray-500 text-sm mt-2">
                    <li v-for="(x, ix) in json.departments" :key="ix">
                      {{ x.name }}
                    </li>
                  </ul>

                  <div class="mt-4">
                    <a
                      :href="`https://www.woolworths.co.nz/shop/productdetails?stockcode=${json.sku}`"
                      target="_blank"
                      class="text-blue-500"
                      >View on Woolworth's website <fa icon="external-link-alt"
                    /></a>
                  </div>
                </div>

                <div
                  v-else-if="json.retailer === 'pns' || json.retailer === 'nw'"
                  class="flex flex-col"
                >
                  <div class="flex flex-row gap-4">
                    <div class="flex flex-col gap-2 w-full flex-1">
                      <div
                        class="dark:text-gray-500 flex gap-2 summary items-start"
                      >
                        <div>{{ json.productId }}</div>
                        <div>{{ json.name }}</div>
                        <div>{{ json.displayName }}</div>
                        <div>
                          <span v-if="json.brand">
                            {{ json.brand }}
                          </span>
                          <span v-else>
                            <span class="text-red-500">No brand</span>
                          </span>
                        </div>
                      </div>
                      <ul class="text-gray-500 text-sm">
                        <li v-for="(x, ix) in json.categoryTrees" :key="ix">
                          <span v-if="x.level0">
                            {{ x.level0 }}
                            <span v-if="x.level1">
                              <span class="text-gray-400">/</span>
                              {{ x.level1 }}
                              <span v-if="x.level2">
                                <span class="text-gray-400">/</span>
                                {{ x.level2 }}</span
                              >
                            </span>
                          </span>
                        </li>
                      </ul>

                      <!-- <div class="flex gap-2 mt-4 flex-col">
                        <div class="text-sm font-bold">
                          The product is available at:
                        </div>
                        <ul class="summary flex gap-2 flex-wrap items-center">
                          <li
                            v-for="store in json.stores"
                            :key="store.id"
                            class="text-sm text-gray-500"
                          >
                            {{ store.json.name ?? store.id }}
                          </li>
                        </ul>
                      </div> -->

                      <div class="mt-4">
                        <a
                          v-if="json.retailer === 'nw'"
                          :href="`https://www.newworld.co.nz/shop/product/${json.productId}`"
                          target="_blank"
                          class="text-blue-500"
                          >View on New World's website
                          <fa icon="external-link-alt"
                        /></a>
                        <a
                          v-else-if="json.retailer === 'pns'"
                          :href="`https://www.paknsave.co.nz/shop/product/${json.productId}`"
                          target="_blank"
                          class="text-blue-500"
                          >View on Pak'nSave website
                          <fa icon="external-link-alt"
                        /></a>
                      </div>
                    </div>

                    <figure class="bg-white rounded-lg border p-2 h-fit">
                      <img
                        :src="`https://a.fsimg.co.nz/product/retail/fan/image/400x400/${json.productId.replace(/-.*$/, '')}.png`"
                        alt="Product image"
                        width="200"
                        heigth="200"
                      />
                      <figcaption
                        class="text-xs text-center mt-2 text-gray-500"
                      >
                        {{ json.productId }}
                      </figcaption>
                    </figure>
                  </div>
                </div>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </NuxtLayout>
</template>

<style scoped>
.summary :not(:last-child)::after {
  content: " / ";
  color: #ccc; /* TODO set up postcss */
  text-wrap: nowrap;
}
</style>
