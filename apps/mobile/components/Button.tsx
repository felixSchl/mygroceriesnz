import tw from "@/tw";
import { PropsWithChildren, ReactNode } from "react";
import { StyleProp, Text, TouchableOpacity, ViewStyle } from "react-native";

export type Variant = "primary" | "outline" | "destructive" | "ghost";

const pressableStyles = {
  primary: tw`bg-primary`,
  outline: tw`border border-input bg-background shadow-sm`,
  destructive: tw`bg-destructive shadow-sm`,
  ghost: {},
} as const;

const sizeStyles = {
  default: tw`h-10 px-4 py-1`,
  sm: tw`h-9 rounded-md px-3 text-xs py-1`,
  lg: tw`h-10 rounded-md px-8 py-2`,
  icon: tw`h-9 w-9 p-0`,
} as const;

const labelStyles = {
  primary: tw`text-primary-foreground font-bold`,
  outline: tw`text-primary font-bold`,
  destructive: tw`text-destructive-foreground font-bold`,
  ghost: {},
} as const;

const labelSizeStyles = {
  default: tw`text-sm`,
  sm: tw`text-sm`,
  lg: tw`text-base`,
  icon: tw`text-base`,
} as const;

export function MyButton(
  props: PropsWithChildren<{
    variant?: Variant;
    icon?: ReactNode;
    iconRight?: ReactNode;
    label?: string;
    size?: "default" | "sm" | "lg" | "icon";
    onPress?: () => void;
    style?: StyleProp<ViewStyle>;
    labelStyle?: StyleProp<ViewStyle>;
  }>
) {
  const variant = props.variant ?? "primary";
  const size = props.size ?? "default";
  return (
    <TouchableOpacity
      onPress={props.onPress}
      style={[
        tw`px-4 py-2 items-center justify-center rounded-md flex-row gap-2`,
        pressableStyles[variant],
        sizeStyles[size],
        props.style,
      ]}
    >
      {props.icon}
      <Text
        style={[
          tw`text-center uppercase font-bold text-sm`,
          labelStyles[variant],
          labelSizeStyles[size],
          props.labelStyle,
        ]}
      >
        {props.children ?? props.label ?? ""}
      </Text>
      {props.iconRight}
    </TouchableOpacity>
  );
}
