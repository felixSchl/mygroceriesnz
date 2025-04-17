import { createNuxtApiHandler } from "trpc-nuxt";
import { appRouter } from "@repo/backend/trpc";

export default createNuxtApiHandler({
  router: appRouter,
  createContext: (event) => {
    if (!event.context.app) {
      throw new Error("[E]app context not found");
    }
    const config = useRuntimeConfig();
    return {
      ...event.context.app,
      inngest: event.context.app.inngest.client,
      user: event.context.user ?? null,
      event,
      discord: config.discord,
      adminSignIn: async (key: string) => {
        if (config.shopster.adminKey === key) {
          setCookie(event, "tmp_session", key, {
            httpOnly: true,
            maxAge: 60 * 60 * 24 * 7, // 1 week
            sameSite: "lax",
            secure: true,
          });
          return true;
        }
        return false;
      },
    };
  },
});
