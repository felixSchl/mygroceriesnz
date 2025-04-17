<script lang="ts" setup>
import type { PriceData, SearchHit } from "@repo/backend/trpc";
import { formatStoreId, type Retailer } from "@repo/db/codecs";
import { xformRows, type Row } from "@repo/shared";
import { useCart } from "~/stores/cart";

const cart = useCart();

const props = defineProps<{
  item: SearchHit;
}>();

const isAdding = ref(false);
async function addToCart() {
  if (isAdding.value) return;
  isAdding.value = true;
  try {
    await cart.addItem(props.item.id);
  } finally {
    isAdding.value = false;
  }
}

const isInCart = computed(() => cart.items.has(props.item.id));

async function removeFromCart() {
  await cart.updateQuantity(props.item.id, 0);
}

const priceStatus = computed(() => cart.getPriceStatus(props.item.id));
const prices = computed<Row[]>(() => {
  const prices = cart.getPrices(props.item.id, /* stale: */ true) ?? [];
  return xformRows(
    { ...props.item, prices },
    cart.selectedStores.map((x) => ({
      id: x.storeId,
      retailer: x.retailer,
      key: formatStoreId(x.retailer, x.storeId),
      name: x.name,
    })),
  ).filter((x) => x.priceData != null);
});

// TODO move this somewhere central
const getRetailerUrl = (retailer: Retailer, productId: string) => {
  switch (retailer) {
    case "ww":
      return `https://www.woolworths.co.nz/shop/productdetails?stockcode=${productId}`;
    case "nw":
      return `https://www.newworld.co.nz/shop/product/${productId}`;
    case "pns":
      return `https://www.paknsave.co.nz/shop/product/${productId}`;
    default:
      return null;
  }
};
</script>
<template>
  <Card class="border p-0">
    <CardContent class="py-4 flex flex-col h-full px-0">
      <!-- TODO use mygroceries image -->
      <nuxt-link
        class="flex sm:flex-col gap-x-4 mb-2 sm:mb-0 gap-y-4 px-4"
        :to="`/product/${item.id}`"
      >
        <img
          v-if="item.image"
          :src="item.image"
          alt="product image"
          class="w-1/4 sm:w-full max-w-[100px] mx-auto object-contain max-h-[200px] sm:max-w-[200px] h-[100px] sm:h-[200px]"
        />

        <div class="flex flex-col w-3/4">
          <div class="text-sm font-bold tracking-tight text-muted-foreground">
            {{ item.brand }}
          </div>

          <h2
            class="text-lg sm:text-sm font-bold tracking-tight capitalize"
            style="word-break: normal"
          >
            {{ item.title }}
          </h2>
        </div>
      </nuxt-link>

      <!-- prices -->
      <div v-if="priceStatus === 'loading'" class="px-4 mt-6">
        <div class="flex items-center justify-center gap-3">
          <fa icon="spinner" class="animate-spin" />
          <span class="text-muted-foreground text-sm">Loading prices...</span>
        </div>
      </div>

      <div v-else class="flex flex-col gap-4 sm:gap-2 mb-8 mt-6">
        <div v-if="prices.length === 0" class="px-4">
          <div class="flex items-center justify-center gap-3">
            <fa
              icon="exclamation-triangle"
              class="text-muted-foreground text-xl mb-1"
            />
            <span class="text-muted-foreground text-sm">
              No prices available for this product
            </span>
          </div>
        </div>

        <div
          v-for="(price, ix) in prices"
          :key="ix"
          class="flex flex-col gap-y-0 space-y-0"
        >
          <div
            class="flex items-start gap-2 px-4 border-border/50"
            :class="[ix === prices.length - 1 ? '' : 'border-b py-3']"
          >
            <div class="flex-1 overflow-hidden relative">
              <div
                class="absolute top-0 right-0 bottom-0 w-[30px] bg-gradient-to-r from-transparent to-background"
              ></div>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <div
                      class="flex flex-col"
                      :class="{
                        'text-muted-foreground': price.fallback,
                      }"
                    >
                      <template v-if="price.retailerSku">
                        <a
                          :href="
                            getRetailerUrl(price.retailer, price.retailerSku)
                          "
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <div class="sr-only">Open on retailer's website</div>
                          <div class="inline-flex gap-2 items-center">
                            <RetailerIcon
                              :retailer="price.retailer"
                              class="w-[24px] h-[24px] hover:opacity-80"
                            />
                            <span
                              class="text-sm font-semibold text-left inline"
                            >
                              {{ price.shortStoreName }}
                            </span>
                          </div>
                        </a>
                      </template>
                      <template v-else>
                        <div class="inline-flex gap-2 items-center">
                          <RetailerIcon
                            :retailer="price.retailer"
                            class="w-[24px] h-[24px] hover:opacity-80"
                          />
                          <span class="text-sm font-bold text-left inline">
                            {{ price.shortStoreName }}
                          </span>
                        </div>
                      </template>
                      <Badge
                        v-if="price.fallback"
                        variant="secondary"
                        class="w-fit mt-1"
                        >Nearby</Badge
                      >
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {{ price.storeName }}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div class="flex-shrink">
              <PriceData :price="price" />
            </div>
          </div>
        </div>
      </div>

      <div class="h-[70px] w-full flex flex-col justify-end px-4">
        <Transition name="fade" mode="out-in">
          <Button
            v-if="!isInCart"
            size="lg"
            variant="secondary"
            :disabled="isAdding"
            @click="addToCart"
          >
            <fa v-if="isAdding" icon="spinner" class="animate-spin" />
            <fa v-else icon="cart-plus" class="ml-2" />
            Add to List
          </Button>
          <div v-else class="flex flex-col gap-2">
            <NumberField
              :default-value="1"
              :min="0"
              :model-value="cart.items.get(item.id)?.qty ?? 1"
              @update:model-value="cart.updateQuantity(item.id, $event)"
            >
              <NumberFieldContent>
                <NumberFieldDecrement />
                <NumberFieldInput />
                <NumberFieldIncrement />
              </NumberFieldContent>
            </NumberField>

            <Button size="lg" variant="secondary" @click="removeFromCart">
              Remove
            </Button>
          </div>
        </Transition>
      </div>
    </CardContent>
  </Card>
</template>
