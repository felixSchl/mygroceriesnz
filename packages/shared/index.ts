import { formatStoreId, type Retailer } from "@repo/db/codecs";
import type { AppRouter } from "@repo/backend/trpc";
import type { inferProcedureOutput } from "@trpc/server";

type ProductInfo = NonNullable<
  inferProcedureOutput<AppRouter["_def"]["procedures"]["productInfo"]>
>;

type SelectedStore = {
  id: string;
  name: string;
  retailer: Retailer;
  key: string;
};

export type Row = {
  fallback?: boolean;

  // store info
  key: string;
  retailer: Retailer;
  storeId: string;
  storeName: string;
  shortStoreName: string;
  retailerSku: string | null;
  lastSyncedAt: string | null;

  // price info
  isBestPrice: boolean;
  priceData: {
    unitDisplay: string | null;
    unit: string | null;
    unitPrice: number | null;
    originalPrice: number;
    salePrice: number | null;
    clubPrice: number | null;
    isFallbackPrice: boolean;
    multiBuy: {
      quantity: number;
      price: number;
    } | null;
  } | null;
};

type StoreInput = Omit<SelectedStore, "name"> & {
  fallback?: boolean;
  name?: string | null;
};

export function shortStoreName(retailer: Retailer, name: string) {
  if (retailer === "ww") return name.replace("Woolworths", "").trim();
  if (retailer === "pns") return name.replace("PAK'nSAVE", "").trim();
  if (retailer === "nw") return name.replace("New World", "").trim();
  return name;
}

/**
 * Transform the pricing data into a easy to use format.
 */
export function xformRows(
  data: Pick<ProductInfo, "prices">,
  selectedStores: StoreInput[]
): Row[] {
  const output: Row[] = [];

  // resolve which store information to display, based on what the user has
  // requested & what it is available (the server might send more than the user
  // requested based on location, for example.)
  const stores: StoreInput[] = [
    ...selectedStores,
    ...(data.prices ?? [])
      .filter(
        (p) =>
          // don't double-up on stores
          !selectedStores.find(
            (s) => s.retailer === p.retailer && s.id === p.storeId
          )
      )
      .map((p) => ({
        id: p.storeId,
        retailer: p.retailer,
        key: formatStoreId(p.retailer, p.storeId),
        name: p.storeName,
        shortStoreName: shortStoreName(p.retailer, p.storeName),
        lastSyncedAt: p.lastSyncedAt,
        isBestPrice: false,
        fallback: true,
      })),
  ];

  // resolve the price data for each store
  for (const store of stores) {
    // find the price info for the store
    // TODO(PERF) use "store key" here and/or use a map?
    const priceData = data.prices.find(
      (price) =>
        price.retailer === store.retailer && //
        price.storeId === store.id
    );

    // in cases where a product did not have direct price data for a store,
    // the server might resolve relevant price data from a different store.
    // we'll show this information as a fallback.
    const fallbackPriceData = data.prices.find(
      (price) =>
        price.retailer === store.retailer && price.originalStoreId === store.id
    );

    // prefer a direct match, but record a fallback price if possible
    const resolvedPriceData = priceData ?? fallbackPriceData;

    const storeName =
      priceData?.storeName ?? fallbackPriceData?.storeName ?? store.name ?? "-";

    output.push({
      // store info
      key: formatStoreId(store.retailer, store.id),
      retailer: store.retailer,
      storeId: store.id,
      storeName,
      shortStoreName: shortStoreName(store.retailer, storeName),
      retailerSku: resolvedPriceData?.retailerSku ?? null,

      // price info
      fallback: store.fallback ?? false,
      lastSyncedAt: resolvedPriceData?.lastSyncedAt ?? null,
      priceData:
        resolvedPriceData == null
          ? null
          : {
              //
              unitDisplay: resolvedPriceData.unitDisplay,
              unitPrice: resolvedPriceData.originalUnitPrice
                ? resolvedPriceData.originalUnitPrice / 100
                : null,
              unit:
                resolvedPriceData.unitQtyUom != null
                  ? resolvedPriceData.unitQty != null &&
                    resolvedPriceData.unitQty > 1
                    ? `${resolvedPriceData.unitQty}${resolvedPriceData.unitQtyUom}`
                    : resolvedPriceData.unitQtyUom
                  : null,
              originalPrice: resolvedPriceData.originalPrice / 100,
              salePrice: resolvedPriceData.salePrice
                ? resolvedPriceData.salePrice / 100
                : null,
              multiBuy:
                resolvedPriceData.multiBuyPrice != null &&
                resolvedPriceData.multiBuyThreshold != null
                  ? {
                      quantity: resolvedPriceData.multiBuyThreshold,
                      price: resolvedPriceData.multiBuyPrice / 100,
                    }
                  : null,
              clubPrice: resolvedPriceData.clubPrice
                ? resolvedPriceData.clubPrice / 100
                : null,
              isFallbackPrice: priceData == null,
            },
      isBestPrice: false, // we'll set this later
    });
  }

  // patch retailer skus
  // do our best to assign a SKU for the item; the SKUs are the same across all
  // stores of this retailer, so we'll use the first store that has that information.
  for (const row of output) {
    row.retailerSku =
      row.retailerSku ??
      output.find((r) => r.retailer === row.retailer && r.priceData != null)
        ?.retailerSku ??
      null;
  }

  // // finally, try and integrate any extraenous price data that the user has
  // for (const price of data.prices) {
  //   // check if we already have this row
  //   if (
  //     output.find(
  //       (r) =>
  //         r.retailer === price.retailer && //
  //         r.storeId === price.storeId
  //     )
  //   ) {
  //     continue;
  //   }
  //   output.push({
  //     ...price,
  //     shortStoreName: shortStoreName(price.retailer, price.storeName),
  //     fallback: true,
  //     priceData: {
  //       ...price,
  //       unit: price.unit ?? null,
  //     },
  //     key: `${price.retailer}-${price.storeId}`,
  //     isBestPrice: false,
  //   });
  // }

  // Sort the output array by the following criteria:
  output.sort((a, b) => {
    // 1. Prefer non-fallbacks
    if (a.fallback !== b.fallback) {
      return a.fallback ? 1 : -1;
    }

    // 2. Prefer available prices
    if ((a.priceData === null) !== (b.priceData === null)) {
      return a.priceData === null ? 1 : -1;
    }

    // 3. Prefer lower prices
    if (a.priceData && b.priceData) {
      const aPrice = a.priceData.salePrice ?? a.priceData.originalPrice;
      const bPrice = b.priceData.salePrice ?? b.priceData.originalPrice;
      return aPrice - bPrice;
    }

    return 0;
  });

  // patch the 'isBestPrice' flag
  // find the best price across all stores (mark the row with the lowest price)
  let bestPrice = Infinity;
  let bestRow: (typeof output)[number] | null = null;
  for (const row of output) {
    if (row.priceData == null) continue;
    const price =
      row.priceData.salePrice ??
      row.priceData.clubPrice ??
      row.priceData.originalPrice;
    if (price < bestPrice) {
      bestPrice = price;
      bestRow = row;
    }
  }

  if (bestRow != null) {
    bestRow.isBestPrice = true;
  }

  // move the best price to the front of the array
  output.sort((a, b) => (a.isBestPrice ? -1 : 1));

  return output;
}
