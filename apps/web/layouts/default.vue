<script lang="ts" setup>
import { CategoryTreeQuery } from "@repo/db/categories";
import { AppInjectionKey } from "~/context/app";
import { useCart } from "~/stores/cart";

const trpc = useTrpc();

defineProps<{
  fullWidth?: boolean;
}>();

// modals
const showSignupModal = ref(false);
const showStoreSelectorModal = ref(false);
const showLaunchDialog = ref(false);
const showBarcodeScanner = ref(false);
const barcodeScannerEnabled = ref(true); // feature flag

function _queryInputFromRoute() {
  if (typeof route.query.q === "string") {
    return route.query.q;
  }
  return "";
}

// query context
const route = useRoute();
const router = useRouter();
const queryInput = ref(_queryInputFromRoute());
const cart = useCart();
const isSearching = ref(false);

provide("query", { queryInput });

const routeQ = computed(() => _queryInputFromRoute());
watch(
  routeQ,
  (q) => {
    queryInput.value = q;
  },
  { immediate: true },
);

// TODO cache this; this is quite a lot of data.
const { data: categories } = await trpc.getCategories.useQuery(undefined, {
  server: true,
});

// app context
const ctx = {
  setSearching(value: boolean) {
    isSearching.value = value;
  },
  showSelectStoresDialog() {
    showStoreSelectorModal.value = true;
  },
  categories: categories.value ?? [],
  activeCategory: computed(() => route.query.cat as string | undefined),
  catQuery: new CategoryTreeQuery(categories.value ?? []),
};

provide(AppInjectionKey, ctx);

// Add reactive window width tracking
const windowWidth = ref(
  typeof window === "undefined" ? 1024 : (window?.innerWidth ?? 1024),
);

function onResize() {
  windowWidth.value = window.innerWidth;
}

function onWindowWidthChange() {
  if (windowWidth.value < 640) {
    visibleCategoryCount.value = 2;
  } else if (windowWidth.value < 1024) {
    visibleCategoryCount.value = 3;
  } else {
    visibleCategoryCount.value = 4;
  }
}

watch([router.currentRoute], () => {
  if (typeof window === "undefined") return;
  windowWidth.value = window?.innerWidth;
  onWindowWidthChange();
});

onMounted(() => {
  windowWidth.value = window.innerWidth;
  onWindowWidthChange();
  window.addEventListener("resize", onResize);

  // disable intro for now
  // showIntroStoreDelayed();
});

onUnmounted(() => {
  window.removeEventListener("resize", onResize);
});

// Update computed to use reactive width
const visibleCategoryCount = ref(3);
watch(windowWidth, () => {
  onWindowWidthChange();
});

// ...
function submitSearch() {
  router.push({
    path: "/search",
    query: {
      ...route.query,
      q: queryInput.value?.trim() ?? "",
    },
  });
}

const searchInputRef = ref<HTMLInputElement | null>(null);

// Add to script setup section
const mobileMenuOpen = ref(false);
const showCartDrawer = ref(false);
const showIntroStore = ref(false);

const colorMode = useColorMode();

// Add this new code
watch(showCartDrawer, (isOpen) => {
  if (isOpen) {
    // Add a new history entry when drawer opens
    router.push({
      query: { ...route.query, cart: "open" },
    });
  } else {
    // Remove cart query param when drawer closes
    const query = { ...route.query };
    delete query.cart;
    router.push({ query });
  }
});

// Watch for route changes to handle back button
watch(
  () => route.query.cart,
  (cartParam) => {
    // Only update if the drawer state doesn't match the URL
    if (cartParam === "open" && !showCartDrawer.value) {
      showCartDrawer.value = true;
    } else if (!cartParam && showCartDrawer.value) {
      showCartDrawer.value = false;
    }
  },
);
</script>

<template>
  <div class="flex flex-col min-h-[100vh]">
    <header
      class="py-4 pb-2 flex flex-col border-b w-full sticky top-0 bg-background z-10 shadow-md"
    >
      <div class="flex flex-col max-w-7xl mx-auto w-full gap-1 px-4">
        <!-- Mobile/Tablet header layout -->
        <div class="flex flex-col md:flex-row items-center gap-4">
          <!-- Logo section -->
          <div class="flex items-center w-full md:w-auto">
            <nuxt-link to="/" class="text-2xl font-bold flex items-end">
              <!--<img
                src="/Logo.png"
                alt="MyGroceries"
                class="h-8 mr-2 mb-[2px]"
              />-->
              <span>my</span
              ><span
                class="text-green-500 dark:text-foreground dark:font-semibold"
              >
                groceries</span
              >
            </nuxt-link>

            <div class="flex items-center gap-2 ml-4 md:mr-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Button variant="ghost" size="icon" as-child>
                      <a
                        href="https://reddit.com/r/mygroceriesnz"
                        target="_blank"
                      >
                        <fa :icon="['fab', 'reddit']" />
                        <span class="sr-only">Reddit</span>
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Join our Reddit Community</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Button variant="ghost" size="icon" as-child>
                      <a href="https://discord.gg/SkdC3GCfdx" target="_blank">
                        <fa :icon="['fab', 'discord']" />
                        <span class="sr-only">Discord</span>
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Join our Discord Community</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div class="flex-1"></div>

            <!-- Mobile menu button -->
            <Button
              variant="ghost"
              size="icon"
              class="md:hidden"
              @click="mobileMenuOpen = !mobileMenuOpen"
            >
              <fa v-if="!mobileMenuOpen" icon="bars" />
              <fa v-else icon="times" />
            </Button>
          </div>

          <!-- Search input - full width on mobile/tablet -->
          <form
            class="hidden lg:flex w-full md:w-[400px] xl:w-[500px]"
            @submit.prevent="submitSearch"
          >
            <div class="relative w-full">
              <fa
                :icon="isSearching ? 'spinner' : 'search'"
                :class="[
                  'absolute top-3 left-3',
                  { 'animate-spin': isSearching },
                ]"
              />
              <Input
                v-model="queryInput"
                placeholder="Search"
                class="w-full bg-muted pl-10"
              />
            </div>
          </form>

          <DropdownMenu :modal="false">
            <DropdownMenuTrigger as-child class="hidden md:flex">
              <Button variant="outline">
                <fa
                  icon="moon"
                  class="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
                />
                <fa
                  icon="sun"
                  class="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
                />
                <span class="sr-only">Toggle theme</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem @click="colorMode.preference = 'light'">
                Light
              </DropdownMenuItem>
              <DropdownMenuItem @click="colorMode.preference = 'dark'">
                Dark
              </DropdownMenuItem>
              <DropdownMenuItem @click="colorMode.preference = 'system'">
                System
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <!-- Desktop buttons -->
          <div class="hidden md:flex gap-2 items-center ml-auto">
            <Button
              size="lg"
              class="px-4"
              variant="outline"
              @click="showLaunchDialog = true"
            >
              Sign in
            </Button>

            <Button
              size="lg"
              class="px-4 hidden lg:flex"
              variant="outline"
              @click.prevent="showStoreSelectorModal = true"
            >
              <span>
                Select Stores
                <ClientOnly>
                  <Badge variant="outline" size="sm">{{
                    cart.stores.size
                  }}</Badge>
                </ClientOnly>
              </span>
              <fa icon="chevron-down" class="-mr-2.5" />
            </Button>

            <Button
              size="lg"
              class="px-4 hidden lg:flex"
              @click="showCartDrawer = true"
            >
              <fa icon="cart-shopping" />
              <ClientOnly>
                <Badge
                  variant="secondary"
                  class="border-2 border-solid border-primary animate-[bounce]"
                >
                  {{ cart.totalItemCount }}
                </Badge>
              </ClientOnly>
            </Button>
          </div>

          <!-- Mobile/Tablet buttons - shown when menu is open -->
          <div
            v-if="mobileMenuOpen"
            class="md:hidden flex flex-col w-full gap-2 mt-4 mb-1"
          >
            <Button
              size="lg"
              class="w-full"
              variant="outline"
              @click="
                showLaunchDialog = true;
                mobileMenuOpen = false;
              "
            >
              Sign in
            </Button>

            <DropdownMenu :modal="false">
              <DropdownMenuTrigger as-child>
                <Button variant="outline">
                  <span>Switch Theme</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @click="colorMode.preference = 'light'">
                  Light
                </DropdownMenuItem>
                <DropdownMenuItem @click="colorMode.preference = 'dark'">
                  Dark
                </DropdownMenuItem>
                <DropdownMenuItem @click="colorMode.preference = 'system'">
                  System
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="lg"
              class="w-full"
              variant="outline"
              @click.prevent="
                mobileMenuOpen = false;
                ctx.showSelectStoresDialog();
              "
            >
              <span>
                Select Stores
                <ClientOnly>
                  <Badge variant="outline" size="sm">{{
                    cart.stores.size
                  }}</Badge>
                </ClientOnly>
              </span>
            </Button>

            <Button
              size="lg"
              class="w-full"
              @click="
                showCartDrawer = true;
                mobileMenuOpen = false;
              "
            >
              <fa icon="cart-shopping" />
              <ClientOnly>
                <Badge
                  variant="secondary"
                  class="border-2 border-solid border-primary animate-[bounce] ml-2"
                >
                  {{ cart.totalItemCount }}
                </Badge>
              </ClientOnly>
            </Button>
          </div>
        </div>

        <!-- Search input - full width on mobile/tablet -->
        <div
          class="gap-2 items-center flex"
          :class="{ hidden: mobileMenuOpen }"
        >
          <form
            class="lg:hidden w-full md:w-[400px] xl:w-[500px]"
            @submit.prevent="submitSearch"
          >
            <div class="relative w-full">
              <fa
                :icon="isSearching ? 'spinner' : 'search'"
                :class="[
                  'absolute top-3 left-3',
                  { 'animate-spin': isSearching },
                ]"
              />
              <Input
                v-model="queryInput"
                ref="searchInputRef"
                placeholder="Search"
                class="w-full bg-muted pl-10"
              />
            </div>
          </form>

          <!-- Desktop buttons -->
          <div class="hidden md:flex lg:hidden gap-2 items-center ml-auto">
            <Button
              size="lg"
              class="px-4"
              variant="outline"
              @click.prevent="ctx.showSelectStoresDialog()"
            >
              <span>
                Select Stores
                <ClientOnly>
                  <Badge variant="outline" size="sm">{{
                    cart.stores.size
                  }}</Badge>
                </ClientOnly>
              </span>
              <fa icon="chevron-down" class="-mr-2.5" />
            </Button>

            <Button
              size="lg"
              class="px-4 border"
              @click="showCartDrawer = true"
            >
              <fa icon="cart-shopping" />
              <ClientOnly>
                <Badge
                  variant="secondary"
                  class="border-2 border-solid border-primary animate-[bounce]"
                >
                  {{ cart.totalItemCount }}
                </Badge>
              </ClientOnly>
            </Button>
          </div>
        </div>

        <ScrollArea
          v-if="mobileMenuOpen"
          class="flex flex-col gap-2 sm:hidden mt-4 h-72"
        >
          <!--  -->
          <ul class="space-y-1">
            <li v-for="category in categories" :key="category.id">
              <Button as-child class="w-full !justify-start" variant="outline">
                <nuxt-link
                  :to="`/search?cat=${category.id}`"
                  @click="mobileMenuOpen = false"
                >
                  {{ category.name }}
                </nuxt-link>
              </Button>
            </li>
          </ul>
        </ScrollArea>

        <!-- Categories menu - hide on mobile/tablet -->
        <div
          class="hidden sm:flex gap-4 relative min-h-[40px] justify-between mt-2"
        >
          <ClientOnly>
            <NavigationMenu v-if="categories">
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuLink as-child>
                    <nuxt-link to="/search?cat=" class="font-bold" as-child>
                      <a
                        class="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <div class="text-sm font-medium leading-none">
                          Browse All
                        </div>
                      </a>
                    </nuxt-link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
                <!-- Update the slice to use computed property -->
                <NavigationMenuItem
                  v-for="category in categories.slice(0, visibleCategoryCount)"
                  :key="category.id"
                >
                  <NavigationMenuTrigger>
                    {{ category.name }}
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul
                      class="grid w-[400px] gap-3 p-4 md:w-[700px] md:grid-cols-2 lg:w-[700px]"
                    >
                      <li>
                        <NavigationMenuLink as-child>
                          <nuxt-link
                            :to="`/search?cat=${category.id}`"
                            as-child
                          >
                            <a
                              class="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                            >
                              <div class="text-sm leading-none font-bold">
                                Browse All
                              </div>
                            </a>
                          </nuxt-link>
                        </NavigationMenuLink>
                      </li>
                      <li
                        v-for="subcategory in category.children"
                        :key="subcategory.id"
                      >
                        <NavigationMenuLink as-child>
                          <nuxt-link
                            :to="`/search?cat=${subcategory.id}`"
                            as-child
                          >
                            <a
                              class="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                            >
                              <div class="text-sm font-medium leading-none">
                                {{ subcategory.name }}
                              </div>
                              <!-- <p
                              v-if="subcategory.description"
                              class="line-clamp-2 text-sm leading-snug text-muted-foreground"
                            >
                              {{ subcategory.description }}
                            </p> -->
                            </a>
                          </nuxt-link>
                        </NavigationMenuLink>
                      </li>
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                <!-- Update the condition for More dropdown -->
                <NavigationMenuItem
                  v-if="categories.length > visibleCategoryCount"
                >
                  <NavigationMenuTrigger> More </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul
                      class="grid w-[400px] gap-3 p-4 md:w-[700px] md:grid-cols-2 lg:w-[700px]"
                    >
                      <li
                        v-for="category in categories.slice(
                          visibleCategoryCount,
                        )"
                        :key="category.id"
                      >
                        <NavigationMenuLink as-child>
                          <nuxt-link
                            :to="`/search?cat=${category.id}`"
                            as-child
                          >
                            <a
                              class="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                            >
                              <div class="text-sm font-medium leading-none">
                                {{ category.name }}
                              </div>
                            </a>
                          </nuxt-link>
                        </NavigationMenuLink>
                      </li>
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </ClientOnly>
          <Button
            v-if="barcodeScannerEnabled"
            size="lg"
            class="px-4 sm:hidden"
            variant="outline"
            @click="showBarcodeScanner = true"
          >
            <fa icon="qrcode" />
            <span>Scan Barcode</span>
          </Button>
        </div>
      </div>
    </header>

    <div class="w-full flex-1 flex flex-col">
      <div class="relative h-full flex-1">
        <!-- Gradient backgrounds -->
        <div class="absolute inset-0 overflow-hidden">
          <div
            class="absolute w-[50vw] h-[50vw] -top-[15%] -right-[10%] rounded-full bg-gradient-to-br from-green-500/10 to-green-500/[0.02]"
          ></div>
          <div
            class="absolute w-[30vw] h-[30vw] -bottom-[5%] -left-[5%] rounded-full bg-gradient-to-br from-green-500/10 to-green-500/[0.02]"
          ></div>
        </div>

        <div class="mx-auto w-full h-full relative"></div>

        <!-- Main content container -->
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions, vuejs-accessibility/click-events-have-key-events -->
        <div
          class="mx-auto w-full h-full relative"
          :class="{
            'max-w-7xl px-4': !fullWidth,
          }"
          @click="mobileMenuOpen = false"
        >
          <slot />
        </div>
      </div>
    </div>

    <!-- Footer section -->
    <footer class="border-t bg-muted/50 py-12">
      <div class="mx-auto w-full max-w-7xl px-4 grid gap-8 md:grid-cols-3">
        <!-- Company Info -->
        <div class="space-y-4 flex flex-col">
          <div class="flex items-end">
            <span class="font-bold dark:text-foreground">my</span
            ><span class="text-green-500 dark:text-foreground font-bold">
              groceries</span
            >
          </div>
          <p class="text-sm text-muted-foreground">
            Compare prices across New Zealand's leading supermarkets and find
            the best deals.
          </p>
          <div class="flex gap-4 flex-col">
            <Button variant="outline" as-child>
              <a
                href="https://discord.gg/SkdC3GCfdx"
                target="_blank"
                aria-label="Join us on Discord"
              >
                <fa :icon="['fab', 'discord']" />
                Join us on Discord
              </a>
            </Button>
          </div>
        </div>

        <!-- Quick Links -->
        <div v-if="false" class="space-y-4">
          <h3 class="font-semibold">Quick Links</h3>
          <ul class="space-y-2">
            <li>
              <nuxt-link
                to="/about"
                class="text-sm text-muted-foreground hover:text-foreground"
              >
                About Us
              </nuxt-link>
            </li>
            <li>
              <nuxt-link
                to="/how-it-works"
                class="text-sm text-muted-foreground hover:text-foreground"
              >
                How It Works
              </nuxt-link>
            </li>
            <li>
              <nuxt-link
                to="/supported-stores"
                class="text-sm text-muted-foreground hover:text-foreground"
              >
                Supported Stores
              </nuxt-link>
            </li>
            <li>
              <nuxt-link
                to="/blog"
                class="text-sm text-muted-foreground hover:text-foreground"
              >
                Blog
              </nuxt-link>
            </li>
          </ul>
        </div>

        <!-- Legal -->
        <div v-if="false" class="space-y-4">
          <h3 class="font-semibold">Legal</h3>
          <ul class="space-y-2">
            <li>
              <nuxt-link
                to="/privacy"
                class="text-sm text-muted-foreground hover:text-foreground"
              >
                Privacy Policy
              </nuxt-link>
            </li>
            <li>
              <nuxt-link
                to="/terms"
                class="text-sm text-muted-foreground hover:text-foreground"
              >
                Terms of Service
              </nuxt-link>
            </li>
            <li>
              <nuxt-link
                to="/disclaimer"
                class="text-sm text-muted-foreground hover:text-foreground"
              >
                Disclaimer
              </nuxt-link>
            </li>
          </ul>
        </div>

        <div />

        <!-- Newsletter -->
        <div v-if="false" class="space-y-4">
          <h3 class="font-semibold">Stay Updated</h3>
          <p class="text-sm text-muted-foreground">
            Subscribe to our newsletter for the latest deals and updates.
          </p>
          <form
            class="flex gap-2"
            @submit.prevent="
              {
                /* TODO: Add newsletter signup */
              }
            "
          >
            <Input type="email" placeholder="Enter your email" />
            <Button type="submit">Subscribe</Button>
          </form>
        </div>

        <!-- Bottom bar -->
        <div class="col-span-full border-t pt-8 mt-8">
          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <p class="text-sm text-muted-foreground">
              Developed by
              <a
                href="https://felixschlitter.dev"
                target="_blank"
                class="font-medium text-foreground hover:underline"
              >
                Felix Schlitter
              </a>
            </p>
            <p
              class="text-sm text-muted-foreground sm:border-l sm:ml-2 sm:pl-4"
            >
              © {{ new Date().getFullYear() }} MyGroceries.
            </p>
          </div>
        </div>
      </div>
    </footer>

    <ClientOnly>
      <AlertDialog
        :open="showIntroStore"
        @update:open="showIntroStore = $event"
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle class="text-3xl"
              >Welcome to
              <span class="text-green-500 font-bold">mygroceries</span
              >!</AlertDialogTitle
            >
            <AlertDialogDescription class="my-4 flex flex-col gap-2">
              <p>
                Cost of living is higher than ever in New Zealand, so we've
                built a website to help Kiwis save on their weekly groceries by
                comparing prices across New Zealand's leading supermarkets.
              </p>
              <p
                class="bg-card border border-border p-4 rounded-lg shadow mt-4"
              >
                <strong class="text-green-500">Attention</strong> A mobile app
                is coming soon! We are looking for beta testers. If you're
                interested, please join our Discord community and let us know.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter class="flex flex-col gap-2">
            <Button variant="outline" as-child>
              <a
                href="https://discord.gg/SkdC3GCfdx"
                target="_blank"
                class="flex items-center gap-2"
              >
                <fa :icon="['fab', 'discord']" />
                Join us on Discord
              </a>
            </Button>

            <Button
              variant="default"
              class="bg-green-200 hover:bg-green-400 text-black"
              @click="
                showIntroStore = false;
                showStoreSelectorModal = true;
              "
              >Start Saving
              <fa icon="arrow-right" />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ClientOnly>
    <ClientOnly>
      <StoreSelector
        :open="showStoreSelectorModal"
        @close="showStoreSelectorModal = false"
      />
    </ClientOnly>

    <ClientOnly>
      <AlertDialog
        :open="showSignupModal"
        @update:open="showSignupModal = $event"
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle class="text-3xl"
              >Sign in required</AlertDialogTitle
            >
            <AlertDialogDescription class="my-4">
              Sign into your MyGroceries account to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ClientOnly>

    <ClientOnly>
      <AlertDialog
        :open="showLaunchDialog"
        @update:open="showLaunchDialog = $event"
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle class="text-3xl"
              >Launching Soon!</AlertDialogTitle
            >
            <AlertDialogDescription class="my-4">
              We're launching soon and user accounts will be available shortly!
              Join our Discord community to stay updated on the latest
              developments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="showLaunchDialog = false"
              >Close</AlertDialogCancel
            >
            <Button variant="outline" as-child>
              <a
                href="https://discord.gg/SkdC3GCfdx"
                target="_blank"
                class="flex items-center gap-2"
              >
                <fa :icon="['fab', 'discord']" />
                Join us on Discord
              </a>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ClientOnly>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-full opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-full opacity-0"
    >
      <div class="bottom-4 right-4 fixed flex flex-col gap-2">
        <Button
          size="lg"
          class="relative shadow-md z-50 rounded-full h-16 w-16 shadow-foreground/20 border border-border"
          @click="showCartDrawer = true"
        >
          <fa icon="cart-shopping" style="height: 1.5rem; width: 1.5rem" />
          <Badge
            variant="secondary"
            class="absolute -top-2 -right-2 border-2 border-solid border-primary"
          >
            <ClientOnly>
              <template #fallback>0</template>

              {{ cart.totalItemCount }}
            </ClientOnly>
          </Badge>
        </Button>
        <Button
          size="lg"
          variant="outline"
          class="shadow-md z-50 rounded-full h-16 w-16 shadow-foreground/20 border border-border relative"
          @click="showBarcodeScanner = true"
        >
          <fa icon="barcode" style="height: 1.5rem; width: 1.5rem" />
        </Button>
      </div>
    </Transition>

    <ClientOnly>
      <CartDrawer
        :open="showCartDrawer"
        @close="showCartDrawer = false"
        @update:open="showCartDrawer = $event"
      />
    </ClientOnly>

    <ClientOnly>
      <Dialog
        :open="showBarcodeScanner"
        @update:open="showBarcodeScanner = $event"
      >
        <DialogContent class="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Scan Barcode</DialogTitle>
            <DialogDescription>
              Point your camera at a barcode to scan it
            </DialogDescription>
          </DialogHeader>

          <BarcodeScanner
            @code-scanned="
              (code) => {
                showBarcodeScanner = false;
                // TODO not all products will be keyed by barcode; we should resolve this
                router.push(`/product/${code}`);
              }
            "
          />

          <DialogFooter>
            <Button variant="secondary" @click="showBarcodeScanner = false">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientOnly>
  </div>
</template>

<style>
@keyframes bounce {
  0% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.1);
  }

  100% {
    transform: scale(1);
  }
}
</style>
