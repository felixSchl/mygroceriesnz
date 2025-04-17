import { AddToCartButton } from "@/components/AddToCartButton";
import { useStore, useStoreRef } from "@/store";
import { useTrpcClient } from "@/trpc/context";
import tw from "@/tw";
import AntDesign from "@expo/vector-icons/AntDesign";
import { HeaderBackButton } from "@react-navigation/elements";
import {
  StaticScreenProps,
  useFocusEffect,
  useNavigation,
} from "@react-navigation/native";
import { PriceData, ProductData } from "@repo/backend/trpc/router";
import { xformRows, type Row } from "@repo/shared";
import { useQuery } from "@tanstack/react-query";
import * as Location from "expo-location";
import { memo, useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  RefreshControl,
  Text,
  View,
} from "react-native";
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MyButton } from "../components/Button";
import { RetailerIcon } from "../components/RetailerIcon";

const IMAGE_HEIGHT = 200;
const HEADER_HEIGHT = 60;

// ... the safe area insets are wrong when presented modally ...
export function ProductDetailsScreenModal(
  props: StaticScreenProps<{ id: string }>
) {
  return <ProductDetailsScreen {...props} modal />;
}

let isRequestingLocation = false;
let _isReady = false;

export function ProductDetailsScreen(
  props: StaticScreenProps<{ id: string }> & {
    modal?: boolean;
  }
) {
  const trpc = useTrpcClient();
  const { navigate } = useNavigation();
  const store = useStoreRef();
  const scrollY = useSharedValue(0);
  const [isReady, setIsReady] = useState(_isReady);

  // TODO extract this to a hook
  // reload location on focus
  useFocusEffect(
    useCallback(() => {
      const st = store.getSnapshot();
      if (!st.useLocationInSearch) return;
      // TODO confirm expo-location caches location
      (async () => {
        if (isRequestingLocation) return;
        isRequestingLocation = true;
        try {
          console.log("Requesting location...");
          const loc = await Location.getLastKnownPositionAsync();
          store.mutate((draft) => {
            draft.location = loc;
          });
        } catch (e) {
          console.error("Error getting location", e);
        } finally {
          isRequestingLocation = false;
          _isReady = true;
          setIsReady(true);
        }
      })();
    }, [])
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const titleContainerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, HEADER_HEIGHT / 2],
      [0, 1],
      "clamp"
    );
    return {
      opacity,
    };
  });

  const headerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, HEADER_HEIGHT / 2],
      [0, 1],
      "clamp"
    );
    return {
      borderBottomWidth: opacity,
      shadowOpacity: opacity * 0.1, // Adjust shadow intensity as needed
    };
  });

  const selectedStores = useStore((s) => s.getSelectedStores());
  const useLocationInSearch = useStore((s) => s.useLocationInSearch);
  const location = useStore((s) => s.location);

  const {
    data: data1,
    status,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: [
      "product",
      props.route.params.id,
      selectedStores.map((s) => s.key),
    ],
    queryFn: async () => {
      const query = {
        productId: props.route.params.id,
        stores: selectedStores.map((s) => s.key),
        prices: false, // load separately for speedier loading
      } as const;
      return trpc.productInfo.query(query);
    },
    select: (data) => {
      if (!data) return [];
      return [data, xformRows(data, selectedStores)] as const;
    },
  });

  const { data: pricesData1, status: pricesStatus } = useQuery({
    queryKey: [
      "prices",
      props.route.params.id,
      selectedStores.map((s) => s.key),
      useLocationInSearch,
      useLocationInSearch && location?.coords?.latitude,
      useLocationInSearch && location?.coords?.longitude,
    ],
    queryFn: async () => {
      return trpc.getPrices.query({
        productIds: [props.route.params.id],
        stores: selectedStores.map((s) => s.key),
        location:
          useLocationInSearch && location?.coords
            ? {
                lat: location.coords.latitude,
                lng: location.coords.longitude,
              }
            : undefined,
      });
    },
    select: (data) => {
      if (!data) return [];
      return xformRows({ prices: data }, selectedStores);
    },
  });

  const data = data1?.[0];

  // prefer newer data over older data
  const rows = pricesData1 ?? data1?.[1] ?? [];

  const insets = useSafeAreaInsets();

  const insetTop = props.modal ? 0 : insets.top;

  const { goBack: goBackImpl, canGoBack: canGoBackImpl } = useNavigation();

  const goBack = () => {
    if (canGoBackImpl()) {
      goBackImpl();
      return true;
    }
    navigate("Tabs", {
      screen: "Shopping",
      params: {
        screen: "Browse",
      },
    });
    return true;
  };

  const Content = (() => {
    if (status === "pending") {
      return (
        <View style={tw`flex-1 justify-center items-center`}>
          <ActivityIndicator size="large" />
        </View>
      );
    }

    if (!data) {
      return (
        <View style={tw`flex-1 justify-center items-center p-6`}>
          <Text style={tw`text-xl font-bold text-foreground mb-2`}>
            Product Not Found
          </Text>
          <Text style={tw`text-muted-foreground text-center`}>
            We couldn't find the product you're looking for. It might have been
            removed or is no longer available.
          </Text>
        </View>
      );
    }

    return (
      <Animated.FlatList
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              refetch();
            }}
            progressViewOffset={40}
          />
        }
        scrollIndicatorInsets={{ top: HEADER_HEIGHT }}
        onScroll={scrollHandler}
        scrollEventThrottle={1}
        contentContainerStyle={[
          tw`px-4 pb-4`,
          {
            paddingTop: insetTop + HEADER_HEIGHT,
            paddingBottom: insets.bottom + 32,
          },
        ]}
        data={rows}
        keyExtractor={(x) => x.key}
        renderItem={({ item, index }) => (
          <StoreItemRow item={item} isLast={index === rows.length - 1} />
        )}
        ListHeaderComponent={
          <ListHeaderComponent data={data} hasPrices={rows.length > 0} />
        }
        ListEmptyComponent={null}
      />
    );
  })();

  return (
    <View style={[tw`flex flex-1 bg-background`]}>
      {/* header */}
      <Animated.View
        style={[
          tw`absolute w-full z-1 flex bg-background`,
          { paddingTop: insetTop },
        ]}
      >
        <Animated.View
          style={[
            tw`flex flex-row bg-background items-center px-2 border-border`,
            {
              height: HEADER_HEIGHT,
            },
            headerStyle,
            Platform.select({
              ios: {
                shadowOffset: {
                  width: 0,
                  height: 3,
                },
              },
            }),
          ]}
        >
          {/* back button */}
          <View style={tw`absolute left-2`}>
            {<HeaderBackButton onPress={goBack} />}
          </View>

          {/* title */}
          <Animated.View style={[titleContainerStyle, tw`mx-auto`]}>
            <Animated.Text
              numberOfLines={1}
              style={[tw`font-bold text-foreground text-base`]}
            >
              Product Details
            </Animated.Text>
          </Animated.View>
        </Animated.View>
      </Animated.View>

      {Content}
    </View>
  );
}

const StoreItemRow = memo(_StoreItemRow);
function _StoreItemRow({ item: row, isLast }: { item: Row; isLast: boolean }) {
  return (
    <View
      style={[
        tw`flex flex-row w-full items-start py-4 bg-background border-border gap-2`,
        !isLast ? tw`border-b` : "",
      ]}
    >
      <View style={tw`w-[30px]`}>
        <RetailerIcon retailer={row.retailer} />
      </View>

      <View style={tw`flex-1`}>
        <View style={tw`flex items-center flex-row justify-between gap-2`}>
          <Text style={tw`text-foreground font-medium text-md`}>
            {row.storeName}
          </Text>
        </View>
        <View style={tw`flex-row gap-2`}>
          {/* Best price badge */}
          {row.isBestPrice && (
            <View
              style={tw`p-1 rounded-xl px-2 bg-green-400/20 border border-border my-1`}
            >
              <Text style={tw`text-sm text-primary font-medium`}>
                Best Price
              </Text>
            </View>
          )}
          {/* Existing fallback price indicator */}
          {row.fallback && (
            <View
              style={tw`p-1 rounded-xl px-2 bg-muted border border-border my-1`}
            >
              <Text style={tw`text-sm text-muted-foreground`}>Nearby</Text>
            </View>
          )}
        </View>

        {row.priceData ? (
          <View style={tw`mt-1 flex`}>
            <View style={tw`flex flex-row gap-2`}>
              {/* Original price */}
              <Text
                style={tw`${
                  row.priceData.salePrice
                    ? "line-through text-muted-foreground text-sm"
                    : "text-foreground font-bold text-lg"
                }`}
              >
                ${row.priceData.originalPrice.toFixed(2)}
              </Text>

              <View style={tw`flex gap-2`}>
                {/* Sale price */}
                {row.priceData.salePrice && (
                  <View style={tw`flex-row items-center gap-1`}>
                    <Text style={tw`text-lg font-bold text-foreground`}>
                      ${row.priceData.salePrice.toFixed(2)}
                    </Text>
                  </View>
                )}

                {/* Club price */}
                {row.priceData.clubPrice && (
                  <View style={tw`flex-row items-center gap-1`}>
                    <Text style={tw`text-lg font-bold text-foreground`}>
                      ${row.priceData.clubPrice.toFixed(2)}
                    </Text>
                    <AntDesign
                      name="idcard"
                      size={16}
                      style={tw`text-primary`}
                    />
                  </View>
                )}
              </View>
            </View>

            {/* Multi-buy deal */}
            {row.priceData.multiBuy && (
              <Text style={tw`text-sm text-primary mt-1`}>
                {row.priceData.multiBuy.quantity} for $
                {row.priceData.multiBuy.price.toFixed(2)}
              </Text>
            )}
          </View>
        ) : (
          <Text style={tw`text-muted-foreground`}>Not available</Text>
        )}
      </View>
    </View>
  );
}

const ListHeaderComponent = memo(_ListHeaderComponent);
function _ListHeaderComponent({
  data,
  hasPrices,
}: {
  data: ProductData;
  hasPrices: boolean;
}) {
  const { navigate } = useNavigation();
  const selectedStoreCount = useStore((s) => s.getSelectedStoreCount());
  const useLocationInSearch = useStore((s) => s.useLocationInSearch);

  return (
    <View>
      {/* title */}
      <Text
        style={tw`text-foreground font-bold text-2xl mb-8`}
        numberOfLines={2}
      >
        {data.title}
      </Text>

      {/* image */}
      {data.image && (
        <View
          style={[
            tw`mb-2 bg-card border border-border p-2 rounded-lg shadow w-full`,
            {
              height: IMAGE_HEIGHT,
            },
          ]}
        >
          <Image
            source={{ uri: data.image }}
            style={tw`w-full h-full mx-auto max-w-[200px] `}
            resizeMode="contain"
          />
        </View>
      )}

      <View style={tw`mt-4 mb-6`}>
        <Text numberOfLines={2} style={[tw`text-muted-foreground`]}>
          {data.description?.trim() || "No description available"}
        </Text>
      </View>

      {/* add to cart */}
      <View style={tw`mt-4 mb-3`}>
        <AddToCartButton
          productId={data.id}
          meta={{
            title: data.title ?? "Untitled",
            imageUrl: data.image,
          }}
        />
      </View>

      <View style={tw`mt-4 mb-3`}>
        <Text style={tw`text-xl font-semibold text-foreground`}>
          Compare Prices
        </Text>
      </View>

      {selectedStoreCount === 0 && !useLocationInSearch ? (
        <View
          style={tw`py-4 flex gap-2 bg-card border border-border p-4 rounded-lg shadow mt-4`}
        >
          {/* alert triangle */}
          <View style={tw`flex`}>
            <AntDesign
              name="exclamationcircle"
              size={24}
              color="red"
              // TODO why do we need to set the width here? if we don't,
              //      the icon is not centered. no clue.
              style={tw`w-8 mx-auto`}
            />
          </View>
          <Text
            style={[
              tw`text-muted-foreground text-center mb-3 py-2 text-md`,
              {
                fontSize: 16,
              },
            ]}
          >
            No stores selected.{"\n"} Select stores to see prices.
          </Text>
          <MyButton
            variant="primary"
            size="lg"
            style={tw`w-full flex flex-row justify-center items-center`}
            onPress={() => navigate("Tabs", { screen: "Stores" })}
            labelStyle={tw`flex flex-row justify-center items-center`}
            icon={<AntDesign name="search1" size={24} color="white" />}
          >
            Find Stores
          </MyButton>
        </View>
      ) : hasPrices ? (
        <View
          style={tw`py-4 flex gap-4 bg-card border border-border p-4 rounded-lg shadow mt-4`}
        >
          <Text style={tw`text-muted-foreground py-6 text-center`}>
            No prices available for this product
          </Text>
          <MyButton
            variant="outline"
            size="lg"
            style={tw`w-full`}
            onPress={() => navigate("Tabs", { screen: "Stores" })}
            iconRight={
              <AntDesign
                name="arrowright"
                size={24}
                style={tw`text-muted-foreground`}
              />
            }
          >
            Change Stores
          </MyButton>
        </View>
      ) : null}
    </View>
  );
}
