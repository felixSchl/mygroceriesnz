import { useEffect, useRef } from "react";
import { View, Animated } from "react-native";
import tw from "@/tw";

export function SkeletonLoader() {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );

    pulse.start();
    return () => pulse.stop();
  }, []);

  const opacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });

  return (
    <>
      {[1, 2, 3].map((i) => (
        <Animated.View
          key={i}
          style={[
            tw`p-4 border border-gray-300 rounded mb-2 bg-gray-100`,
            { opacity },
          ]}
        >
          <View style={tw`h-[240px] bg-gray-200 rounded`} />
        </Animated.View>
      ))}
    </>
  );
}
