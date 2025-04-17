import { formatStoreId, parseStoreId } from "@repo/db";
import { formatDistance } from "date-fns";
import { format } from "date-fns-tz";
import type {
  APIChatInputApplicationCommandInteractionData,
  APIMessageComponentInteraction,
} from "discord-api-types/v10";
import { verifyKey } from "discord-interactions";
import type { APIChatInputApplicationCommandInteraction } from "discord.js";
import type { H3Event } from "h3";
import table from "text-table";

// Discord interaction types
const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const;

// Add store command response types
const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8,
} as const;

export default defineEventHandler(async (event: H3Event) => {
  const config = useRuntimeConfig();

  // Get the raw body for signature verification
  const rawBody = await readRawBody(event);
  if (!rawBody) {
    throw createError({
      statusCode: 400,
      statusMessage: "No body found",
    });
  }

  const signature = getHeader(event, "x-signature-ed25519");
  const timestamp = getHeader(event, "x-signature-timestamp");

  // Verify the request is from Discord
  const isValidRequest = await verifyKey(
    rawBody,
    signature ?? "",
    timestamp ?? "",
    config.discord.publicKey,
  );

  if (!isValidRequest) {
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid request signature",
    });
  }

  const body = JSON.parse(rawBody);

  // Handle Discord ping
  if (body.type === InteractionType.PING) {
    return { type: 1 }; // Return PONG
  }

  // Handle other interaction types
  switch (body.type) {
    case InteractionType.APPLICATION_COMMAND:
      return handleCommand(body, event);
    case InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE:
      return handleAutocomplete(body, event);
    case InteractionType.MESSAGE_COMPONENT:
      return handleComponent(body, event);
    default:
      throw createError({
        statusCode: 400,
        statusMessage: "Unsupported interaction type",
      });
  }
});

// Add autocomplete handler
async function handleAutocomplete(
  interaction: APIChatInputApplicationCommandInteraction,
  event: H3Event,
) {
  const { name, options } = interaction.data;

  const app = event.context.app;
  if (!app) {
    // should never happen
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error. Application Context not found.",
    });
  }

  if (name === "store") {
    // TODO(TS) make this work with TypeScript
    // @ts-expect-error
    const query = options?.[0]?.value ?? "";
    const stores = await app.search.searchStores({
      query,
      limit: 25, // max discord choices
    });
    return {
      type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
      data: {
        choices: stores.map((store) => ({
          name: `[${store.retailer.toUpperCase()}] ${store.name}`,
          value: formatStoreId(store.retailer, store.id),
        })),
      },
    };
  }
}

// Update command handler
async function handleCommand(
  interaction: APIChatInputApplicationCommandInteraction,
  event: H3Event,
) {
  const { name } = interaction.data;

  const app = event.context.app;
  if (!app) {
    // should never happen
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error. Application Context not found.",
    });
  }

  switch (name) {
    case "store": {
      const data =
        interaction.data as APIChatInputApplicationCommandInteractionData;
      // TODO(TS) make this work with TypeScript
      // @ts-expect-error
      const storeKey = data.options?.[0]?.value;
      const summary = await app.db.getSummaryStoreByKey(storeKey);
      if (!summary) {
        return {
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: "Store not found",
          },
        };
      }

      return createStoreSummaryResponse(summary, storeKey, app);
    }
    default:
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "Unknown command",
        },
      };
  }
}

// Add new handler function
async function handleComponent(
  interaction: APIMessageComponentInteraction,
  event: H3Event,
) {
  const { custom_id } = interaction.data;
  const app = event.context.app;

  if (!app) {
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error. Application Context not found.",
    });
  }

  if (custom_id.startsWith("sync_store:")) {
    const [, ...storeKey_] = custom_id.split(":");
    const storeKey = storeKey_.join(":");
    const parseResult = parseStoreId(storeKey);
    if (!parseResult) {
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "Invalid store key",
        },
      };
    }
    const { retailer, id: storeId } = parseResult;

    try {
      // Acknowledge the interaction immediately
      // TODO this logic is duplicated in the TRPC handler ('startJob'.) It
      //      would be great to consolidate.
      await app.inngest.client.send({
        name: `scrape/products.requested`,
        data: {
          retailer,
          storeId,
          mode: "fast",
        },
      });

      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "✅ Store sync has been queued!",
          flags: 64, // Ephemeral - only visible to the user who clicked
        },
      };
    } catch (error) {
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "❌ Failed to queue store sync. Please try again later.",
          flags: 64, // Ephemeral
        },
      };
    }
  }

  if (custom_id.startsWith("refresh_store:")) {
    const [, ...storeKey_] = custom_id.split(":");
    const storeKey = storeKey_.join(":");
    const summary = await app.db.getSummaryStoreByKey(storeKey);

    if (!summary) {
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "Store not found",
          flags: 64, // Ephemeral
        },
      };
    }

    const { data: summaryContent } = createStoreSummaryResponse(
      summary,
      storeKey,
      app,
    );

    const response = await fetch(
      `https://discord.com/api/v10/channels/${interaction.message.channel_id}/messages/${interaction.message.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bot ${app.config.discord.botToken}`,
        },
        body: JSON.stringify(summaryContent),
      },
    );

    if (!response.ok) {
      console.error("Discord API Error:", {
        status: response.status,
        statusText: response.statusText,
        body: await response.text(),
      });
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "Failed to refresh store information",
          flags: 64, // Ephemeral
        },
      };
    }

    // Return null to acknowledge the interaction without sending a new message
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "✅ Store information has been refreshed",
        flags: 64, // Ephemeral
      },
    };
  }

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: "Unknown component interaction",
      flags: 64, // Ephemeral
    },
  };
}

// Add this new helper function
function createStoreSummaryResponse(
  summary: any,
  storeKey: string,
  app: NonNullable<H3Event["context"]["app"]>,
) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `[${summary.store.retailer.toUpperCase()}] ${summary.store.name}
\`\`\`
${table([
  ["Products", summary.productCount ?? 0],
  [
    "Last Sync",
    summary.store.lastSyncedAt
      ? format(summary.store.lastSyncedAt, "MM/dd/yyyy hh:mm:ss a")
      : "Never",
  ],
  [
    "Next Sync",
    summary.nextSyncDue
      ? formatDistance(summary.nextSyncDue, new Date(), {
          addSuffix: true,
        })
      : "Not scheduled",
  ],
])}
\`\`\``,
      components: [
        {
          type: 1, // Action Row
          components: [
            {
              type: 2, // Button
              style: 5, // Link
              label: "Open in Admin",
              url: `${app.config.public.host}/admin/stores?store=${storeKey}`,
            },
            {
              type: 2, // Button
              style: 3, // Success (Green)
              label: "Sync Now",
              custom_id: `sync_store:${storeKey}`,
            },
            {
              type: 2, // Button
              style: 1, // Primary (Blue)
              label: "Refresh",
              custom_id: `refresh_store:${storeKey}`,
            },
          ],
        },
      ],
    },
  };
}
