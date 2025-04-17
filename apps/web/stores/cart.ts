import type { AppRouter, PriceData } from "@repo/backend/trpc";
import { type Retailer } from "@repo/db";
import type { inferProcedureOutput, inferRouterOutputs } from "@trpc/server";
import SuperJSON from "superjson";
import type { LocationData } from "~/composables/useLocation";

type SelectedStoreMap = Map<string, SelectedStore>;

function toStoreKey(store: SelectedStore): string {
  return `${store.retailer}-${store.storeId}`;
}

export type CartItemMap = Map<
  string,
  {
    qty: number;
  }
>;

export type SelectedStore = {
  retailer: Retailer;
  storeId: string;
  name: string;
};

// TODO use codec
// const SelectedStoreCodec = t.strict(
//   {
//     retailer: t.string,
//     storeId: t.string,
//     name: t.string,
//   },
//   "SelectedStore",
// );
// const MainState = t.strict({
//   stores: t.array(SelectedStoreCodec),
// });

type CartRemoteData = inferProcedureOutput<AppRouter["getCartPrices"]>;

export const useCart = defineStore(
  "cart",
  () => {
    const trpc = useTrpc();

    const items = ref<CartItemMap>(new Map());
    const stores = ref<SelectedStoreMap>(new Map());

    // ephemeral: search cache
    const lastCompletedSearchKey = ref<string | null>(null);
    const searchCache = new Map<
      string, // search key (query + stores + location)
      {
        timestamp: number;
        data: inferRouterOutputs<AppRouter>["search"];
      }
    >();

    // ephemeral: price cache
    const priceCacheTrigger = ref(0);
    const priceStatus = new Map<
      string, // productId
      "loading" | "loaded" | "error"
    >();
    const priceCache = new Map<
      string, // productId
      {
        timestamp: number;
        data: PriceData[];
      }
    >();

    // ephemeral: cart state
    const cartPrices = ref<CartRemoteData>([]);
    const isRefreshingCartPrices = ref(false);
    const hasLoadedCartPrices = ref(false);

    // set my 'useLocation.ts'... a bit messy.
    const location = ref<LocationData | null>(null);

    return {
      // persisted
      items,
      stores,

      // ephemeral: location
      location,

      // ephemeral: price cache
      getPriceStatus: (productId: string) => {
        priceCacheTrigger.value; // trigger re-read
        return priceStatus.get(productId);
      },
      setPriceStatus: (
        productIds: string[],
        status: "loading" | "loaded" | "error",
      ) => {
        for (const productId of productIds) {
          priceStatus.set(productId, status);
        }
        // TOOD could trigger by productId
        priceCacheTrigger.value++;
      },
      getPrices: (productId: string, acceptStale: boolean) => {
        priceCacheTrigger.value; // trigger re-read
        const cached = priceCache.get(productId);
        if (cached != null) {
          // check if expired (5 minutes)
          if (!acceptStale && Date.now() - cached.timestamp > 1000 * 60 * 5) {
            return null;
          }
          return cached.data;
        }
      },
      setPrices: (productId: string, data: PriceData[]) => {
        // TODO could even merge the prices here...
        priceCache.set(productId, {
          timestamp: Date.now(),
          data,
        });
        // TOOD could trigger by productId
        priceCacheTrigger.value++;
      },

      // stores state & fns
      addStore: (store: SelectedStore) => {
        stores.value.set(toStoreKey(store), store);
      },
      removeStore: (store: SelectedStore | string) => {
        stores.value.delete(
          typeof store === "string" ? store : toStoreKey(store),
        );
      },
      selectedStores: computed(() => {
        return Array.from(stores.value.values());
      }),

      // cart/list state & fns
      hasLoadedPrices: hasLoadedCartPrices,
      prices: cartPrices,
      addItem: async (productId: string) => {
        const item = items.value.get(productId);
        if (item != null) {
          item.qty += 1;
          items.value.set(productId, item);
        } else {
          items.value.set(productId, { qty: 1 });
        }
      },
      updateQuantity: (productId: string, qty: number) => {
        if (qty <= 0) {
          items.value.delete(productId);
        } else {
          const item = items.value.get(productId);
          if (item != null) {
            items.value.set(productId, { ...item, qty });
          }
        }
      },
      totalItemCount: computed(() => {
        return Array.from(items.value.values()).reduce(
          (acc, { qty }) => acc + qty,
          0,
        );
      }),
      isRefreshingPrices: isRefreshingCartPrices,
      refreshPrices: async () => {
        isRefreshingCartPrices.value = true;
        try {
          const remoteData = await trpc.getCartPrices.query({
            items: Array.from(items.value.keys()),
            location: location.value,
            stores: Array.from(stores.value.values()).map((x) => ({
              retailer: x.retailer,
              storeId: x.storeId,
            })),
          });
          cartPrices.value = remoteData;
          hasLoadedCartPrices.value = true;
        } finally {
          isRefreshingCartPrices.value = false;
        }
      },

      // search state & fns
      searchCache,
      lastCompletedSearchKey,
    };
  },
  {
    persist: {
      key: "mg/main",
      pick: ["stores", "items"],
      storage: piniaPluginPersistedstate.localStorage(),
      serializer: {
        serialize: (value) => {
          return SuperJSON.stringify(value);
        },
        deserialize: (value) => {
          return SuperJSON.parse(value);
        },
      },
    },
  },
);
