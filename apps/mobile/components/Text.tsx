import tw from "@/tw";
import { PropsWithChildren } from "react";
import { Text as RNText, StyleProp, TextStyle } from "react-native";

export function Text(
  props: PropsWithChildren<{
    style?: StyleProp<TextStyle>;
    h1?: boolean;
    h2?: boolean;
    h3?: boolean;
  }>
) {
  return (
    <RNText
      style={[
        props.h1
          ? tw`text-4xl`
          : props.h2
            ? tw`text-2xl`
            : props.h3
              ? tw`text-xl`
              : tw`text-base`,
        props.style,
      ]}
    >
      {props.children}
    </RNText>
  );
}
