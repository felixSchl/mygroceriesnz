import type { AppRouter } from "@repo/backend/trpc";
import { defineNuxtPlugin, useRequestFetch } from "nuxt/app";
import { SuperJSON } from "superjson";
import { createTRPCNuxtClient, httpLink } from "trpc-nuxt/client";

export default defineNuxtPlugin(() => {
  // WORKAROUND https://github.com/wobsoriano/trpc-nuxt/issues/175
  const ssrFetchFn: any = useRequestFetch();
  const requestFetch = async (...args: any[]) => {
    const out: any = await ssrFetchFn(...args);
    return {
      ...out,
      json: async () => {
        return out;
      },
    };
  };

  const client = createTRPCNuxtClient<AppRouter>({
    links: [
      httpLink({
        url: "/api/trpc",
        transformer: SuperJSON,
        // WORKAROUND https://github.com/wobsoriano/trpc-nuxt/issues/175
        // https://github.com/nuxt/nuxt/blob/main/packages/nuxt/src/app/composables/fetch.ts#L172-L178
        fetch: import.meta.server ? requestFetch : undefined,
      }),
    ],
  });
  return {
    provide: {
      trpc: client,
    },
  };
});
