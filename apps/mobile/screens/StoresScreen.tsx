import { MyButton } from "@/components/Button";
import { RetailerIcon } from "@/components/RetailerIcon";
import { useStore, useStoreRef } from "@/store";
import tw from "@/tw";
import AntDesign from "@expo/vector-icons/AntDesign";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { formatStoreId, Retailer } from "@repo/db/codecs";
import { formatDistanceToNow } from "date-fns";
import * as Location from "expo-location";
import { memo, useCallback, useRef } from "react";
import {
  FlatList,
  Linking,
  Pressable,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Store = {
  id: string;
  retailer: Retailer;
  name: string;
  lastSyncedAt?: string | null;
};

function storeKey(store: Pick<Store, "retailer" | "id">) {
  return formatStoreId(store.retailer, store.id);
}

export default function StoreFinderScreen() {
  const store = useStoreRef();
  const navigation = useNavigation();
  const selectedStoresArray = useStore((s) => s.getSelectedStores());
  const insets = useSafeAreaInsets();
  const isLocationDenied = useStore((s) => !s.locationGranted);
  const canAskAgain = useStore((s) => s.locationCanAskAgain);
  const useLocationInSearch = useStore((s) => s.useLocationInSearch);

  useFocusEffect(
    useCallback(() => {
      // recheck location permission
      void (async () => {
        const loc = await Location.getForegroundPermissionsAsync();
        store.mutate((draft) => {
          draft.locationGranted = loc.granted;
          draft.locationCanAskAgain = loc.canAskAgain;
        });
      })();
    }, [])
  );

  return (
    <View style={[tw`bg-background flex-1 pb-0`, { paddingTop: insets.top }]}>
      {/* Header */}
      <View
        style={tw`flex flex-row items-center justify-between mt-3 mb-3 px-4`}
      >
        <Text style={tw`text-xl font-bold`}>My Stores</Text>
      </View>

      <View style={tw`px-4 mt-4 flex flex-row items-center justify-between`}>
        <Text style={tw`text-lg font-bold`}>Use Location</Text>
      </View>

      <View
        style={tw`px-4 mt-2 mb-3 flex flex-row items-center justify-between gap-4`}
      >
        <View style={tw`flex-1`}>
          <Text style={tw`text-sm text-muted-foreground`}>
            Use your current location to automatically include stores near you.
          </Text>
        </View>

        {/* toggle */}
        <Switch
          value={useLocationInSearch}
          onValueChange={(v) => {
            store.setUseLocationInSearch(v);

            // recheck location permission
            void (async () => {
              if (!v) return;
              console.log("requesting location permission");
              try {
                const loc = await Location.requestForegroundPermissionsAsync();
                store.mutate((draft) => {
                  draft.locationGranted = loc.granted;
                  draft.locationCanAskAgain = loc.canAskAgain;
                });
              } catch (e) {
                console.error("Error requesting location permission", e);
              }
            })();
          }}
        />
      </View>

      {isLocationDenied ? (
        <View style={tw`px-4 flex`}>
          {canAskAgain ? (
            <View style={tw`gap-2 mt-2`}>
              <MyButton
                variant="outline"
                size="default"
                style={tw`px-0`}
                labelStyle={tw`text-blue-500`}
                onPress={() => {
                  Location.requestForegroundPermissionsAsync();
                }}
              >
                Enable Location
              </MyButton>
            </View>
          ) : (
            <View style={tw`gap-2 mt-2`}>
              <View style={tw`flex-row items-center gap-2`}>
                <AntDesign
                  name="exclamationcircle"
                  size={16}
                  style={tw`text-destructive`}
                />
                <Text style={tw`text-sm text-destructive`}>
                  Location is disabled. Please enable it in settings.
                </Text>
              </View>
              <MyButton
                variant="outline"
                size="default"
                style={tw`px-0`}
                labelStyle={tw`text-blue-500`}
                onPress={() => {
                  Linking.openSettings();
                }}
              >
                Enable Location
              </MyButton>
            </View>
          )}
        </View>
      ) : null}

      <View style={tw`px-4 mt-4 flex flex-row items-center justify-between`}>
        <Text style={tw`text-lg font-bold`}>Tracked Stores</Text>
      </View>

      <View
        style={tw`px-4 mt-2 mb-3 flex flex-row items-center justify-between`}
      >
        <Text style={tw`text-sm text-muted-foreground`}>
          Hand-pick additional stores you'd like to track. These stores will
          always be included in your search results irrespective of your current
          location.
        </Text>
      </View>

      <ListHeader />

      <View style={tw`flex-1`}>
        <FlatList
          data={selectedStoresArray}
          renderItem={renderStoreItem}
          keyExtractor={(store) => store.key}
          ItemSeparatorComponent={() => <View style={tw`h-2`} />}
          contentContainerStyle={tw`pb-4`}
          onScroll={({ nativeEvent }) => {
            // only show shadow if the user has scrolled down
            // setIsScrolled(nativeEvent.contentOffset.y > 16);
          }}
          ListEmptyComponent={EmptyList}
          ListFooterComponent={() => {
            return (
              <View style={tw`my-4 px-4`}>
                <MyButton
                  variant="outline"
                  size="default"
                  style={tw`px-0`}
                  // TODO(STYLE) use theme colors
                  labelStyle={tw`text-blue-500`}
                  // icon={<AntDesign name="search1" size={16} style={tw``} />}
                  onPress={() => navigation.navigate("StoreFinder")}
                >
                  Add Store
                </MyButton>
              </View>
            );
          }}
        />
      </View>
    </View>
  );
}

function renderStoreItem({ item }: { item: Store }) {
  return <StoreItemRow item={item} />;
}

const StoreItemRow = memo(_StoreItemRow);
function _StoreItemRow({ item }: { item: Store }) {
  const store = useStoreRef();
  const swipeableRef = useRef<Swipeable>(null);

  useFocusEffect(
    useCallback(() => {
      swipeableRef.current?.close();
      return () => {
        swipeableRef.current?.close();
      };
    }, [])
  );

  const renderRightActions = () => (
    <TouchableOpacity
      style={tw`bg-destructive w-20 justify-center items-center`}
      onPress={() => {
        const key = storeKey(item);
        store.removeSelectedStore(key);
      }}
    >
      <Text style={tw`text-destructive-foreground font-medium`}>Remove</Text>
    </TouchableOpacity>
  );

  return (
    <Swipeable
      renderRightActions={renderRightActions}
      overshootRight={false}
      ref={swipeableRef}
    >
      <Pressable
        style={tw`bg-card border border-border p-4 shadow-sm flex-row items-center gap-4 pl-4`}
      >
        <RetailerIcon retailer={item.retailer} />
        <View style={tw`flex-1`}>
          <Text style={tw`font-bold`}>{item.name}</Text>
          <Text style={tw`text-sm text-muted-foreground`}>
            {item.lastSyncedAt ? (
              <>
                Last synced {formatDistanceToNow(new Date(item.lastSyncedAt))}{" "}
                ago
              </>
            ) : (
              <>Not synced</>
            )}
          </Text>
        </View>
      </Pressable>
    </Swipeable>
  );
}

const ListHeader = memo(_ListHeader);
function _ListHeader() {
  const count = useStore((s) => s.getSelectedStoreCount());
  if (count > 0) {
    return (
      <View
        style={tw`flex gap-2 pb-4 pb-1 bg-background px-4 border-b border-border`}
      >
        <Text style={tw`text-muted-foreground`}>
          {count} {count === 1 ? "store" : "stores"} selected
        </Text>
      </View>
    );
  }
  return null;
}

const EmptyList = memo(_EmptyList);
function _EmptyList() {
  const count = useStore((s) => s.getSelectedStoreCount());
  const { navigate } = useNavigation();
  if (count === 0) {
    return (
      <View style={tw`flex-1 items-center justify-center py-4 bg-foreground/5`}>
        <Text style={tw`text-muted-foreground text-center text-lg mb-4`}>
          No stores selected
        </Text>
        <Text style={tw`text-muted-foreground text-sm text-center`}>
          Get started by adding your first store.
        </Text>
      </View>
    );
  }
  return null;
}
