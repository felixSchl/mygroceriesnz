<script lang="ts" setup>
import type { CategoryTreeNode } from "@repo/db";
import { hash as ohash } from "ohash";
import { groupBy } from "lodash-es";
import { onWatcherCleanup } from "vue";
import { debouncer } from "~/lib/utils";

const trpc = useTrpc();
const cart = useCart();

const route = useRoute();
const router = useRouter();
const queryCtx = inject("query") as { queryInput: Ref<string> };

const queryInput = computed(() => queryCtx.queryInput.value);

const PAGE_SIZE = 20; // see backend; fixed

// Update debounced query & route on input change
const lastQueryInput = ref<string | null>(null);
watch(
  [queryInput],
  debouncer(() => {
    let page = currentPage.value;
    let scrollToTop = false;
    const input = queryInput.value.trim();

    if (lastQueryInput.value != null && lastQueryInput.value !== input) {
      page = 1; // reset to first page
      scrollToTop = true;
    }
    lastQueryInput.value = input;
    router.push({
      query: {
        q: input,
        cat: currentCategory.value,
        page: page.toString(),
      },
    });
    if (scrollToTop) {
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 100);
    }
  }, 300),
  { immediate: true },
);

async function gotoPage(page: number, scrollToTop: boolean = false) {
  await router.push({
    query: {
      ...router.currentRoute.value.query,
      page: page.toString(),
    },
  });
  if (scrollToTop) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

// Add currentPage ref and initialize from URL
const currentPage = computed(() => {
  const page = parseInt((route.query.page as string) || "1");
  return isNaN(page) ? 1 : page;
});

const currentQuery = computed(() => {
  if (typeof route.query.q !== "string") return "";
  return route.query.q;
});

// Add currentCategory ref and initialize from URL
const currentCategory = computed(() => {
  if (typeof route.query.cat !== "string") return undefined;
  return route.query.cat;
});

// Update URL when page changes
watch(currentPage, (page) => {
  console.log("[W111] currentPage", page);
  router.push({
    query: {
      ...router.currentRoute.value.query,
      page: page.toString(),
    },
  });
});

// compile search key for this search query
const searchKey = computed(() => {
  const stores = Array.from(cart.stores.keys()).sort();
  return ohash([
    stores,
    currentPage.value,
    currentCategory.value,
    currentQuery.value?.trim() ?? "",
    // TODO should we round this?
    cart.location?.lat,
    cart.location?.lng,
  ]);
});

const { data, status, refresh } = useAsyncData(
  "search",
  async () => {
    const key = searchKey.value;

    // check cache first; avoid hitting the server if we can
    const cached = cart.searchCache.get(key);
    if (cached && cached.timestamp > Date.now() - 1000 * 60 * 5) {
      cart.lastCompletedSearchKey = key;
      return cached.data;
    }

    // otherwise, hit the server
    const data = await trpc.search.query({
      q: currentQuery.value?.trim() ?? "",
      page: parseInt(currentPage.value.toString()) ?? 1,
      stores: Array.from(cart.stores.keys()),
      category: currentCategory.value
        ? currentCategory.value === ""
          ? undefined
          : currentCategory.value
        : undefined,
      location: cart.location
        ? {
            lat: cart.location.lat,
            lng: cart.location.lng,
          }
        : undefined,
    });

    // cache the result
    cart.searchCache.set(key, {
      timestamp: Date.now(),
      data,
    });

    cart.lastCompletedSearchKey = key;
    return data;
  },
  {
    server: false,
    lazy: true,
    watch: [searchKey],
  },
);

watch(
  () => data.value,
  (data) => {
    let cancelled = false;

    const productIds = (data?.hits ?? [])
      .filter((x) => {
        const price = cart.getPrices(x.id, /* stale: */ false);
        return price == null;
      })
      .map((x) => x.id);

    // load prices
    cart.setPriceStatus(productIds, "loading");
    trpc.getPrices
      .query({
        productIds,
        stores: Array.from(cart.stores.keys()),
        location: cart.location
          ? {
              lat: cart.location.lat,
              lng: cart.location.lng,
            }
          : undefined,
      })
      .then(
        (data) => {
          if (cancelled) return;
          const grouped = groupBy(data, "productId");
          for (const [productId, prices] of Object.entries(grouped)) {
            cart.setPrices(productId, prices);
          }
          cart.setPriceStatus(productIds, "loaded");
        },
        () => {
          if (cancelled) return;
          cart.setPriceStatus(productIds, "error");
        },
      );

    onWatcherCleanup(() => {
      cancelled = true;
    });
  },
);

const totalPages = computed(() => {
  return Math.min(Math.ceil((data.value?.total ?? 0) / PAGE_SIZE), 50);
});

const ctx = useAppContext();

watch(
  status,
  (newStatus) => {
    ctx.setSearching(newStatus === "pending");
  },
  {
    immediate: true,
  },
);

onUnmounted(() => {
  ctx.setSearching(false);
});

const activeCategoryName = computed(() => {
  if (!ctx.activeCategory.value) return "";
  const findName = (node: CategoryTreeNode): string => {
    if (node.id === ctx.activeCategory.value) return node.name;
    for (const child of node.children ?? []) {
      const name = findName(child);
      if (name) return name;
    }
    return "";
  };
  for (const node of ctx.categories) {
    const name = findName(node);
    if (name) return name;
  }
  return "";
});

const nav = computed(() => {
  if (!ctx.activeCategory.value) {
    return {
      breadcrumbs: [],
      subCategories: [],
    };
  }

  // find node with matching id; we have to search the entire tree
  // unfortunately.
  // NOTE we have a fixed depth of 3 levels here, no need to be fancy.
  // TODO(PERF) use a smarter data structure
  // check level 0
  const out = (() => {
    for (const node of ctx.categories) {
      if (node.id === ctx.activeCategory.value) {
        return {
          breadcrumbs: [node],
          subCategories: node.children ?? [],
        };
      }
      // check level 1
      for (const child of node.children ?? []) {
        if (child.id === ctx.activeCategory.value) {
          return {
            breadcrumbs: [node, child],
            subCategories: child.children ?? [],
          };
        }
        // check level 2
        for (const grandChild of child.children ?? []) {
          if (grandChild.id === ctx.activeCategory.value) {
            return {
              breadcrumbs: [node, child, grandChild],
              subCategories: grandChild.children ?? [],
            };
          }
        }
      }
    }
    return {
      breadcrumbs: [],
      subCategories: [],
    };
  })();

  // add root node
  out.breadcrumbs.unshift({
    id: "",
    name: "All Products",
    children: [],
  });

  return out;
});

// Add SEO-related computed properties
const metaTitle = computed(() => {
  const parts = [];
  if (queryInput.value) parts.push(queryInput.value);
  if (nav.value.breadcrumbs.length) {
    parts.push(nav.value.breadcrumbs.map((c) => c.name).join(" > "));
  }
  return parts.length
    ? `${parts.join(" - ")} | MyGroceries`
    : "Product Search | MyGroceries";
});

const metaDescription = computed(() => {
  const parts = [];
  if (queryInput.value) parts.push(`Search results for "${queryInput.value}"`);
  if (nav.value.breadcrumbs.length) {
    parts.push(`in ${nav.value.breadcrumbs.map((c) => c.name).join(" > ")}`);
  }
  if (data.value?.total) {
    parts.push(`(${data.value.total} products found)`);
  }
  return parts.length
    ? `${parts.join(" ")}. Compare prices across multiple stores.`
    : "Search and compare product prices across multiple stores. Find the best deals on your favorite items.";
});

// Add useHead for meta tags
useHead({
  title: metaTitle,
  meta: [
    { name: "description", content: metaDescription },
    // Open Graph tags
    { property: "og:title", content: metaTitle },
    { property: "og:description", content: metaDescription },
    { property: "og:type", content: "website" },
    // Twitter Card tags
    { name: "twitter:title", content: metaTitle },
    { name: "twitter:description", content: metaDescription },
    { name: "twitter:card", content: "summary" },
  ],
  link: [
    {
      rel: "canonical",
      href: computed(() => {
        const baseUrl = "https://www.mygroceries.nz";
        const path = "/search";
        const query = new URLSearchParams();
        if (queryInput.value) query.set("q", queryInput.value?.trim() || "");
        if (currentCategory.value) query.set("cat", currentCategory.value);
        if (currentPage.value > 1)
          query.set("page", currentPage.value.toString());
        const queryString = query.toString();
        return `${baseUrl}${path}${queryString ? "?" + queryString : ""}`;
      }),
    },
  ],
});

onMounted(async () => {
  const location = await resolveLocationAsync();
  if (location) {
    console.log("location", location);
  }
});
</script>

<template>
  <div class="flex">
    <main class="w-full">
      <!-- Add heading for better document outline -->
      <h1 class="sr-only">{{ metaTitle }}</h1>

      <!-- initial store selection -->
      <ClientOnly>
        <template #fallback>
          <!-- CSR loading spinner -->
          <div class="mt-12 mx-auto p-8 lg:w-[800px]">
            <div class="flex flex-col items-center">
              <div class="flex text-center flex-col gap-2 mb-4">
                <fa
                  icon="spinner"
                  class="animate-spin text-muted-foreground text-4xl mb-1"
                />
              </div>
            </div>
          </div>
        </template>

        <div
          v-if="cart.location == null && cart.stores.size === 0"
          class="mt-8 mx-auto p-8 backdrop-blur-sm bg-background/40 border lg:w-[800px]"
        >
          <div class="flex flex-col items-center">
            <div class="flex text-center flex-col gap-2 mb-4">
              <fa
                icon="exclamation-triangle"
                class="text-primary text-4xl mb-1"
              />
              <p class="text-2xl font-bold">No stores selected yet</p>
              <p class="text-sm text-muted-foreground">
                Select stores to see prices
              </p>
            </div>
            <Button
              variant="outline"
              size="lg"
              @click.prevent="ctx.showSelectStoresDialog()"
              >Select Stores
              <fa icon="chevron-right" />
            </Button>
          </div>
        </div>

        <!-- search results -->
        <div class="flex flex-col mt-4 pb-16 mx-auto min-h-[85vh] w-full">
          <!-- show breadcrumbs -->
          <Breadcrumb v-if="nav.breadcrumbs.length" class="mb-4">
            <BreadcrumbList>
              <template
                v-for="crumb in nav.breadcrumbs.slice(0, -1)"
                :key="crumb.id"
              >
                <BreadcrumbItem>
                  <nuxt-link
                    as-child
                    :to="`/search?cat=${crumb.id}&q=${queryInput || ''}`"
                  >
                    <BreadcrumbLink>
                      {{ crumb.name }}
                    </BreadcrumbLink>
                  </nuxt-link>
                </BreadcrumbItem>
                <BreadcrumbSeparator v-if="crumb !== nav.breadcrumbs.at(-1)" />
              </template>
            </BreadcrumbList>
          </Breadcrumb>

          <!-- show category name -->
          <p v-if="nav.breadcrumbs.length" class="text-3xl font-semibold mb-4">
            {{ nav.breadcrumbs.at(-1)?.name }}
          </p>

          <!-- show subcategories (if there's currently a category selected) -->
          <template v-if="nav.subCategories.length">
            <div class="flex flex-wrap gap-2 mb-6">
              <Button
                v-for="category in nav.subCategories"
                :key="category.id"
                variant="outline"
                size="sm"
                :class="{
                  'bg-primary text-primary-foreground':
                    category.id === currentCategory,
                }"
                @click="
                  router.push({
                    query: {
                      cat: category.id,
                      page: '1', // Reset to first page
                    },
                  })
                "
              >
                {{ category.name }}
              </Button>
            </div>
          </template>

          <Transition name="fade" mode="out-in">
            <div
              v-if="
                status === 'pending' &&
                searchKey !== cart.lastCompletedSearchKey
              "
              key="loading"
              class="text-muted-foreground grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full mx-auto"
            >
              <div
                v-for="i in 5"
                :key="i"
                class="w-full min-w-[200px] border rounded-lg p-4 bg-background justify-self-center"
              >
                <!-- Image skeleton -->
                <div
                  class="w-full h-[200px] bg-muted animate-pulse rounded-md mb-4"
                ></div>

                <!-- Title skeleton -->
                <div
                  class="h-[40px] bg-muted animate-pulse rounded-md mb-6"
                ></div>

                <!-- Price rows skeleton -->
                <div class="space-y-4">
                  <div v-for="j in 2" :key="j" class="flex items-center gap-4">
                    <div
                      class="w-[24px] h-[24px] bg-muted animate-pulse rounded-full"
                    ></div>
                    <div
                      class="flex-1 h-6 bg-muted animate-pulse rounded-md"
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            <div
              v-else-if="status === 'error'"
              key="error"
              class="text-muted-foreground mb-8 mt-8 w-full"
            >
              <div
                class="flex flex-col items-center text-center max-w-md mx-auto"
              >
                <div class="rounded-full bg-red-100 p-3 mb-4">
                  <fa
                    icon="exclamation-triangle"
                    class="text-red-600 text-xl"
                  />
                </div>
                <h3 class="text-xl font-semibold text-foreground mb-2">
                  Oops! Something went wrong
                </h3>
                <p class="text-sm text-muted-foreground mb-4">
                  We couldn't complete your search at this time. Please try
                  again.
                </p>
                <Button variant="outline" size="lg" @click="refresh">
                  <fa icon="rotate-right" class="mr-2" />
                  Try Again
                </Button>
              </div>
            </div>

            <div
              v-else-if="status === 'success' && data?.hits.length === 0"
              key="empty"
            >
              <div
                class="flex flex-col items-center text-center max-w-md mx-auto mt-8"
              >
                <div class="rounded-full bg-muted p-3 mb-4">
                  <fa icon="search" class="text-muted-foreground text-xl" />
                </div>
                <h3 class="text-3xl font-semibold text-foreground mb-2">
                  No products found
                  <template v-if="activeCategoryName">
                    in "{{ activeCategoryName }}"
                  </template>
                </h3>

                <p
                  v-if="activeCategoryName"
                  class="text-sm text-muted-foreground mb-4"
                >
                  We couldn't find any products in this category matching your
                  search criteria. Try adjusting your search terms or filters.

                  <button
                    class="text-primary underline"
                    @click="
                      router.push({
                        query: {
                          ...router.currentRoute.value.query,
                          cat: '',
                          page: '1', // Reset to first page
                        },
                      })
                    "
                  >
                    Search all products
                  </button>
                </p>
                <p v-else class="text-sm text-muted-foreground mb-4">
                  We couldn't find any products matching your search criteria.
                  Try adjusting your search terms or filters.
                </p>

                <div class="flex gap-3">
                  <Button variant="outline" @click="router.push('/search')">
                    <fa icon="arrow-left" class="mr-2" />
                    Clear Search
                  </Button>
                  <Button
                    variant="outline"
                    @click="ctx.showSelectStoresDialog()"
                  >
                    <fa icon="store" class="mr-2" />
                    Change Stores
                  </Button>
                </div>
              </div>
            </div>

            <div v-else key="results">
              <div
                class="flex flex-col gap-y-3 md:flex-row justify-between items-center mb-4"
              >
                <div class="flex gap-4 relative">
                  <div class="text-sm text-muted-foreground pr-12">
                    Showing {{ data?.hits.length }} results
                  </div>

                  <!-- TODO currently this would show 2 spinners; tidy this up. -->
                  <div
                    v-if="false"
                    class="flex flex-col items-end flex-1 mr-4 opacity-50 absolute top-0 right-0"
                  >
                    <Transition name="fade" mode="out-in">
                      <!-- loading spinner -->
                      <fa
                        v-if="status === 'pending'"
                        icon="spinner"
                        class="animate-spin"
                      />
                    </Transition>
                  </div>
                </div>

                <!-- TODO why on earth do we have to multiply x10 here? -->
                <Pagination
                  v-slot="{ page }"
                  :sibling-count="0"
                  :page="currentPage"
                  show-edges
                  :total="totalPages * 10"
                >
                  <PaginationList
                    v-slot="{ items }"
                    class="flex items-center gap-1"
                  >
                    <PaginationFirst @click="gotoPage(1, true)" />
                    <PaginationPrev @click="gotoPage(page - 1, true)" />

                    <template v-for="(item, index) in items">
                      <PaginationListItem
                        v-if="item.type === 'page'"
                        :key="index"
                        :value="item.value"
                        as-child
                      >
                        <Button
                          class="w-9 h-9 p-0"
                          :variant="item.value === page ? 'default' : 'outline'"
                          @click="gotoPage(item.value)"
                        >
                          {{ item.value }}
                        </Button>
                      </PaginationListItem>
                      <PaginationEllipsis
                        v-else
                        :key="item.type"
                        :index="index"
                      />
                    </template>

                    <PaginationNext @click="gotoPage(page + 1, true)" />
                  </PaginationList>
                </Pagination>
              </div>

              <div
                class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 min-h-[50vh]"
              >
                <div
                  v-for="item in data?.hits"
                  :key="item.id"
                  class="w-full mx-auto"
                >
                  <ProductCard :item="item" />
                </div>
              </div>

              <div
                class="flex flex-col gap-y-3 md:flex-row justify-end items-center mt-8"
              >
                <!-- TODO why on earth do we have to multiply x10 here? -->
                <Pagination
                  v-slot="{ page }"
                  :sibling-count="0"
                  :page="currentPage"
                  show-edges
                  :total="totalPages * 10"
                >
                  <PaginationList
                    v-slot="{ items }"
                    class="flex items-center gap-1"
                  >
                    <PaginationFirst @click="gotoPage(1, true)" />
                    <PaginationPrev @click="gotoPage(page - 1, true)" />

                    <template v-for="(item, index) in items">
                      <PaginationListItem
                        v-if="item.type === 'page'"
                        :key="index"
                        :value="item.value"
                        as-child
                      >
                        <Button
                          class="w-9 h-9 p-0"
                          :variant="item.value === page ? 'default' : 'outline'"
                          @click="gotoPage(item.value, true)"
                        >
                          {{ item.value }}
                        </Button>
                      </PaginationListItem>
                      <PaginationEllipsis
                        v-else
                        :key="item.type"
                        :index="index"
                      />
                    </template>

                    <PaginationNext @click="gotoPage(page + 1, true)" />
                  </PaginationList>
                </Pagination>
              </div>
            </div>
          </Transition>
        </div>
      </ClientOnly>
    </main>
  </div>
</template>
