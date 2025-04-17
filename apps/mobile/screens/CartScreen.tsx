import { List } from "@/db";
import { useStore, useStoreRef } from "@/store";
import tw from "@/tw";
import { useNavigation } from "@react-navigation/native";
import { Image, Platform, Pressable, Text, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Swipeable } from "react-native-gesture-handler";
import { useRef, useCallback } from "react";

const HEADER_HEIGHT = 60;

type ListItem = List["items"][number];

export default function CartScreen() {
  const list = useStore((st) => st.getActiveList());
  const insets = useSafeAreaInsets();

  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
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

  return (
    <View
      style={[
        tw`bg-background flex-1`,
        {
          paddingTop: insets.top,
        },
      ]}
    >
      {/* Header */}
      <Animated.View
        style={[
          tw`flex flex-col gap-4 p-4 pb-2 bg-background border-border`,
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
        <View style={tw`flex flex-row items-center justify-between mb-2`}>
          <Text style={tw`text-xl font-bold`}>My List</Text>
        </View>
      </Animated.View>

      <View style={tw`flex-1`}>
        <Animated.FlatList
          onScroll={scrollHandler}
          keyboardShouldPersistTaps="always"
          data={list?.items ?? []}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={EmptyList}
          contentContainerStyle={tw`flex-grow`}
          ItemSeparatorComponent={() => <View style={tw`h-2`} />}
          keyExtractor={(x) => x.productId}
          renderItem={({ item }) => <ProductItemRow item={item} />}
          style={tw`flex-1`}
        />
      </View>
    </View>
  );
}

const IMAGE_HEIGHT = 100;
const IMAGE_WIDTH = 100;
function ProductItemRow({ item }: { item: ListItem }) {
  const { navigate } = useNavigation();
  // const qty = useStore((s) => s.getProductQty(item.productId));
  const store = useStoreRef();

  // Add ref to close swipeable
  const swipeableRef = useRef<Swipeable>(null);

  const handleDelete = useCallback(() => {
    store.setProductQty(item.productId, 0, item);
    swipeableRef.current?.close();
  }, [item.productId, store]);

  const renderRightActions = useCallback(() => {
    return (
      <Pressable
        onPress={handleDelete}
        style={tw`bg-destructive w-20 h-full justify-center items-center my-2`}
      >
        <Text style={tw`text-destructive-foreground font-medium`}>Remove</Text>
      </Pressable>
    );
  }, [handleDelete]);

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
    >
      <View style={tw`bg-background pl-4 pr-4`}>
        <Pressable
          style={tw`flex flex-row gap-2`}
          onPress={() => {
            navigate("Tabs", {
              screen: "Lists",
              params: {
                screen: "ProductDetails",
                params: { id: item.productId },
              },
            });
          }}
        >
          {/* image */}
          <View
            style={[
              tw`bg-card border border-border p-2 rounded-lg shadow`,
              {
                height: IMAGE_HEIGHT,
                width: IMAGE_WIDTH,
              },
            ]}
          >
            {item.imageUrl ? (
              <Image
                source={{ uri: item.imageUrl }}
                style={tw`w-full h-full`}
                resizeMode="contain"
              />
            ) : null}
          </View>

          <View style={tw`flex-1`}>
            <Text style={tw`text-base font-medium`}>{item.title}</Text>
            <Text style={tw`text-sm text-muted-foreground`}>
              {item.quantity} x
            </Text>
          </View>
        </Pressable>
      </View>
    </Swipeable>
  );
}

function ListHeader() {
  const count = useStore((st) => st.getActiveListCount());
  if (count === 0) return null;
  return (
    <Text style={tw`text-sm text-muted-foreground mb-4 px-4`}>
      {count} items in list
    </Text>
  );
}

function EmptyList() {
  return (
    <View style={tw`flex-1 justify-center items-center p-6 px-4`}>
      <Text style={tw`text-xl font-bold text-foreground mb-2`}>
        No items in list
      </Text>

      <Text style={tw`text-muted-foreground text-center`}>
        Add items to your list by scanning products or searching for them.
      </Text>
    </View>
  );
}
