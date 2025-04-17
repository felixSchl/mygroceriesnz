import { List } from "@/db";
import { shallow } from "@/hooks/useShallow";
import type { Retailer } from "@repo/backend";
import { PriceData, SearchHit } from "@repo/backend/trpc";
import { LocationObject } from "expo-location";
import { immerable } from "immer";
import { Draft } from "mutative";

export interface IrongGainsStateMutation<T = void> {
  (state: Draft<AppState>): T;
}

export const Loading = Symbol.for("Loading");
export type Loading = typeof Loading;

type AsyncStatus = "success" | "pending" | "error";

export type SelectedStore = {
  // unique id
  key: string;

  // retailer-specific id
  id: string;
  retailer: Retailer;

  // meta information
  name: string;
};

type StoreKey = string; // formatStoreId/parseStoreId

export class AppState {
  [immerable] = true;

  static empty = new AppState();

  //------------------------------------------------------------------------------
  // Data
  //------------------------------------------------------------------------------

  activeListId: string = "default";
  lists: List[] = [];
  searchStatus: AsyncStatus | "refetching" = "pending";
  searchResults: SearchHit[] | null = null;
  selectedStores = new Map<StoreKey, SelectedStore>();
  useLocationInSearch: boolean = true;
  priceStatus = new Map<
    string, // productId
    "loading" | "loaded" | "error"
  >();
  priceCache = new Map<
    string, // productId
    {
      timestamp: number;
      data: PriceData[];
    }
  >();

  locationGranted: boolean = false;
  locationCanAskAgain: boolean = false;
  location: LocationObject | null = null;

  // caches
  /* private */ _cache = new Map<string, CacheEntry>();

  //------------------------------------------------------------------------------
  // Mutations
  //------------------------------------------------------------------------------

  // ...

  //------------------------------------------------------------------------------
  // Queries
  //------------------------------------------------------------------------------

  getPriceStatus(productId: string) {
    return this.priceStatus.get(productId);
  }

  getPrices(productId: string, acceptStale: boolean) {
    const cached = this.priceCache.get(productId);
    if (cached != null) {
      // check if expired (5 minutes)
      if (!acceptStale && Date.now() - cached.timestamp > 1000 * 60 * 5) {
        return null;
      }
      return cached.data;
    }
  }

  getActiveList() {
    return this.cached(
      "activeList",
      () => this.lists.find((l) => l.id === this.activeListId),
      [this.lists, this.activeListId]
    );
  }

  getProductQty(productId: string) {
    return this._getActiveListIndexedByItemId().get(productId)?.quantity ?? 0;
  }

  _getActiveListIndexedByItemId() {
    const activeList = this.getActiveList();
    return this.cached(
      "activeListByItemId",
      () => new Map(activeList?.items.map((i) => [i.productId, i])),
      [activeList]
    );
  }

  getActiveListCount() {
    let count = 0;
    this.getActiveList()?.items.forEach((i) => {
      count += i.quantity;
    });
    return count;
  }

  getSelectedStoreCount() {
    return this.selectedStores.size;
  }

  getSelectedStores() {
    return this.cached(
      "selectedStores",
      () => Array.from(this.selectedStores.values()),
      [this.selectedStores]
    );
  }

  cached<T>(
    key: string,
    fn: () => T,
    deps: any[] = [],
    cmp: (a: T, b: T) => boolean = shallow
  ): T {
    const entry = this._cache.get(key);
    if (entry == null || !deps.every((dep, i) => dep === entry.deps[i])) {
      const value = fn();
      // only update the cache if the value has changed
      if (entry == null || !cmp(entry.value, value)) {
        this._cache.set(key, { value, deps });
      }
      return value;
    }
    return entry.value;
  }
}

type CacheEntry = {
  value: any;
  deps: any[];
};
