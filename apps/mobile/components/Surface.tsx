import tw from "@/tw";
import { PropsWithChildren } from "react";
import {
  GestureResponderEvent,
  Pressable,
  StyleProp,
  View,
  ViewStyle,
} from "react-native";

export function Surface(
  props: PropsWithChildren<{
    depth?: 1 | 2 | 3;
    style?: StyleProp<ViewStyle>;
    onPress?: (event: GestureResponderEvent) => void;
  }>
) {
  const depth = props.depth ?? 1;
  let cls = `surface surface-${depth} p-3 rounded-lg`;
  if (depth === 1) {
    cls += " shadow-sm";
  }

  if (props.onPress) {
    return (
      <Pressable
        style={[props.style, tw`${cls} surface-${depth}-pressable`]}
        onPress={props.onPress}
      >
        {props.children}
      </Pressable>
    );
  }

  return <View style={[tw`${cls}`, props.style]}>{props.children}</View>;
}
