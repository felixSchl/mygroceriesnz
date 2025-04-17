import { useStore, useStoreRef } from "@/store";
import { groupBy } from "lodash-es";
import { useTrpcClient } from "@/trpc/context";
import tw from "@/tw";
import { useInfiniteQuery } from "@tanstack/react-query";
import { hash as ohash } from "ohash";
import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDebounce } from "use-debounce";

export type BrowseHeader = {
  nextPage: () => void;
};

const _BrowseHeader = forwardRef(function _BrowseHeader(
  { flatlist }: { flatlist: React.RefObject<FlatList> },
  ref: React.Ref<BrowseHeader>
) {
  const insets = useSafeAreaInsets();
  const store = useStoreRef();
  const trpc = useTrpcClient();
  const useLocationInSearch = useStore((s) => s.useLocationInSearch);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearchInput] = useDebounce(searchInput, 300);
  const [fadeAnim] = useState(new Animated.Value(0));
  const selectedStores = useStore((s) => s.getSelectedStores());

  const queryKey = ohash([
    "search2",
    debouncedSearchInput,
    selectedStores.map((x) => x.key),
    useLocationInSearch,
  ]);

  const { data, status, fetchNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      initialPageParam: 1,
      getNextPageParam: (lastPage: any) => lastPage.nextCursor,
      queryKey: [queryKey],
      gcTime: 1000 * 60 * 5, // 5 minutes
      staleTime: 1000 * 60 * 5, // 5 minutes
      queryFn: async ({ pageParam }) => {
        const st = store.getSnapshot();
        const query = {
          q: debouncedSearchInput,
          stores: selectedStores.map((x) => x.key),
          page: pageParam,
          location:
            st.useLocationInSearch && st.location
              ? {
                  lat: st.location.coords.latitude,
                  lng: st.location.coords.longitude,
                }
              : undefined,
        } as const;

        console.log("[!] query", query);

        // if page 1, scroll to top
        if (pageParam === 1) {
          flatlist.current?.scrollToOffset({ offset: 0, animated: false });
        }

        try {
          const result = await trpc.search.query(query);
          return {
            total: result.total,
            hits: result.hits,
            nextCursor: result.hits.length === 0 ? null : pageParam + 1,
          };
        } catch (e) {
          console.error("[!] search error", e);
          throw e;
        }
      },
      refetchOnMount: false,
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchIntervalInBackground: false,
      refetchOnReconnect: false,
    });

  useImperativeHandle(ref, () => ({
    nextPage: () => {
      console.log("[!] nextPage");
      fetchNextPage();
    },
  }));

  useEffect(() => {
    console.log("[!] status", status);
    // update store state
    store.mutate((draft) => {
      draft.searchStatus = isFetchingNextPage ? "refetching" : status;
      if (status !== "success") return;
      draft.searchResults = data?.pages.flatMap((x) => x.hits) ?? [];
    });

    // only load prices if we have a successful search
    if (status !== "success") return;

    const latestPage = data?.pages[data.pages.length - 1] ?? null;
    if (latestPage == null) return;

    const state = store.getSnapshot();
    const stores = Array.from(state.getSelectedStores().map((x) => x.key));
    const location =
      state.useLocationInSearch && state.location
        ? {
            lat: state.location.coords.latitude,
            lng: state.location.coords.longitude,
          }
        : undefined;

    const productIds = (latestPage.hits ?? [])
      .filter((item) => {
        const price = state.getPrices(item.id, /* stale: */ false);
        return price == null;
      })
      .map((x) => x.id);

    // load prices
    store.setPriceStatus(productIds, "loading");

    // fetch prices
    void trpc.getPrices
      .query({
        productIds,
        stores,
        location,
      })
      .then(
        (data) => {
          const grouped = groupBy(data, "productId");
          for (const [productId, prices] of Object.entries(grouped)) {
            store.setPrices(productId, prices);
          }
          store.setPriceStatus(productIds, "loaded");
        },
        () => {
          store.setPriceStatus(productIds, "error");
        }
      );
  }, [status, data, isFetchingNextPage]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: status === "pending" ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [status]);

  return (
    <View
      style={[
        tw`bg-background border-b border-border shadow-sm`,
        { paddingTop: insets.top },
      ]}
    >
      <View style={tw`flex-row items-center relative`}>
        <TextInput
          style={tw`flex-1 h-[44px] rounded-lg bg-input p-[12px] pr-[32px] text-[16px] mx-2 my-2`}
          placeholderTextColor={tw.color("muted-foreground")}
          placeholder="Search products..."
          value={searchInput}
          onChangeText={setSearchInput}
          clearButtonMode={status === "pending" ? "never" : "while-editing"}
          returnKeyType="search"
        />
        <Animated.View style={[tw`absolute right-4`, { opacity: fadeAnim }]}>
          <ActivityIndicator size="small" />
        </Animated.View>
      </View>
    </View>
  );
});

export const BrowseHeader = memo(_BrowseHeader);
