import * as t from "@repo/io-ts";

export const PNS = t.literal("pns"); // paknsave
export const NW = t.literal("nw"); // new world
export const WW = t.literal("ww"); // woolworths

export type Retailer = t.TypeOf<typeof RetailerCodec>;
export type RetailerJSON = t.OutputOf<typeof RetailerCodec>;
export const RetailerCodec = t.union([WW, NW, PNS], "Retailer");

export type StoreId = `${Retailer}-${string}`;

// TODO remove this (use codec now)
export function formatStoreId(retailer: Retailer, id: string): StoreId {
  return `${retailer}-${id}`;
}

// TODO remove this (use codec now)
export function parseStoreId(storeString: string | null) {
  if (!storeString) return null;
  const [retailer, ...id] = storeString.split("-");
  if (!retailer) return null;
  const parseResult = t.decodeMaybe(RetailerCodec, retailer);
  if (!parseResult) return null;
  return { retailer: parseResult, id: id.join("-") };
}

export const StoreIdCodec = new t.Type<StoreId, string, unknown>(
  "StoreId",
  (u: unknown): u is StoreId => {
    if (typeof u !== "string") return false;
    const parsed = parseStoreId(u);
    return parsed !== null;
  },
  (u: unknown, c) => {
    if (typeof u !== "string") {
      return t.failure(u, c, "Input must be a string");
    }
    const parsed = parseStoreId(u);
    if (!parsed) {
      return t.failure(u, c, "Invalid store ID format");
    }
    return t.success(u as StoreId);
  },
  (a: StoreId) => a
);

export type SyncSchedule = t.TypeOf<typeof SyncScheduleCodec>;
export const SyncScheduleCodec = t.union([
  t.literal("never"),
  t.literal("daily"),
  t.literal("weekly"),
  t.literal("monthly"),
]);

export function syncScheduleInDays(schedule: SyncSchedule) {
  switch (schedule) {
    case "daily":
      return 1;
    case "weekly":
      return 7;
    case "monthly":
      return 30;
    default:
      return -1;
  }
}
