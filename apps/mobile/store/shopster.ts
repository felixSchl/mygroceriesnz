import { DBClient } from "@/db";
import { DEFAULT_LIST_ID, ListEntry } from "@/db/schema";
import * as Location from "expo-location";
import { current, isDraft } from "mutative";
import { AppState, SelectedStore } from "./state";
import { SyncExternalStore } from "./store";
import { PriceData } from "@repo/backend/trpc/router";

/**
 * Shopster store implementation.
 */
export class ShopsterStore extends SyncExternalStore<AppState> {
  constructor(private readonly db: DBClient) {
    super(AppState.empty);
  }

  /**
   * Apply any pending store migrations.
   */
  async migrate() {
    await this.db.migrate();
  }

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  /**
   * Load application state into memory.
   */
  async loadAppState() {
    const st = await this.db.loadAppState();
    const loc = await Location.getForegroundPermissionsAsync();

    this.mutate((draft) => {
      draft.lists = st.lists;
      draft.locationGranted = loc.granted;
      draft.locationCanAskAgain = loc.canAskAgain;
      draft.activeListId = st.activeListId ?? DEFAULT_LIST_ID;
      draft.selectedStores = new Map(
        (st.selectedStores ?? []).map((s) => [s.key, s])
      );
    });
  }

  async setUseLocationInSearch(useLocationInSearch: boolean) {
    this.mutate((draft) => {
      draft.useLocationInSearch = useLocationInSearch;
    });
    await this.db.updateAppState({
      useLocationInSearch,
    });
  }

  async setProductQty(
    productId: string,
    qty: number,
    meta: Pick<ListEntry, "imageUrl" | "title">
  ) {
    const list = this.mutate((draft) => {
      let targetList = draft.lists.find((l) => l.id === draft.activeListId);

      if (targetList == null) {
        console.log("creating new list");
        targetList = defaultList();
        draft.lists.push(targetList);
      }

      if (qty === 0) {
        console.log("removing product", productId);
        targetList.items = targetList.items.filter(
          (i) => i.productId !== productId
        );
      } else {
        // this is a O(n) search; but this is not a hot method, so it's OK.
        const existingItem = targetList.items.find(
          (i) => i.productId === productId
        );
        if (existingItem == null) {
          console.log("adding product", productId);
          targetList.items.push({
            productId,
            quantity: qty,
            ...meta,
          });
        } else {
          console.log("updating product", productId);
          existingItem.quantity = qty;
          existingItem.imageUrl = meta.imageUrl;
          existingItem.title = meta.title;
        }
      }

      return isDraft(targetList) ? current(targetList) : targetList;
    });

    // update the db
    await this.db.updateList(list);
  }

  async removeSelectedStore(key: string) {
    const xs = this.mutate((draft) => {
      draft.selectedStores.delete(key);
      return Array.from(current(draft.selectedStores).values());
    });
    await this.db.updateAppState({
      selectedStores: xs,
    });
  }

  async addSelectedStore(store: SelectedStore) {
    const xs = this.mutate((draft) => {
      draft.selectedStores.set(store.key, store);
      return Array.from(current(draft.selectedStores).values());
    });
    await this.db.updateAppState({
      selectedStores: xs,
    });
  }

  setPriceStatus(productIds: string[], status: "loading" | "loaded" | "error") {
    this.mutate((draft) => {
      for (const productId of productIds) {
        draft.priceStatus.set(productId, status);
      }
    });
  }

  setPrices(productId: string, data: PriceData[]) {
    this.mutate((draft) => {
      draft.priceCache.set(productId, {
        timestamp: Date.now(),
        data,
      });
    });
  }

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  /**
   * Guard that an I/O read operation is only performed once.
   * Once the data is loaded, the data in memory should be considered
   * authoritative unless there is a cache miss or some other reason to
   * invalidate the cache.
   */
  #promises = new Map<string, Promise<any>>();
  async once<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const p = this.#promises.get(key);
    if (p != null) return p;
    const promise = fn();
    this.#promises.set(key, promise);
    return promise;
  }
}

// create a default list
// could be a static binding, but we'll create new references just to be safe.
function defaultList() {
  return {
    id: DEFAULT_LIST_ID,
    name: "Default",
    items: [],
  };
}
