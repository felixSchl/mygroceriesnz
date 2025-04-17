export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const isDevServer = config.public.env !== "production";
  const baseUrl = isDevServer
    ? `http://localhost:8288`
    : config.public.inngestBaseUrl || "https://app.inngest.com/env/production";

  return {
    provide: {
      inngest: {
        runURL(id: string) {
          // for some reason the dev server has a different format...
          if (isDevServer) {
            return `${baseUrl}/run?runID=${id}`;
          }
          return `${baseUrl}/runs/${id}`;
        },
      },
    },
  };
});
