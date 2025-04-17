import type { CategoryTreeNode } from "@repo/db";
import type { CategoryTreeQuery } from "@repo/db/categories";

export type AppContext = {
  showSelectStoresDialog: () => void;
  setSearching: (value: boolean) => void;
  activeCategory: Ref<string | undefined>;
  categories: CategoryTreeNode[];
  catQuery: CategoryTreeQuery;
};

export const AppInjectionKey = Symbol(
  "AppInjectionKey",
) as InjectionKey<AppContext>;

export function useAppContext(): AppContext {
  const context = inject(AppInjectionKey);
  if (!context) {
    throw new Error("useAppContext() called without provider.");
  }
  return context;
}
