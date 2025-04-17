<script lang="ts" setup>
import { ChevronDown } from "lucide-vue-next";
definePageMeta({ layout: false });

useHead({
  title: "Compare Grocery Prices Across NZ Supermarkets | MyGroceries",
  meta: [
    {
      name: "description",
      content:
        "Compare grocery prices across Woolworths, PAK'nSAVE, and New World supermarkets in New Zealand. Find the best deals and save money on your weekly shopping.",
    },
    {
      name: "keywords",
      content:
        "grocery price comparison, NZ supermarket prices, Woolworths NZ, PAK'nSAVE prices, New World deals, grocery shopping New Zealand, supermarket price tracker, food prices NZ",
    },
    {
      property: "og:title",
      content: "Compare Grocery Prices Across NZ Supermarkets | MyGroceries",
    },
    {
      property: "og:description",
      content:
        "Save money on groceries by comparing prices across Woolworths, PAK'nSAVE, and New World supermarkets in New Zealand.",
    },
    {
      property: "og:image",
      content: "/Logo.png",
    },
    {
      name: "geo.region",
      content: "NZ",
    },
    {
      name: "geo.position",
      content: "-40.9006;174.886", // New Zealand center coordinates
    },
  ],
  link: [
    {
      rel: "canonical",
      href: "https://www.mygroceries.nz",
    },
  ],
});
</script>

<template>
  <NuxtLayout name="default" full-width>
    <section class="relative min-h-screen bg-background overflow-hidden">
      <!-- Background shapes -->
      <div class="absolute inset-0 overflow-hidden">
        <div
          class="absolute w-[50vw] h-[50vw] -top-[15%] -right-[10%] rounded-full bg-gradient-to-br from-green-500/10 to-green-500/[0.02]"
        ></div>
        <div
          class="absolute w-[30vw] h-[30vw] -bottom-[5%] -left-[5%] rounded-full bg-gradient-to-br from-green-500/10 to-green-500/[0.02]"
        ></div>
      </div>

      <!-- Main content -->
      <div
        class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:min-h-[50vh] grid grid-cols-1 lg:grid-cols-[1.2fr,0.8fr] gap-8 lg:gap-16 items-center mt-16"
      >
        <div class="max-w-2xl">
          <h1
            class="text-4xl sm:text-5xl font-extrabold text-foreground tracking-tight mb-6 lg:-mt-32"
          >
            <span
              class="text-transparent bg-clip-text bg-gradient-to-r from-green-500 to-green-600"
              >Compare prices</span
            >
            across NZ's biggest supermarkets
          </h1>

          <!-- mobile: logos -->
          <div
            class="relative flex items-center w-full h-full mb-8 mt-8 flex-row gap-4"
          >
            <RetailerIcon
              v-for="retailer in ['ww', 'pns', 'nw'] as const"
              :key="retailer"
              :retailer="retailer"
              class="h-10 transition-all duration-300 hover:scale-110 hover:-translate-y-1"
            />
          </div>

          <p class="text-xl text-muted-foreground mb-8">
            Find the best deals from Woolworths, PAK'nSAVE, and New World — all
            in one place.
          </p>
          <nuxt-link
            to="/search"
            class="inline-flex items-center px-8 py-4 text-lg font-semibold text-white bg-gradient-to-r from-green-500 to-green-600 rounded-xl shadow-lg shadow-green-500/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-green-500/30 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            Start Comparing
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 ml-2"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </nuxt-link>
        </div>
        <!-- app screenshots -->
        <div v-if="false" class="w-[400px] flex flex-col">
          <img
            src="/images/app-screenshot.png"
            alt="MyGroceries App"
            class="w-full h-full object-contain"
          />

          <div
            class="text-center text-lg bg-foreground text-background rounded-lg py-2 mt-2"
          >
            <span class="text-sm font-bold uppercase">
              Soon available as an App
            </span>
          </div>

          <Button variant="link" as-child>
            <nuxt-link
              href="https://discord.gg/SkdC3GCfdx"
              target="_blank"
              aria-label="Join us on Discord"
              class="flex items-center justify-center gap-2"
            >
              <fa :icon="['fab', 'discord']" />
              Become a Beta Tester &rarr;
            </nuxt-link>
          </Button>
        </div>
      </div>

      <!-- Add scroll indicator -->
      <div class="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <Button variant="ghost" size="icon">
          <ChevronDown class="h-6 w-6 text-gray-400" />
        </Button>
      </div>
    </section>

    <!-- Enhanced SEO section with Shadcn -->
    <section class="bg-background py-16">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card
          class="grid gap-12 md:grid-cols-2 lg:grid-cols-3 p-8 bg-card/50 backdrop-blur-sm border"
        >
          <!-- Value Proposition 1 -->
          <div>
            <CardHeader>
              <CardTitle class="text-xl font-semibold text-foreground">
                Save Money on Groceries
              </CardTitle>
            </CardHeader>
            <CardContent class="text-muted-foreground">
              Compare prices across Woolworths, PAK'nSAVE, and New World to find
              the best deals on your weekly shopping. Our real-time price
              comparison helps New Zealand families make informed decisions and
              save money on groceries.
            </CardContent>
          </div>

          <!-- Value Proposition 2 -->
          <div>
            <CardHeader>
              <CardTitle class="text-xl font-semibold text-foreground">
                Shop Smarter in New Zealand
              </CardTitle>
            </CardHeader>
            <CardContent class="text-muted-foreground">
              Whether you're in Auckland, Wellington, Christchurch, or anywhere
              else in New Zealand, easily track supermarket prices and special
              offers. Find the lowest prices on everyday essentials, fresh
              produce, and household items.
            </CardContent>
          </div>

          <!-- Value Proposition 3 -->
          <div>
            <CardHeader>
              <CardTitle class="text-xl font-semibold text-foreground">
                Compare Supermarket Prices Instantly
              </CardTitle>
            </CardHeader>
            <CardContent class="text-muted-foreground">
              Access up-to-date pricing from New Zealand's leading supermarkets.
              Compare prices on thousands of products, from fresh food to pantry
              staples, and discover which store offers the best value for your
              shopping list.
            </CardContent>
          </div>
        </Card>
      </div>
    </section>
  </NuxtLayout>
</template>
