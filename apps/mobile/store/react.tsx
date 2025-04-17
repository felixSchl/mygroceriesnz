import { shallow } from "@/hooks/useShallow";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useSyncExternalStore,
} from "react";
import { ShopsterStore } from "./shopster";
import { AppState } from "./state";

const Context = createContext<ShopsterStore | null>(null);

export function StoreProvider({
  children,
  store,
}: {
  children: React.ReactNode;
  store: ShopsterStore;
}) {
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

export function useStoreRef(): ShopsterStore {
  const store = useContext(Context);
  if (!store) {
    throw new Error("useStoreRef must be used within a StoreProvider");
  }
  return store;
}

export function useStore<T>(
  selector: (store: AppState) => T,
  areEqual: (a: T, b: T) => boolean = shallow
): T {
  const store = useContext(Context);
  if (!store) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  const fn = useMemoized(selector, areEqual);
  return useSyncExternalStore<T>(store.subscribe, () =>
    fn(store.getSnapshot())
  );
}

const EMPTY = Symbol("EMPTY");
export function useMemoized<S, U>(
  selector: (state: S) => U,
  areEqual: (a: U, b: U) => boolean = shallow
): (state: S) => U {
  const prev = useRef<U | typeof EMPTY>(EMPTY);
  return useCallback(
    (state) => {
      const next = selector(state);
      return prev.current !== EMPTY && areEqual(prev.current, next)
        ? (prev.current as U)
        : (prev.current = next);
    },
    [selector, areEqual]
  );
}
