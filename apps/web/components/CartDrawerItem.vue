<script lang="ts" setup>
import { formatStoreId } from "@repo/db/codecs";
import { xformRows } from "@repo/shared";

const props = defineProps<{
  productId: string;
}>();

const cart = useCart();
const item = computed(() => cart.items.get(props.productId));
const meta = computed(() => cart.prices.find((p) => p.id === props.productId));
const prices = computed(() => {
  if (!meta.value) return [];
  return xformRows(
    meta.value,
    cart.selectedStores.map((x) => ({
      ...x,
      key: formatStoreId(x.retailer, x.storeId),
      id: x.storeId, // TODO(TIDY) use a consistent encoding
    })),
  );
});
</script>

<template>
  <template v-if="item && meta">
    <nuxt-link
      :key="productId"
      :to="`/product/${productId}`"
      class="flex flex-col space-y-2 p-4 border rounded-lg relative"
      @click="$emit('update:open', false)"
    >
      <h4 class="text-sm font-bold tracking-tight capitalize flex items-start">
        <div class="flex-1">
          {{ item.qty }} <fa icon="times" class="mx-1" />
          {{ meta.title || "No title" }}
        </div>

        <Button
          variant="outline"
          size="icon"
          class="ml-1 mb-2"
          @click.prevent.stop="cart.updateQuantity(productId, 0)"
        >
          <fa icon="trash" />
        </Button>
      </h4>
      <div
        class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm gap-y-8 sm:gap-y-4"
      >
        <template v-if="prices.length === 0">
          <div class="text-muted-foreground">No prices found</div>
        </template>
        <div
          v-for="price in prices"
          v-else
          :key="formatStoreId(price.retailer, price.storeId)"
          class="flex gap-3 items-start"
        >
          <RetailerIcon :retailer="price.retailer" class="w-8 h-8" />
          <div class="flex flex-col items-start">
            <div class="mb-1 font-bold">
              {{ price.shortStoreName }}
            </div>
            <PriceData :price="price" />
          </div>
        </div>
      </div>
    </nuxt-link>
  </template>
</template>
