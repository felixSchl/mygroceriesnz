import { View, Text, Linking, Pressable } from "react-native";
import tw from "@/tw";
import { Image } from "expo-image";
import Constants from "expo-constants";
import { MyButton } from "@/components/Button";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { Asset, useAssets } from "expo-asset";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function MoreScreen() {
  const handleDiscordPress = () => {
    Linking.openURL("https://discord.gg/SkdC3GCfdx");
  };

  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        tw`flex-1 bg-background p-4`,
        {
          paddingTop: insets.top + 16,
        },
      ]}
    >
      <View style={tw`flex flex-row gap-2`}>
        <Text style={tw`text-2xl font-bold mb-3`}>MyGroceries</Text>
        {/* alpha badge */}
        <View>
          <View style={tw`bg-gray-300 rounded-lg px-2 py-1`}>
            <Text style={tw`text-xs text-black font-bold`}>Alpha</Text>
          </View>
        </View>
      </View>

      <Text style={tw`text-sm text-muted-foreground mb-8`}>
        Compare prices across New Zealand's leading supermarkets and find the
        best deals.
      </Text>

      <View style={tw`mb-8`}>
        {/* Info Section */}
        <View style={tw`py-4 rounded-lg bg-card gap-2 flex`}>
          <View style={tw`flex-row justify-between`}>
            <Text style={tw`text-sm text-muted-foreground`}>Developed by</Text>
            <Pressable
              onPress={() => Linking.openURL("https://www.felixschlitter.dev")}
            >
              <Text style={tw`text-sm text-blue-500 font-bold`}>
                Felix Schlitter
              </Text>
            </Pressable>
          </View>

          <View style={tw`flex-row justify-between`}>
            <Text style={tw`text-sm text-muted-foreground`}>Status</Text>
            <Text style={tw`text-sm text-foreground`}>Alpha</Text>
          </View>

          <View style={tw`flex-row justify-between`}>
            <Text style={tw`text-sm text-muted-foreground`}>Version</Text>
            <Text style={tw`text-sm text-foreground`}>
              {Constants.expoConfig?.version ?? "1.0.0"}
            </Text>
          </View>
        </View>
      </View>

      {/* Discord Section */}
      <MyButton
        onPress={handleDiscordPress}
        style={tw`mb-4`}
        iconRight={
          <FontAwesome6
            name="discord"
            size={22}
            color={tw.color("primary-foreground")}
          />
        }
      >
        Join our Discord community
      </MyButton>
    </View>
  );
}
