import { RetailerIcon } from "@/components/RetailerIcon";
import { useStore, useStoreRef } from "@/store";
import { useTrpcClient } from "@/trpc/context";
import tw from "@/tw";
import AntDesign from "@expo/vector-icons/AntDesign";
import Entypo from "@expo/vector-icons/Entypo";
import { HeaderBackButton } from "@react-navigation/elements";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { formatStoreId, Retailer } from "@repo/db/codecs";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { memo, useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useDebounce } from "use-debounce";

type Store = {
  id: string;
  retailer: Retailer;
  name: string;
  lastSyncedAt?: Date | string | null;
};

function storeKey(store: Pick<Store, "retailer" | "id">) {
  return formatStoreId(store.retailer, store.id);
}

export default function StoreFinderScreen() {
  const trpc = useTrpcClient();
  const [filterQuery, setFilterQuery] = useState("");
  const selectedStoreCount = useStore((s) => s.getSelectedStoreCount());
  const [debouncedFilterQuery] = useDebounce(filterQuery, 300);

  // load recent stores from the server
  const {
    status,
    data: recentStoresRemote,
    isLoading: isFetchingRecentStores,
    isError,
  } = useQuery({
    queryKey: ["recentStoresRemote"],
    queryFn: () => trpc.getRecentStores.query(),
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });

  // load stores matching the search query from the server
  const { data, isLoading, isRefetching } = useQuery({
    queryKey: ["searchStores", debouncedFilterQuery],
    queryFn: () =>
      trpc.searchStores.query({
        q: debouncedFilterQuery,
      }),
    staleTime: 1000 * 60 * 60 * 3, // 3 hours
    placeholderData: keepPreviousData,
  });

  const searchInputRef = useRef<TextInput>(null);

  useFocusEffect(
    useCallback(() => {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 1);
    }, [])
  );

  const hasSearchQuery = debouncedFilterQuery.length > 0;

  // Determine which data to show based on search query
  const displayData = hasSearchQuery ? (data ?? []) : recentStoresRemote;
  const isLoadingData = hasSearchQuery ? isLoading : isFetchingRecentStores;
  const { goBack, canGoBack } = useNavigation();

  const EmptyList = () => {
    if (displayData == null && isLoadingData && !isRefetching) {
      return (
        <View style={tw`flex-1 items-center mt-16`}>
          <ActivityIndicator size="large" />
          <Text style={tw`mt-3 text-muted-foreground`}>
            {isError
              ? "Error loading stores"
              : hasSearchQuery
                ? "Searching stores..."
                : "Loading recent stores..."}
          </Text>
        </View>
      );
    }

    if (isRefetching) return null;

    return (
      <View style={tw`flex-1 items-center justify-center py-8`}>
        <Text style={tw`text-muted-foreground text-center`}>
          {hasSearchQuery
            ? `No stores found matching "${debouncedFilterQuery}"`
            : "No recent stores found. Start searching for stores to track"}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={tw`bg-background flex-1 pb-0`}>
      {/* Header */}
      <View
        style={tw`flex flex-row bg-background items-center border-border shadow py-4 px-2 mb-4`}
      >
        {/* back button */}
        <View style={tw``}>
          {canGoBack() && <HeaderBackButton onPress={goBack} />}
        </View>

        <Text style={tw`text-xl font-bold`}>Find Stores</Text>
      </View>

      <View style={tw`flex-1`}>
        <View style={tw`flex-row items-center relative`}>
          <TextInput
            ref={searchInputRef}
            autoCorrect={false}
            style={tw`flex-1 h-[44px] rounded-lg bg-input p-[12px] pr-[32px] text-[16px] mx-2 my-2`}
            placeholderTextColor={tw.color("muted-foreground")}
            placeholder="Search stores..."
            value={filterQuery}
            onChangeText={setFilterQuery}
            clearButtonMode={status === "pending" ? "never" : "while-editing"}
            returnKeyType="search"
          />
          <View style={tw`absolute right-4 justify-end flex flex-row gap-2`}>
            {isRefetching ? <ActivityIndicator size="small" /> : null}
            {filterQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setFilterQuery("")} hitSlop={10}>
                <AntDesign name="close" size={20} color="gray" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        <FlatList
          keyboardShouldPersistTaps="always"
          data={displayData}
          renderItem={renderStoreItem}
          keyExtractor={storeKey}
          ListHeaderComponent={
            <View style={tw`flex gap-2 my-4 px-2`}>
              <Text style={tw`text-muted-foreground`}>
                {selectedStoreCount} stores selected
              </Text>
              {!hasSearchQuery && (
                <Text
                  style={tw`text-muted-foreground text-lg mt-2 font-medium`}
                >
                  Recently updated stores
                </Text>
              )}
            </View>
          }
          ListEmptyComponent={EmptyList}
          contentContainerStyle={tw`flex-grow px-2`}
        />
      </View>
    </SafeAreaView>
  );
}

function renderStoreItem({ item }: { item: Store }) {
  return <StoreItemRow item={item} />;
}

const StoreItemRow = memo(_StoreItemRow);
function _StoreItemRow({ item }: { item: Store }) {
  const store = useStoreRef();
  const isSelected = useStore((s) => s.selectedStores.has(storeKey(item)));
  return (
    <TouchableOpacity
      style={tw`bg-card mx-1 border border-border rounded-lg p-4 mt-1 mb-3 shadow-sm flex-row items-center gap-4`}
      onPress={() => {
        Keyboard.dismiss();
        const state = store.getSnapshot();
        const key = storeKey(item);
        if (state.selectedStores.has(key)) {
          store.removeSelectedStore(key);
          return;
        }
        store.addSelectedStore({
          ...item,
          key,
        });
      }}
    >
      <RetailerIcon retailer={item.retailer} />
      <View style={tw`flex-1`}>
        <Text style={tw`font-bold`}>{item.name}</Text>
        <Text style={tw`text-sm text-muted-foreground`}>
          {item.lastSyncedAt ? (
            <>
              Last synced {formatDistanceToNow(new Date(item.lastSyncedAt))} ago
            </>
          ) : (
            <>Not synced</>
          )}
        </Text>
      </View>

      <View style={tw`flex-row items-center gap-2 p-2`}>
        {isSelected ? (
          <AntDesign
            name="checkcircle"
            size={20}
            style={tw`text-muted-foreground rounded-full p-1`}
          />
        ) : (
          <Entypo
            name="circle"
            size={20}
            style={tw`text-muted-foreground rounded-full p-1`}
          />
        )}
      </View>
    </TouchableOpacity>
  );
}
