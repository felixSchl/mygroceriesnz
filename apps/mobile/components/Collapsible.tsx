import { PropsWithChildren, useCallback, useEffect, useState } from "react";
import { LayoutChangeEvent } from "react-native";
import Animated, { useSharedValue } from "react-native-reanimated";

export function Collapsible(props: PropsWithChildren<{ collapsed?: boolean }>) {
  const collapsed = props.collapsed ?? true;
  const [measuredHeight, setMeasuredHeight] = useState<number>(0);
  const height = useSharedValue(measuredHeight);

  useEffect(() => {
    height.value = collapsed ? 0 : measuredHeight;
  }, [collapsed, measuredHeight, height]);

  const handleLayoutChange = useCallback((event: LayoutChangeEvent) => {
    setMeasuredHeight(event.nativeEvent.layout.height);
  }, []);

  const style = {
    overflow: "hidden",
    height: measuredHeight,
  } as const;

  const contentStyle = {
    height,
  } as const;

  return (
    <Animated.View style={style} pointerEvents={collapsed ? "none" : "auto"}>
      <Animated.View style={contentStyle} onLayout={handleLayoutChange}>
        {props.children}
      </Animated.View>
    </Animated.View>
  );
}
