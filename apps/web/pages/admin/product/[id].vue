<script lang="ts" setup>
import type { Retailer } from "@repo/db/codecs";

const route = useRoute();
const productId = route.params.id as string;

definePageMeta({
  layout: "admin",
});

const trpc = useTrpc();
const { data, status, error } = trpc.admin.getProductDetails.useQuery(
  { id: productId },
  {},
);

const expandedStore = ref<string | null>(null);
</script>

<template>
  <ClientOnly>
    <div class="flex w-full">
      <div class="flex flex-col mx-auto w-full">
        <div class="flex flex-row justify-between">
          <h1 class="text-2xl font-bold mb-4">Product Details</h1>
          <nuxt-link
            :to="`/product/${productId}`"
            class="text-sm text-muted-foreground"
            >View Product</nuxt-link
          >
        </div>

        <div v-if="status === 'pending'">
          <AdminLoadingScreen />
        </div>
        <div v-else-if="status === 'error'">
          <AdminErrorScreen :error="error" />
        </div>
        <div v-else-if="data === null">
          <AdminErrorScreen :error="{ message: 'Product not found' }" />
        </div>
        <div v-else>
          <div class="flex flex-col">
            <table class="border">
              <tbody>
                <tr class="border-b">
                  <th class="text-right pr-4 border-r">Title</th>
                  <td class="pl-4">{{ data.meta.title }}</td>
                </tr>
                <tr>
                  <th class="text-right pr-4 border-r">Brand</th>
                  <td class="pl-4">{{ data.meta.brand }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2 class="text-xl font-bold mt-8 mb-4">Store locations</h2>

          <div class="flex flex-col">
            <div v-for="store in data.stores" :key="store.id">
              <div class="flex flex-col">
                <button
                  class="flex flex-row"
                  @click="
                    expandedStore =
                      expandedStore === store.key ? null : store.key
                  "
                >
                  <div class="flex-1 flex flex-row gap-2">
                    {{ store.name }}
                    <nuxt-link
                      :to="`/admin/stores?store=${store.retailer}-${store.id}`"
                      class="text-sm text-muted-foreground border rounded-sm px-1"
                    >
                      <fa icon="edit" />
                      Edit
                    </nuxt-link>
                  </div>
                  <div class="flex-1 text-left text-muted-foreground text-sm">
                    synced <Date :date="store.lastSynced" />
                  </div>
                </button>

                <div v-if="expandedStore === store.key">
                  <pre class="text-sm">{{
                    JSON.stringify(store.json, null, 2)
                  }}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </ClientOnly>
</template>
