import type { Retailer } from "@repo/db";
import SuperJSON from "superjson";

type Store = {
  retailer: Retailer;
  storeId: string;
};

export const usePrefs = defineStore(
  "prefs",
  () => {
    const selectedStores = ref(new Set<Store>());
    return {
      selectedStores,
    };
  },
  {
    persist: {
      serializer: {
        serialize: SuperJSON.stringify,
        deserialize: SuperJSON.parse,
      },
      storage: piniaPluginPersistedstate.cookies(),
    },
  },
);
