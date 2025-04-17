<script setup lang="ts">
import type { Row } from "@repo/shared";
import { computed } from "vue";
import Price from "./Price.vue";

const props = defineProps<{
  price: Row;
}>();

const displayPrice = computed(() => {
  const priceData = props.price.priceData;
  if (!priceData) {
    return null;
  }

  // Check for sale price
  const salePrices = [
    ["sale", priceData.salePrice] as const,
    ["club", priceData.clubPrice] as const,
  ].filter(([_, price]) => price != null);
  salePrices.sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0));
  const bestSalePrice = salePrices[0];
  if (bestSalePrice != null) {
    return {
      type: bestSalePrice[0],
      price: bestSalePrice[1],
      referencePrice: priceData.originalPrice,
    };
  }

  // Default to original price
  return {
    price: priceData.originalPrice,
    type: "original",
    referencePrice: null,
  };
});
</script>

<template>
  <div class="flex flex-col items-end gap-2 text-muted-foreground">
    <!-- no price data available -->
    <template v-if="!displayPrice?.price">
      <span class="text-sm text-muted-foreground">-</span>
    </template>

    <!-- show summary price -->
    <div v-if="displayPrice?.price" class="flex flex-col items-end gap-1">
      <span
        class="flex items-center gap-1"
        :class="{
          'text-foreground dark:text-blue-500':
            displayPrice?.referencePrice != null, // has sale
        }"
      >
        <Price :price="displayPrice.price" />
        <fa v-if="displayPrice.type === 'sale'" icon="tag" />
        <fa v-else-if="displayPrice.type === 'club'" icon="id-card" />
      </span>
      <div v-if="displayPrice.referencePrice" class="text-sm">
        <Price :price="displayPrice.referencePrice" erased variant="sm" />
        <span v-if="price.priceData?.unit" class="text-xs">
          / {{ price.priceData.unit }}
        </span>
      </div>
    </div>

    <!-- always show multi-buy offer if available -->
    <div v-if="price.priceData?.multiBuy" class="text-sm text-muted-foreground">
      {{ price.priceData.multiBuy.quantity }}&nbsp;for&nbsp;<Price
        :price="price.priceData.multiBuy.price"
      />
    </div>
  </div>
</template>
