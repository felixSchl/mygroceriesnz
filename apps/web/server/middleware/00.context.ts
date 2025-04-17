import { createInngest, type InngestContext } from "@repo/backend/inngest";
import { SearchClient } from "@repo/backend/search";
import { DBClient } from "@repo/db";
import { WebhookClient, type WebhookMessageCreateOptions } from "discord.js";
import type { H3Event, H3EventContext } from "h3";
import { formatDistance } from "date-fns";

let app: H3EventContext["app"] | null = null;

function getInngestContext(event: H3Event): InngestContext {
  const app = event.context.app;
  if (!app) throw new Error("App context not found");
  const discord = event.context.app?.discord;
  return {
    ...app,
    notify: async ({ jobId, jobTitle, ...event }) => {
      if (!discord) return;
      if (!app.isProduction) return;

      const job = await app.db.getJob(jobId);
      const msgId = job?.discordMessageId;
      const duration =
        job?.startedAt && job.endedAt
          ? formatDistance(new Date(job.endedAt), new Date(job.startedAt), {
              includeSeconds: true,
            })
          : undefined;

      // TODO all this should be extracted somewhere; this is the wrong place for this.
      const messageContent: WebhookMessageCreateOptions = {
        embeds: [
          {
            title: jobTitle,
            description: (() => {
              let message = "";
              if (event.type === "JOB_FAILED") {
                message += `Error: \`\`\`\n${event.error}\n\`\`\`\n`;
              }
              if (event.type === "JOB_COMPLETED" && duration) {
                message += `Completed in ${duration}\n\n`;
              }
              if (event.runId) {
                message += `[View in Dashboard](${app.config.public.inngestBaseUrl}/runs/${event.runId})`;
              }
              return message;
            })(),
            author: {
              icon_url: (() => {
                switch (event.type) {
                  case "JOB_STARTED":
                    return `${app.config.public.host}/images/discord/loading.gif`;
                  case "JOB_COMPLETED":
                    return `${app.config.public.host}/images/discord/check.png`;
                  case "JOB_FAILED":
                    return `${app.config.public.host}/images/discord/cross.png`;
                  case "JOB_CANCELLED":
                    return `${app.config.public.host}/images/discord/cancel.png`;
                }
              })(),
              name: (() => {
                switch (event.type) {
                  case "JOB_STARTED":
                    return "job started";
                  case "JOB_COMPLETED":
                    return "job completed";
                  case "JOB_FAILED":
                    return "job failed";
                  case "JOB_CANCELLED":
                    return "job cancelled";
                  default:
                    return "unknown status";
                }
              })(),
            },
            timestamp: new Date().toISOString(), // Discord will automatically format this as "X time ago"
            color: (() => {
              switch (event.type) {
                case "JOB_STARTED":
                  return 0x3498db; // Blue
                case "JOB_COMPLETED":
                  return 0x2ecc71; // Green
                case "JOB_FAILED":
                  return 0xe74c3c; // Red
                case "JOB_CANCELLED":
                  return 0x95a5a6; // Gray
                default:
                  return 0x000000;
              }
            })(),
          },
        ],
        components:
          event.type === "JOB_STARTED"
            ? [
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      style: 4, // Danger style (red)
                      label: "Cancel Job",
                      custom_id: `cancel_job:${jobId}`,
                    },
                  ],
                },
              ]
            : [],
      };

      if (!msgId) {
        const msg = await discord.webhook.send(messageContent);
        // write the message id to the db
        await app.db.updateJob(jobId, {
          discordMessageId: msg.id,
        });
      } else {
        await discord.webhook.editMessage(msgId, messageContent);
      }
    },
  };
}

export default defineEventHandler(async (event) => {
  if (typeof event.context.app !== "undefined") {
    return;
  }

  const config = useRuntimeConfig(event);
  const isProduction = config.public?.env === "production";

  event.context.app = app ?? null;
  if (event.context.app) {
    // already loaded!
    return;
  }

  // install app context
  app = event.context.app = {
    config,
    isProduction,
    inngest: createInngest(getInngestContext),
    discord: !config.discord.webhookUrl
      ? null
      : {
          webhook: new WebhookClient({ url: config.discord.webhookUrl }),
        },
    db: DBClient.create(config.databaseUrl),
    search: SearchClient.create(
      config.meilisearch.host,
      config.meilisearch.apiKey,
    ),
  };
});
