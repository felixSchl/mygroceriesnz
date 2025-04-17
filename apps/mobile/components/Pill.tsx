import { View } from "react-native";
import { Text } from "./Text";
import tw from "@/tw";

export function Pill(props: { label: string }) {
  return (
    <View style={tw`bg-blue-600 rounded-full p-1 px-3`}>
      <Text style={tw`text-gray-100`}>{props.label}</Text>
    </View>
  );
}
