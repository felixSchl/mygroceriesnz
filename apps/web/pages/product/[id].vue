<script lang="ts" setup>
import type { CategoryTreeNode } from "@repo/db";
import { formatStoreId, parseStoreId, type Retailer } from "@repo/db/codecs";
import { xformRows } from "@repo/shared";
import { formatDistance } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

const trpc = useTrpc();
const route = useRoute();
const productId = route.params.id as string;
const cart = useCart();
const user = useUser();

// get server rendered meta for SEO
// TODO can we avoid this on CSR routing?
const { data: ssrData } = await trpc.productInfo.useQuery(
  () => ({
    productId,
    noPrices: true,
  }),
  {
    server: true,
  },
);

// get store keys passed-in via query params
// these will be loaded in addition to any stores the user has selected
const additionalStores = computed(() => {
  if (!route.query.s) return [];
  const parts =
    typeof route.query.s === "string"
      ? route.query.s.split(",")
      : route.query.s;
  if (parts.length === 0) return [];
  const seen = new Set<string>();
  const out: {
    retailer: Retailer;
    storeId: string;
  }[] = [];
  for (const part of parts) {
    const storeId = parseStoreId(part);
    if (storeId == null) continue;
    if (seen.has(storeId.id)) continue;
    seen.add(storeId.id);
    out.push({
      retailer: storeId.retailer,
      storeId: storeId.id,
    });
  }
  return out;
});

const combinedStores = computed(() => {
  const out: {
    key: string;
    retailer: Retailer;
    storeId: string;
    name: string | null;
  }[] = [];

  const seen = new Set<string>();

  // add explicit stores
  for (const [key, store] of cart.stores) {
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      retailer: store.retailer,
      storeId: store.storeId,
      name: store.name,
    });
  }

  // add additional stores
  for (const store of additionalStores.value) {
    if (seen.has(store.storeId)) continue;
    seen.add(store.storeId);
    out.push({
      key: formatStoreId(store.retailer, store.storeId),
      retailer: store.retailer,
      storeId: store.storeId,
      name: null,
    });
  }
  return out;
});

const { data, status, refresh } = await trpc.productInfo.useQuery(
  () => ({
    productId,
    noPrices: true,
  }),
  {
    lazy: true,
    server: false,
  },
);

// get prices separately, so we can render something while loading
const { data: prices, status: pricesStatus } = trpc.getPrices.useQuery(
  () => ({
    productIds: [productId],
    stores: combinedStores.value.map((x) => x.key),
    location: cart.location
      ? {
          lat: cart.location.lat,
          lng: cart.location.lng,
        }
      : undefined,
  }),
  {
    server: false,
  },
);

const isInCart = computed(() => cart.items.has(productId));
const toast = useToast();

async function removeFromCart() {
  await cart.updateQuantity(productId, 0);
  toast.success("Removed from Cart");
}

watch(cart.stores, () => {
  refresh();
});

const ctx = useAppContext();

const cat = computed(() => {
  // TODO maybe we should store this in the DB?
  // find the "deepest" category id (build the longest trail.)
  // the problem is that in the DB we store a set of cat ids at any
  // level in the hierarchy so for a path "A/B/C" we store the set {A,B,C}.
  let best: CategoryTreeNode | null = null;
  let bestLevel = -1;

  for (const catId of data.value?.categoryIds ?? []) {
    const node = ctx.catQuery.get(catId);
    if (node == null) continue;
    const level = ctx.catQuery.levelOf(catId);
    if (level > bestLevel) {
      best = node;
      bestLevel = level;
    }
  }

  if (best == null) return [];

  console.log("best", best);

  // build trail
  const trail: string[] = [...ctx.catQuery.parentsOf(best.id), best.id];
  return trail.map((id) => ctx.catQuery.get(id)).filter((x) => x != null);
});

const breadcrumbItems = computed(() => [
  { href: "/search", label: "All Products" },
  ...cat.value.map((category) => ({
    href: `/search?cat=${category.id}`,
    label: category.name,
  })),
]);

const isAdding = ref(false);
const minLoadingTime = 200;
async function addToCart() {
  if (isAdding.value) return;
  isAdding.value = true;
  const now = Date.now();
  try {
    await cart.addItem(productId);
    // wait at least 'minLoadingTime'
    const elapsed = Date.now() - now;
    if (elapsed < minLoadingTime) {
      await new Promise((resolve) =>
        setTimeout(resolve, minLoadingTime - elapsed),
      );
    }
    toast.success("Added to Cart");
  } finally {
    isAdding.value = false;
  }
}

// TODO move this somewhere central
// IMPORTANT this code is duplicated in ProductCard.vue
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

const rows = computed(() =>
  data.value == null
    ? []
    : xformRows(
        { ...data.value, prices: prices.value ?? [] },
        combinedStores.value.map((x) => ({
          ...x,
          id: x.storeId, // TODO(TIDY) use a consistent encoding
        })),
      ),
);

// Add meta/SEO composables
useHead(() => ({
  title: ssrData.value
    ? `${ssrData.value.title} - Price Comparison | MyGroceries`
    : "Product Not Found | MyGroceries",
  meta: [
    {
      name: "description",
      content: ssrData.value
        ? `Compare prices for ${ssrData.value.title} across different stores. Find the best deals and save money.`
        : "Product price comparison",
    },
    // Open Graph tags for social sharing
    {
      property: "og:title",
      content: ssrData.value
        ? `${ssrData.value.title} - Price Comparison`
        : "Product Not Found",
    },
    {
      property: "og:description",
      content: ssrData.value
        ? `Compare prices for ${ssrData.value.title} across different stores. Find the best deals and save money.`
        : "Product price comparison",
    },
    {
      property: "og:image",
      content: ssrData.value?.image || "",
    },
    {
      property: "og:type",
      content: "product",
    },
  ],
}));

const canShare = ref(false);
onMounted(() => {
  // Only enable native sharing on mobile devices
  canShare.value = !!navigator?.share && window.innerWidth <= 768;
});

const isCopying = ref(false);

async function shareProduct() {
  const title = data.value?.title;
  if (title == null) return;

  let url = window.location.href;

  // add stores into url (limit to 10)
  const stores = [
    ...cart.stores.values(),
    ...additionalStores.value.map((x) => ({
      ...x,
      store: x.storeId, // compat
    })),
  ].slice(0, 10);
  url += `?s=${stores.map((s) => formatStoreId(s.retailer, s.storeId)).join(",")}`;

  // Use native share on mobile
  if (canShare.value) {
    try {
      await navigator.share({
        title,
        text: `Check out ${title} on MyGroceries`,
        url,
      });
      return; // Exit early after successful share
    } catch (err) {
      console.error("Share failed:", err);
      // Fall through to copy functionality if share fails
    }
  }

  // Copy to clipboard (default on desktop or fallback on mobile)
  try {
    await navigator.clipboard.writeText(url);
    isCopying.value = true;
    toast.success("Link copied to clipboard!");
    setTimeout(() => {
      isCopying.value = false;
    }, 2000);
  } catch (err) {
    console.error("Copy failed:", err);
    toast.error("Failed to copy link");
  }
}

const hasAnyStores = computed(
  () =>
    combinedStores.value.length > 0 ||
    // if location is set, server selects (will always be some)
    cart.location,
);
</script>

<template>
  <div class="pt-8">
    <transition name="fade" mode="out-in">
      <!-- loading state -->
      <div v-if="status === 'pending' && data == null" key="loading">
        <ClientOnly>
          <LoadingScreen />
        </ClientOnly>
      </div>

      <!-- error state -->
      <div v-else-if="status === 'error'" key="error">
        <ErrorScreen />
      </div>

      <!-- empty state -->
      <div v-else-if="!data && status !== 'pending'" key="empty" class="my-24">
        <ClientOnly>
          <EmptyScreen>
            <template #title> Product Not Found </template>
            <template #default>
              We couldn't find the product you're looking for. It might have
              been removed or is no longer available.
            </template>
          </EmptyScreen>
        </ClientOnly>
      </div>

      <!-- product state -->
      <div v-else key="product">
        <!-- breadcrumb -->
        <ClientOnly>
          <template #fallback>
            <div class="h-6"></div>
          </template>
          <Breadcrumb class="mb-4">
            <BreadcrumbList>
              <template v-for="(item, i) in breadcrumbItems" :key="i">
                <template v-if="i !== breadcrumbItems.length - 1">
                  <BreadcrumbItem>
                    <nuxt-link as-child :to="item.href">
                      <BreadcrumbLink>
                        {{ item.label }}
                      </BreadcrumbLink>
                    </nuxt-link>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </template>
                <template v-else>
                  <BreadcrumbItem>
                    <nuxt-link as-child :to="item.href">
                      <BreadcrumbLink>
                        {{ item.label }}
                      </BreadcrumbLink>
                    </nuxt-link>
                  </BreadcrumbItem>
                </template>
              </template>
            </BreadcrumbList>
          </Breadcrumb>
        </ClientOnly>

        <!-- product info -->
        <div
          class="flex flex-col sm:flex-row gap-6 bg-card p-6 rounded-lg shadow border"
        >
          <div class="flex-shrink-0">
            <img
              :src="data?.image ?? undefined"
              :alt="data?.title ?? undefined"
              class="w-full sm:w-64 rounded-lg object-cover"
            />
          </div>
          <div class="flex-grow">
            <div class="flex">
              <h1 class="text-2xl font-bold mb-2 flex-1">{{ data?.title }}</h1>

              <Button variant="secondary" as-child>
                <nuxt-link
                  v-if="user?.role === 'admin'"
                  :to="`/admin/product/${productId}`"
                >
                  <fa icon="edit" /> Edit
                </nuxt-link>
              </Button>
            </div>

            <p
              v-if="data?.description?.trim()"
              class="text-muted-foreground mb-4"
            >
              {{ data?.description }}
            </p>
            <p v-else class="text-muted-foreground mb-4">
              No description available
            </p>

            <div class="flex flex-col sm:flex-row gap-y-2 gap-x-4">
              <Button
                v-if="!isInCart"
                size="lg"
                variant="default"
                :disabled="isAdding"
                class="w-full sm:max-w-[200px]"
                @click="addToCart"
              >
                <fa v-if="isAdding" icon="spinner" class="animate-spin" />
                <fa v-else icon="cart-plus" class="ml-2" />
                <Transition
                  enter-active-class="transition-all duration-200"
                  enter-from-class="opacity-0 w-0"
                  enter-to-class="opacity-100 w-4"
                  leave-active-class="transition-all duration-200"
                  leave-from-class="opacity-100 w-4"
                  leave-to-class="opacity-0 w-0"
                >
                  <div v-if="isAdding">
                    <fa icon="spinner" class="animate-spin" />
                  </div>
                </Transition>
                Add to List
              </Button>

              <div v-else class="flex flex-col gap-2 max-w-[200px]">
                <NumberField
                  :default-value="1"
                  :min="0"
                  :model-value="cart.items.get(productId)?.qty ?? 1"
                  @update:model-value="cart.updateQuantity(productId, $event)"
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

              <Button
                variant="outline"
                size="lg"
                class="w-full sm:max-w-[200px]"
                @click="shareProduct"
              >
                <fa
                  :icon="isCopying ? 'check' : canShare ? 'share' : 'copy'"
                  class="mr-2"
                />
                {{ isCopying ? "Copied!" : canShare ? "Share" : "Copy Link" }}
              </Button>
            </div>
          </div>
        </div>

        <!-- Price Comparisons -->
        <ClientOnly>
          <div class="mt-8 pb-32">
            <h2 class="text-lg font-semibold mb-4">Compare Prices</h2>
            <div v-if="pricesStatus === 'pending' && prices == null">
              <LoadingScreen />
            </div>
            <div
              v-else-if="hasAnyStores"
              class="bg-card rounded-lg shadow-sm border overflow-clip"
            >
              <!-- Desktop table -->
              <table class="w-full border-collapse hidden lg:table p-3 sm:p-6">
                <thead class="!text-sm">
                  <tr class="text-left border-b !border-muted">
                    <th class="pb-4 font-medium text-muted-foreground">
                      Retailer
                    </th>
                    <th class="pb-4 font-medium text-muted-foreground">
                      Store
                    </th>
                    <th
                      class="pb-4 font-medium text-muted-foreground text-right"
                    >
                      Updated
                    </th>
                    <th
                      class="pb-4 font-medium text-muted-foreground text-right"
                    >
                      Original Price
                    </th>
                    <th
                      class="pb-4 font-medium text-muted-foreground text-right"
                    >
                      Sale Price
                    </th>
                    <th
                      class="pb-4 font-medium text-muted-foreground text-right"
                    >
                      Club Price
                    </th>
                    <th class="pb-4 font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in rows"
                    :key="row.key"
                    class="border-b !border-border last:border-none"
                    :class="{
                      'bg-green-400/5': row.isBestPrice,
                    }"
                  >
                    <td class="py-4">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger class="cursor-default">
                            <div class="flex items-center gap-2">
                              <template v-if="row.retailerSku">
                                <a
                                  :href="
                                    getRetailerUrl(
                                      row.retailer,
                                      row.retailerSku,
                                    )!
                                  "
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  class="hover:opacity-80 transition-opacity"
                                >
                                  <div class="sr-only">
                                    Open on retailer's website
                                  </div>
                                  <RetailerIcon
                                    :retailer="row.retailer"
                                    class="w-[24px] h-[24px]"
                                  />
                                </a>
                              </template>
                              <template v-else>
                                <RetailerIcon
                                  :retailer="row.retailer"
                                  class="w-[32px] h-[32px]"
                                />
                              </template>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">{{
                            row.storeName
                          }}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    <td
                      class="py-4 text-foreground flex flex-wrap gap-2"
                      :class="{
                        'opacity-50 !font-normal': row.fallback,
                      }"
                    >
                      <template v-if="row.retailerSku">
                        <a
                          :href="getRetailerUrl(row.retailer, row.retailerSku)!"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="hover:opacity-80 transition-opacity"
                        >
                          {{ row.storeName
                          }}<fa icon="external-link" class="w-3 h-3 ml-1.5" />
                        </a>
                      </template>
                      <template v-else>
                        {{ row.storeName }}
                      </template>
                      <Badge v-if="row.fallback" variant="outline">
                        Nearby
                      </Badge>
                    </td>
                    <td class="py-4 text-right text-muted-foreground">
                      <template v-if="row.lastSyncedAt">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipContent>
                              Store last updated on
                              {{
                                formatInTimeZone(
                                  new Date(row.lastSyncedAt),
                                  "Pacific/Auckland",
                                  "do MMM yyyy",
                                )
                              }}
                            </TooltipContent>
                            <TooltipTrigger
                              class="cursor-default whitespace-nowrap"
                            >
                              <span>
                                {{
                                  formatDistance(
                                    new Date(),
                                    new Date(row.lastSyncedAt),
                                  )
                                }}
                                ago
                              </span>
                            </TooltipTrigger>
                          </Tooltip>
                        </TooltipProvider>
                      </template>
                      <span v-else class="text-muted-foreground">-</span>
                    </td>
                    <td class="py-4 text-right">
                      <div
                        v-if="row.priceData?.originalPrice"
                        class="flex flex-col items-end"
                        :class="[
                          row.priceData.salePrice || row.priceData.clubPrice
                            ? 'text-muted-foreground/50 opacity-70'
                            : 'text-foreground',
                        ]"
                      >
                        <div class="flex items-center">
                          <Price
                            :price="row.priceData.originalPrice"
                            :erased="
                              row.priceData?.salePrice != null ||
                              row.priceData?.clubPrice != null
                            "
                          />
                          <span
                            v-if="row.priceData.unitDisplay"
                            class="text-xs text-muted-foreground ml-1"
                          >
                            / {{ row.priceData.unitDisplay }}
                          </span>
                        </div>

                        <!-- unit price -->
                        <div class="flex items-center">
                          <span
                            v-if="row.priceData.unitPrice"
                            class="text-xs text-muted-foreground ml-1"
                          >
                            <Price
                              :price="row.priceData.unitPrice"
                              no-bold
                              variant="sm"
                            />
                            / {{ row.priceData.unit }}
                          </span>
                        </div>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger as-child>
                              <sup
                                v-if="row.priceData.isFallbackPrice"
                                class="text-xs text-muted-foreground ml-1 cursor-pointer"
                              >
                                <fa icon="asterisk" />
                              </sup>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Approximate price from nearby store.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <span v-else class="text-muted-foreground">-</span>
                    </td>
                    <td class="py-4 text-right">
                      <div class="flex flex-col gap-2 items-end">
                        <div v-if="row.priceData?.salePrice">
                          <Price :price="row.priceData.salePrice" />
                        </div>
                        <TooltipProvider v-if="row.priceData?.multiBuy">
                          <Tooltip>
                            <TooltipTrigger as-child>
                              <div class="text-xs flex gap-1 items-baseline">
                                {{
                                  row.priceData.multiBuy.quantity
                                }}&nbsp;for&nbsp;<Price
                                  :price="row.priceData.multiBuy.price"
                                  variant="sm"
                                />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                Multi-buy special:
                                {{ row.priceData.multiBuy.quantity }} for ${{
                                  row.priceData.multiBuy.price.toFixed(2)
                                }}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <span
                          v-if="
                            !row.priceData?.multiBuy &&
                            !row.priceData?.salePrice
                          "
                          class="text-muted-foreground"
                          >-</span
                        >
                      </div>
                    </td>
                    <td class="py-4 text-right">
                      <span
                        v-if="row.priceData?.clubPrice"
                        class="text-foreground"
                      >
                        <Price :price="row.priceData.clubPrice" />
                      </span>
                      <span v-else class="text-muted-foreground">-</span>
                    </td>
                    <td class="py-4 text-right">
                      <Button
                        v-if="cart.stores.has(`${row.retailer}-${row.storeId}`)"
                        variant="outline"
                        size="sm"
                        @click="
                          cart.removeStore({
                            retailer: row.retailer,
                            storeId: row.storeId,
                            name: row.storeName,
                          })
                        "
                      >
                        <fa
                          icon="times"
                          class="text-muted-foreground hover:text-destructive"
                        />
                        Untrack
                      </Button>
                      <Button
                        v-else
                        variant="outline"
                        size="sm"
                        @click="
                          cart.addStore({
                            retailer: row.retailer,
                            storeId: row.storeId,
                            name: row.storeName,
                          })
                        "
                      >
                        <fa icon="plus" class="mr-1" /> Track Store
                      </Button>
                    </td>
                  </tr>
                </tbody>
              </table>

              <!-- Mobile layout -->
              <div class="lg:hidden space-y-4">
                <div
                  v-for="row in rows"
                  :key="row.key"
                  class="pb-4 border-b last:border-b-0 border-border p-3 sm:p-6"
                  :class="{
                    'bg-green-500/10': row.isBestPrice,
                    'opacity-50': !row.priceData,
                  }"
                >
                  <!-- mobile: title -->
                  <div
                    class="flex flex-col lg:flex-row items-start lg:items-center lg:justify-between gap-0"
                  >
                    <div class="flex items-center gap-2 flex-wrap">
                      <template v-if="row.retailerSku">
                        <a
                          :href="getRetailerUrl(row.retailer, row.retailerSku)!"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="hover:opacity-80 transition-opacity"
                        >
                          <div class="sr-only">Open on retailer's website</div>
                          <RetailerIcon
                            :retailer="row.retailer"
                            class="w-[24px] h-[24px]"
                          />
                        </a>
                      </template>
                      <template v-else>
                        <RetailerIcon
                          :retailer="row.retailer"
                          class="w-[24px] h-[24px]"
                        />
                      </template>
                      <span
                        class="font-medium text-foreground"
                        :class="{
                          'opacity-50 !font-normal': row.fallback,
                        }"
                      >
                        {{ row.storeName }}
                      </span>

                      <Badge
                        v-if="row.isBestPrice"
                        variant="secondary"
                        class="mb-1 mt-2 bg-green-500/30"
                        >Best&nbsp;Price</Badge
                      >
                    </div>

                    <!-- mobile: fallback badge and best price badge -->
                    <Badge
                      v-if="row.fallback"
                      variant="secondary"
                      class="mb-1 mt-2"
                      >Nearby</Badge
                    >
                  </div>

                  <!-- mobile: price data -->
                  <div class="grid grid-cols-2 gap-4 text-sm mt-3">
                    <div class="space-y-1.5">
                      <div class="text-muted-foreground text-xs">Original</div>
                      <div
                        :class="[
                          row.priceData?.salePrice || row.priceData?.clubPrice
                            ? 'text-muted-foreground/50 opacity-70'
                            : 'text-foreground',
                        ]"
                      >
                        <div
                          v-if="row.priceData?.originalPrice"
                          class="flex items-center"
                        >
                          <Price
                            :price="row.priceData.originalPrice"
                            :erased="
                              row.priceData?.salePrice != null ||
                              row.priceData?.clubPrice != null
                            "
                          />
                          <span
                            v-if="row.priceData.unit"
                            class="text-xs text-muted-foreground ml-1"
                          >
                            / {{ row.priceData.unit }}
                          </span>
                          <Popover>
                            <PopoverTrigger as-child>
                              <sup
                                v-if="row.priceData.isFallbackPrice"
                                class="text-xs text-muted-foreground ml-1 cursor-pointer"
                              >
                                <fa icon="asterisk" />
                              </sup>
                            </PopoverTrigger>
                            <PopoverContent>
                              <p>Approximate price from nearby store.</p>
                            </PopoverContent>
                          </Popover>
                        </div>
                        <span v-else class="text-muted-foreground">-</span>
                      </div>
                    </div>
                    <div class="space-y-1.5">
                      <div class="text-muted-foreground text-xs">Sale</div>
                      <div class="text-foreground flex flex-col gap-2">
                        <!-- mobile: sale price -->
                        <div
                          v-if="row.priceData?.salePrice"
                          class="text-xs ml-1 flex gap-1 items-baseline"
                        >
                          <fa icon="tag" class="text-muted-foreground" />
                          <Price :price="row.priceData.salePrice" />
                        </div>

                        <!-- mobile: club price -->
                        <div
                          v-if="row.priceData?.clubPrice"
                          class="text-xs ml-1 flex gap-1 items-baseline"
                        >
                          <fa icon="id-card" class="text-muted-foreground" />
                          <Price :price="row.priceData.clubPrice" />
                        </div>

                        <!-- mobile: multi-buy price -->
                        <Popover v-if="row.priceData?.multiBuy">
                          <PopoverTrigger as-child>
                            <div class="ml-1 flex gap-1 items-baseline">
                              <span class="font-bold">
                                {{ row.priceData.multiBuy.quantity }}</span
                              ><span class="text-xs">for</span>
                              <Price
                                :price="row.priceData.multiBuy.price"
                                variant="sm"
                              />
                            </div>
                          </PopoverTrigger>
                          <PopoverContent>
                            <div class="flex flex-col gap-2">
                              <div class="gap-1 inline items-baseline">
                                Buy
                                <span class="font-bold">
                                  {{ row.priceData.multiBuy.quantity }}</span
                                >
                                for
                                <Price
                                  :price="row.priceData.multiBuy.price"
                                  variant="sm"
                                />
                              </div>

                              <div class="text-sm gap-1 inline items-baseline">
                                ~
                                <Price
                                  :price="
                                    row.priceData.multiBuy.price /
                                    row.priceData.multiBuy.quantity
                                  "
                                  variant="sm"
                                />
                                / item
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>

                        <span
                          v-if="
                            !row.priceData?.multiBuy &&
                            !row.priceData?.salePrice &&
                            !row.priceData?.clubPrice
                          "
                          class="text-muted-foreground"
                          >-</span
                        >
                      </div>
                    </div>
                  </div>

                  <!-- mobile: actions & track button -->
                  <div class="flex gap-2 mt-3">
                    <Button
                      v-if="row.retailerSku"
                      variant="outline"
                      size="sm"
                      :href="getRetailerUrl(row.retailer, row.retailerSku)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="h-8"
                    >
                      View on site
                      <fa icon="external-link" class="w-3 h-3 ml-1.5" />
                    </Button>
                    <transition name="fade" mode="out-in">
                      <Button
                        v-if="
                          row.fallback &&
                          !cart.stores.has(`${row.retailer}-${row.storeId}`)
                        "
                        variant="outline"
                        size="sm"
                        @click="
                          cart.addStore({
                            retailer: row.retailer,
                            storeId: row.storeId,
                            name: row.storeName,
                          })
                        "
                      >
                        <fa icon="plus" class="mr-1" /> Track Store
                      </Button>
                      <Button
                        v-else
                        variant="outline"
                        size="sm"
                        @click="
                          cart.removeStore({
                            retailer: row.retailer,
                            storeId: row.storeId,
                            name: row.storeName,
                          })
                        "
                      >
                        <fa
                          icon="times"
                          class="text-muted-foreground hover:text-destructive"
                        />
                        Untrack Store
                      </Button>
                    </transition>
                  </div>
                </div>
                <!-- select other stores -->
                <Button
                  variant="outline"
                  size="lg"
                  class="w-full"
                  @click.prevent="ctx.showSelectStoresDialog()"
                >
                  Select Other Stores
                </Button>
              </div>
            </div>
            <div v-else class="bg-card p-6 rounded-lg shadow-sm border">
              <!-- no stores selected prompt to open store selector -->
              <div class="flex flex-col items-center justify-center">
                <div class="flex flex-col items-center justify-center">
                  <fa
                    icon="exclamation-triangle"
                    class="text-primary text-xl mb-1"
                  />
                  <span class="text-muted-foreground">
                    No stores selected
                  </span>
                </div>
                <Button
                  variant="default"
                  size="lg"
                  class="mt-4"
                  @click.prevent="ctx.showSelectStoresDialog()"
                >
                  Select Stores to see Prices
                </Button>
              </div>
            </div>
          </div>
        </ClientOnly>
      </div>
    </transition>
  </div>
</template>
