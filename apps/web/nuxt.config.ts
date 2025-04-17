import { createResolver } from "nuxt/kit";

const { resolve } = createResolver(import.meta.url);

const packages = [
  "db",
  "backend",
  "io-ts",
  "utils",
  "adapter-ww",
  "adapter-pns",
  "discord-bot",
];

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  alias: packages.reduce(
    (acc, pkg) => {
      acc[`@repo/${pkg}`] = resolve(`../../packages/${pkg}`);
      return acc;
    },
    {} as Record<string, string>,
  ),
  umami: {
    id: "50f1f18d-df8d-4efe-9092-0067dffd9770",
    autoTrack: true,
    host: "https://cloud.umami.is",
    ignoreLocalhost: true,
  },
  routeRules: {},
  typescript: {
    strict: true,
    // typeCheck: true,
    tsConfig: {
      compilerOptions: {
        strictNullChecks: true,
        noUncheckedIndexedAccess: true,
      },
      files: ["../types.d.ts"],
    },
  },
  imports: {
    dirs: ["./stores", "./context"],
  },
  compatibilityDate: "2024-04-03",
  devtools: { enabled: true },
  modules: [
    "nuxt-umami",
    "shadcn-nuxt",
    "@pinia/nuxt",
    "pinia-plugin-persistedstate/nuxt",
    "@nuxtjs/tailwindcss",
    [
      "@nuxtjs/google-fonts",
      {
        families: {
          Poppins: [400, 500, 600, 700],
        },
      },
    ],
    "@nuxtjs/sitemap",
  ],
  // TODO we should use NUXT_* style env vars instead of process.env
  runtimeConfig: {
    apiKey: "",
    databaseUrl: process.env.DATABASE_URL ?? "",
    discord: {
      publicKey: process.env.DISCORD_PUBLIC_KEY ?? "",
      applicationId: process.env.DISCORD_APPLICATION_ID ?? "",
      botToken: process.env.DISCORD_BOT_TOKEN ?? "",
      webhookUrl: process.env.DISCORD_WEBHOOK_URL ?? "",
    },
    shopster: {
      // temporary means to authenticate admin requests while we don't have a
      // proper auth system
      adminKey: process.env.SHOPSTER_ADMIN_KEY ?? "",
    },
    meilisearch: {
      host: process.env.MEILISEARCH_HOST ?? "",
      apiKey: process.env.MEILISEARCH_API_KEY ?? "",
    },
    inngest: {
      eventKey: process.env.INNGEST_EVENT_KEY ?? "",
    },
    public: {
      env: process.env.NODE_ENV ?? "",
      host: process.env.NUXT_PUBLIC_HOST ?? "",
      mapsApiKey: process.env.MAPS_API_KEY ?? "",
      inngestBaseUrl: process.env.NUXT_PUBLIC_INNGEST_BASE_URL ?? "",
    },
  },
  devServer: { port: 3311 },
  build: {
    transpile: [
      "radix-vue",
      "drizzle-orm",
      "trpc-nuxt",
      "@repo/io-ts",
      "@repo/db",
      "@repo/backend",
      "@repo/io-ts",
      "@repo/utils",
      "@repo/adapter-ww",
      "@repo/adapter-pns",
      "@fortawesome/vue-fontawesome",
      "@fortawesome/fontawesome-svg-core",
      "@fortawesome/pro-solid-svg-icons",
      "@fortawesome/pro-regular-svg-icons",
      "@fortawesome/pro-light-svg-icons",
      "@fortawesome/free-brands-svg-icons",
      "@trpc/server",
      "@swc/helpers",
      "fp-ts",
      "io-ts",
      "io-ts-reporters",
      "io-ts-types",

      // XXX required to make inngest work; who knows why - so frustrating.
      //     without this inngest will run into seemingly unrelated errors
      //     regarding 'chalk' npm module. Much time has been lost finding
      //     this solution...
      "json-stringify-safe",
      "inngest",
      "chalk",
    ],
  },
  sitemap: {
    exclude: ["/login/**", "/api/**"],
  },
  css: [
    "assets/css/tailwind.css",
    "@fortawesome/fontawesome-svg-core/styles.css",
    "vue-toast-notification/dist/theme-sugar.css",
  ],
  pinia: {
    storesDirs: ["./stores"],
  },
  vite: {
    optimizeDeps: {
      exclude: ["vee-validate", "inngest", "chalk"],
    },
    assetsInclude: ["**/*.wasm"],
  },
  watch: packages.map((pkg) => `../../packages/${pkg}/*`),
  shadcn: {
    prefix: "",
    componentDir: "./components/ui",
  },
  postcss: {
    plugins: {
      "postcss-import": {},
      "postcss-advanced-variables": {},
      "tailwindcss/nesting": {},
      autoprefixer: {},
    },
  },
  colorMode: {
    preference: "system",
    classSuffix: "",
  },
  app: {
    head: {
      meta: [
        {
          name: "theme-color",
          content: "#ffffff",
          media: "(prefers-color-scheme: light)",
        },
        {
          name: "theme-color",
          content: "#151718",
          media: "(prefers-color-scheme: dark)",
        },
      ],
      link: [
        { rel: "icon", type: "image/png", href: "/favicon-32x32.png" },
        {
          rel: "icon",
          type: "image/png",
          sizes: "16x16",
          href: "/favicon-16x16.png",
        },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
        { rel: "manifest", href: "/site.webmanifest" },
      ],
    },
  },
});
