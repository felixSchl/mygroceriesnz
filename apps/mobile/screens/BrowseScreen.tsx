import { BrowseHeader } from "@/components/BrowseHeader";
import { MyButton } from "@/components/Button";
import { ProductCard } from "@/components/ProductCard";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { Text } from "@/components/Text";
import { useStore } from "@/store";
import tw from "@/tw";
import AntDesign from "@expo/vector-icons/AntDesign";
import { useNavigation } from "@react-navigation/native";
import { useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { FlatList } from "react-native-gesture-handler";

export default function HomeScreen({}) {
  const navigation = useNavigation();
  const [
    searchResults,
    searchStatus,
    selectedStoreCount,
    useLocationInSearch,
    hasLocation,
  ] = useStore((s) => [
    s.searchResults,
    s.searchStatus,
    s.getSelectedStoreCount(),
    s.useLocationInSearch,
    s.location != null,
  ]);

  const flatlist = useRef<FlatList>(null);
  const header = useRef<BrowseHeader>(null);

  // TODO implement refresh
  return (
    <View style={tw`flex-1`}>
      <BrowseHeader flatlist={flatlist} ref={header} />

      <FlatList
        ref={flatlist}
        contentContainerStyle={tw`py-4`}
        data={searchResults}
        style={tw`px-2`}
        onEndReached={() => header.current?.nextPage()}
        onEndReachedThreshold={0.8}
        ListFooterComponent={() => {
          if (searchStatus === "refetching") {
            return (
              <ActivityIndicator
                size="large"
                color={tw.color("primary")}
                style={tw`my-4`}
              />
            );
          }
          return null;
        }}
        ListEmptyComponent={() => {
          if (selectedStoreCount === 0 && !useLocationInSearch) {
            return (
              <View style={tw`flex-1 justify-center items-center px-6 mt-20`}>
                <View style={tw`rounded-full bg-muted p-4 mb-4`}>
                  {/* TODO add icon */}
                </View>
                <Text style={tw`text-xl font-semibold text-center mb-2`}>
                  No Stores Selected
                </Text>
                <Text style={tw`text-center text-muted-foreground mb-8`}>
                  Select your favorite stores to start browsing their products
                  and deals
                </Text>
                <MyButton
                  size="lg"
                  onPress={() => navigation.navigate("StoreFinder")}
                  icon={
                    <AntDesign
                      name="search1"
                      size={18}
                      color={tw.color("primary-foreground")}
                    />
                  }
                >
                  Find Stores
                </MyButton>
              </View>
            );
          }

          return (
            <View>
              {searchStatus === "pending" ? (
                <SkeletonLoader />
              ) : searchStatus === "error" ? (
                <Text style={tw`text-center text-gray-500`}>
                  Something went wrong
                </Text>
              ) : (
                <Text style={tw`text-center text-gray-500`}>
                  No results found
                </Text>
              )}
            </View>
          );
        }}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={tw`h-2`} />}
        renderItem={({ item }) => <ProductCard item={item} />}
      />
    </View>
  );
}
