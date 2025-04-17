<script lang="ts" setup>
definePageMeta({ layout: "admin" });

const trpc = useTrpc();

definePageMeta({
  layout: false,
});

const router = useRouter();
const searchInput = ref("");
const { data, status, error } = trpc.admin.searchProducts.useQuery(
  () => ({ q: searchInput.value }),
  {
    watch: [searchInput],
  },
);
</script>

<template>
  <NuxtLayout name="admin">
    <div class="flex w-full">
      <div class="flex flex-col mx-auto w-full">
        <h1 class="text-2xl font-bold mb-4">Products</h1>

        <div class="relative">
          <fa icon="search" class="absolute top-3 left-2" />
          <Input v-model="searchInput" placeholder="Search" class="pl-8" />
        </div>

        <div class="flex-1 mb-8 mt-2">
          <span>{{ data?.length ?? 0 }} products</span>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            v-for="p in data"
            :key="p.id"
            class="bg-card-background p-4 flex flex-col rounded-lg border shadow cursor-pointer"
            @click="router.push(`/admin/product/${p.id}`)"
          >
            <!-- head -->
            <div class="flex flex-col mb-4">
              <h2 v-if="p.title" class="font-bold">
                {{ p.title }}
              </h2>
              <h2 v-else>
                <span class="text-destructive">No title</span>
              </h2>

              <div v-if="p.brand" class="text-muted-foreground">
                @{{ p.brand }}
              </div>
              <div v-else>
                <span class="text-destructive">No brand</span>
              </div>
            </div>

            <img
              v-if="p.json?.image"
              :src="p.json.image"
              class="w-24 h-24"
              alt="product image"
            />

            <div class="border-b my-4"></div>

            <div class="text-xs text-muted-foreground">
              Retailers:
              <span v-for="r in p.json?.retailers" :key="r">
                <RetailerName :retailer="r" />
              </span>
            </div>

            <div v-if="p.barcode" class="text-xs text-muted-foreground mt-2">
              Barcode {{ p.barcode }}
            </div>
            <div v-else>
              <span class="text-destructive">No barcode</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  </NuxtLayout>
</template>

<style scoped>
.summary :not(:last-child)::after {
  margin-left: 0.2em;
  content: " / ";
  color: #ccc; /* TODO set up postcss */
  text-wrap: nowrap;
}
</style>
