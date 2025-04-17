import { ListEntry } from "@/db/schema";
import { useStore, useStoreRef } from "@/store";
import tw from "@/tw";
import AntDesign from "@expo/vector-icons/AntDesign";
import { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { MyButton } from "../components/Button";

export const AddToCartButton = memo(_AddToCartButton);
function _AddToCartButton({
  productId,
  meta,
}: {
  productId: string;
  meta: Pick<ListEntry, "imageUrl" | "title">;
}) {
  const store = useStoreRef();
  const selectedStoreCount = useStore((s) => s.getSelectedStoreCount());
  const qty = useStore((s) => s.getProductQty(productId));

  return (
    <View style={tw`flex gap-4`}>
      {/* qty adjustment */}
      {qty > 0 ? (
        <View style={tw`flex flex-row`}>
          <TouchableOpacity
            style={tw`w-8 h-10 bg-gray-200 rounded-l-full items-center justify-center`}
            hitSlop={10}
            onPress={(e) => {
              e.preventDefault();
              const st = store.getSnapshot();
              const qty = st.getProductQty(productId);
              if (qty > 1) {
                store.setProductQty(productId, qty - 1, meta);
                return;
              }
              store.setProductQty(productId, 0, meta);
            }}
          >
            <Text style={tw`text-lg font-semibold text-gray-700`}>-</Text>
          </TouchableOpacity>

          <View
            style={tw`w-12 h-10 bg-gray-100/40 items-center justify-center flex-1 border-t border-b border-border`}
          >
            <Text style={tw`text-base font-medium`}>{qty}</Text>
          </View>

          <TouchableOpacity
            hitSlop={10}
            style={tw`w-8 h-10 bg-gray-200 rounded-r-full items-center justify-center`}
            onPress={(e) => {
              e.preventDefault();
              const st = store.getSnapshot();
              const qty = st.getProductQty(productId);
              store.setProductQty(productId, qty + 1, meta);
            }}
          >
            <Text style={tw`text-lg font-semibold text-gray-700`}>+</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <MyButton
        variant={
          selectedStoreCount === 0 ? "outline" : qty > 0 ? "ghost" : "outline"
        }
        size={qty > 0 ? "sm" : "lg"}
        labelStyle={qty > 0 ? tw`text-destructive` : undefined}
        icon={
          qty > 0 ? undefined : (
            <AntDesign
              name="plus"
              size={20}
              style={
                selectedStoreCount === 0
                  ? tw`text-foreground`
                  : tw`text-primary-foreground`
              }
            />
          )
        }
        onPress={() => {
          if (qty > 0) {
            store.setProductQty(productId, 0, meta);
          } else {
            store.setProductQty(productId, 1, meta);
          }
        }}
      >
        {qty > 0 ? "Remove" : "Add to List"}
      </MyButton>
    </View>
  );
}
