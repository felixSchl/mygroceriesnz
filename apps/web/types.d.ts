import type { Inngest } from "@repo/backend/inngest";
import type { SearchClient } from "@repo/backend/search";
import type { DBClient } from "@repo/db";
import type { WebhookClient } from "discord.js";

export type Session = {
  // TODO
};

declare module "h3" {
  type ShopsterNotification = {
    title: string;
    message: string;
    type: "ERROR" | "INFO" | "SUCCESS";
  };

  interface H3EventContext {
    app?: null | {
      // TODO can we use 'NuxtRuntimeConfig' type here?
      config: {
        apiKey: string;
        discord: {
          botToken: string;
        };
        public: {
          host: string;
          inngestBaseUrl: string;
        };
      };
      isProduction: boolean;
      db: DBClient;
      search: SearchClient;
      inngest: Inngest;
      discord: null | {
        webhook: WebhookClient;
      };
    };

    user?: {
      role: "anon" | "user" | "admin";
    };
  }
}
