import { SelectedStore } from "@/store/state";
import { createId } from "@paralleldrive/cuid2";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const DEFAULT_APP_STATE_ID = 1;
export const DEFAULT_LIST_ID = "default";

export const generateId = createId;

export const appStateTable = sqliteTable("app_state", {
  id: integer("id").primaryKey().default(DEFAULT_APP_STATE_ID),

  // store selection
  selectedStores: text("selected_stores", { mode: "json" })
    .$type<SelectedStore[]>()
    .default([]),

  // lists feature
  activeListId: text("active_list").default(DEFAULT_LIST_ID),

  // location
  useLocationInSearch: integer("use_location_in_search", {
    mode: "boolean",
  }).default(true),
});

export type ListEntry = {
  productId: string;
  quantity: number;

  // meta information for display
  title: string;
  imageUrl?: string | null | undefined;
};

export const listTable = sqliteTable("list", {
  id: text("id").primaryKey().default(DEFAULT_LIST_ID),
  name: text("name").default("default"),
  items: text("items", { mode: "json" }).$type<ListEntry[]>().default([]),
});
