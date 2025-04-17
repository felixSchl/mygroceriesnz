import { useStore, useStoreRef } from "@/store";
import tw from "@/tw";
import AntDesign from "@expo/vector-icons/AntDesign";
import { useNavigation } from "@react-navigation/native";
import { SearchHit } from "@repo/backend/trpc";
import { Row, xformRows } from "@repo/shared";
import { memo } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  Text,
  View,
} from "react-native";
import { AddToCartButton } from "./AddToCartButton";
import { RetailerIcon } from "./RetailerIcon";
import deepEqual from "deep-equal";

const IMAGE_WIDTH = 120;
const IMAGE_HEIGHT = 120;

export const ProductCard = memo(_ProductCard);
function _ProductCard({ item }: { item: SearchHit }) {
  const { navigate } = useNavigation();
  const selectedStores = useStore((x) => x.getSelectedStores());

  const { rows, status } = useStore((st) => {
    const prices = st.getPrices(item.id, /* stale: */ true) ?? [];
    const rows = xformRows({ prices }, selectedStores).filter(
      (x) =>
        // on the product card, we only want to show stores that have price data
        x.priceData !== null
    );
    return {
      rows,
      status: st.getPriceStatus(item.id),
    };
  }, deepEqual);

  return (
    <Pressable
      style={tw`p-4 border border-border rounded flex bg-card shadow-sm`}
      onPress={() => {
        Keyboard.dismiss();
        navigate("Tabs", {
          screen: "Shopping",
          params: {
            screen: "ProductDetails",
            params: {
              id: item.id,
            },
          },
        });
      }}
    >
      <View style={tw`flex-row mb-2 gap-x-3`}>
        {/* Image Section */}
        {item.image && (
          <View
            style={[
              tw`mb-2 bg-card border border-border p-2 rounded-lg shadow w-full`,
              {
                height: IMAGE_HEIGHT,
                width: IMAGE_WIDTH,
              },
            ]}
          >
            <Image
              source={{ uri: item.image }}
              style={tw`w-full h-full mx-auto max-w-[200px] `}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Content Section */}
        <View style={tw`flex-1 flex-col`}>
          {/* Brand and Title Section */}
          <View style={tw`flex-col gap-1 mb-2`}>
            <Text style={tw`text-sm font-bold text-gray-500`}>
              {item.brand}
            </Text>
            <Text style={tw`text-lg font-bold capitalize`}>{item.title}</Text>
          </View>
        </View>
      </View>

      {/* prices */}
      {rows.length === 0 && status === "loading" ? (
        <View style={tw`flex-row items-center gap-2`}>
          <ActivityIndicator size="small" color={tw.color("primary")} />
          <Text style={tw`text-sm text-muted-foreground`}>
            Loading Prices...
          </Text>
        </View>
      ) : (
        rows.map((row, index) => {
          return renderStoreItem({
            item: row,
            isLast: index === rows.length - 1,
          });
        })
      )}

      {/* add to cart */}
      <View style={tw`mt-4 mb-3`}>
        <AddToCartButton
          productId={item.id}
          meta={{
            title: item.title ?? "Untitled",
            imageUrl: item.image,
          }}
        />
      </View>
    </Pressable>
  );
}

function renderStoreItem({
  item: row,
  isLast,
}: {
  item: Row;
  isLast: boolean;
}) {
  return (
    <View
      key={row.key}
      style={[
        tw`flex flex-row w-full items-start py-2 bg-background gap-2`,
        isLast ? {} : tw`border-b border-border`,
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
                  row.priceData.salePrice || row.priceData.clubPrice
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
