import { MyButton } from "@/components/Button";
import { useStore } from "@/store";
import { useTrpcClient } from "@/trpc/context";
import tw from "@/tw";
import AntDesign from "@expo/vector-icons/AntDesign";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarcodeScanningResult,
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Linking, Pressable, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

export default function BarcodeScannerScreen() {
  // Permission handling
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scannedCode, setScannedCode] = useState<string>("");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [barcodeLocation, setBarcodeLocation] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const { navigate } = useNavigation();

  const [showNotFound, setShowNotFound] = useState(false);

  // Add animation value for scanner line
  const scanLinePosition = useSharedValue(0);

  const { selectedStores } = useStore((s) => ({
    selectedStores: s.getSelectedStores(),
  }));

  // load product info
  const trpc = useTrpcClient();
  const client = useQueryClient();

  function loadProductInfo(barcode: string) {
    return client.fetchQuery({
      queryKey: ["product", barcode, selectedStores.map((s) => s.key)],
      queryFn: () =>
        trpc.productInfo.query({
          productId: barcode,
          stores: selectedStores.map((s) => s.key),
        }),
    });
  }

  const resumeScanning = useCallback(() => {
    setScannedCode("");
    setIsPaused(false);
    setBarcodeLocation(null);
    setShowNotFound(false);

    // Reset the animation value first
    scanLinePosition.value = 0;

    // Small delay before starting animation
    setTimeout(() => {
      // Update animation to only move between the corner markers
      scanLinePosition.value = withRepeat(
        withTiming(1, { duration: 1000 }),
        -1,
        true
      );
    }, 100);
    cameraRef.current?.resumePreview();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setTimeout(() => {
        resumeScanning();
        requestPermission();

        // reset timeout ref
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      });

      return () => {
        scanLinePosition.value = 0;
        cancelAnimation(scanLinePosition);
      };
    }, [resumeScanning])
  );

  const requestPermission = async () => {
    await requestCameraPermission();
  };

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (!result.data) {
      return;
    }

    // set the scanned code
    setScannedCode(result.data);

    // get center location
    // TODO this is not really working too well... luckily it's only cosmetic
    //      and not a functional requirement... so, whatever.
    const center = {
      x: result.bounds.origin.x + result.bounds.size.width / 2,
      y: result.bounds.origin.y + result.bounds.size.height / 2,
    };

    // set the barcode location
    // XXX no idea why, but we need to swap x and y
    setBarcodeLocation({
      x: center.y,
      y: center.x,
    });

    // pause camera preview
    cameraRef.current?.pausePreview();

    // pause scanning
    setIsPaused(true);

    // Pause scan line animation
    cancelAnimation(scanLinePosition);

    // reset timeout ref
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // wait for a bit, then clear the scanned code and resume scanning
    timeoutRef.current = setTimeout(() => {
      // XXX before we had it auto resume; this timeout code could be removed.
      // resumeScanning();
    }, 5000);

    // load product info
    loadProductInfo(result.data).then((data) => {
      console.log(result);
      if (data == null) {
        setShowNotFound(true);
        return;
      }

      // navigate to product details
      navigate("Tabs", {
        screen: "Shopping",
        params: {
          screen: "ProductDetails",
          params: {
            id: data.id,
          },
        },
      });
    });
  };

  const vh = useSharedValue(0);
  const scanLineContainerRef = useRef<View>();

  // Animated style for the scanning line
  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [
      {
        // Make the scan line move only within 80% of the screen height
        // This ensures it stays within corners regardless of device size
        translateY: scanLinePosition.value * vh.value,
      },
    ],
  }));

  const showNotFoundRef = useRef(showNotFound);
  useEffect(() => {
    showNotFoundRef.current = showNotFound;
  }, [showNotFound]);

  // Add back button handler
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (showNotFoundRef.current) {
          resumeScanning();
          setShowNotFound(false);
          return true; // Prevent default back action
        }
        return false; // Allow default back action
      }
    );

    return () => backHandler.remove();
  }, [resumeScanning]);

  if (showNotFound) {
    return (
      <View style={tw`flex-1 items-center justify-center p-4 bg-background`}>
        <AntDesign
          name="exclamationcircleo"
          size={64}
          color={tw.color("text-foreground")}
        />

        <Text style={tw`text-xl text-center mb-4 text-foreground mt-4`}>
          Product not found
        </Text>
        <View style={tw`flex-row gap-2 mb-8`}>
          <Text style={tw`text-center text-foreground`}>
            This product is not available in any carried by any of our supported
            retailers.
          </Text>
        </View>
        <MyButton size="lg" onPress={resumeScanning}>
          Try Again
        </MyButton>

        {/* Scanned code display */}
        {scannedCode ? (
          <View
            style={tw`p-2 rounded-lg absolute bottom-[16] left-16 right-16 flex items-center justify-center`}
          >
            <Text style={tw`text-muted-foreground text-center`}>
              Barcode:{"\n"}
              {scannedCode}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (!cameraPermission?.granted) {
    return (
      <View style={tw`flex-1 items-center justify-center p-4 bg-background`}>
        <Text style={tw`text-lg text-center mb-4 text-foreground`}>
          {cameraPermission?.canAskAgain
            ? "Camera permission is required to scan barcodes"
            : "Camera permission was denied. Please enable it in your device settings to use the scanner."}
        </Text>
        <Pressable
          onPress={
            cameraPermission?.canAskAgain
              ? requestPermission
              : () => {
                  Linking.openSettings();
                }
          }
          style={tw`bg-primary px-6 py-3 rounded-lg`}
        >
          <Text style={tw`text-primary-foreground font-medium`}>
            {cameraPermission?.canAskAgain
              ? "Grant Camera Access"
              : "Open Settings"}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Animated.View style={tw`flex-1`}>
      <CameraView
        ref={cameraRef}
        style={tw`absolute top-0 left-0 right-0 bottom-0`}
        facing="back"
        mode="picture"
        barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "ean8"] }}
        onBarcodeScanned={isPaused ? undefined : handleBarcodeScanned}
      />

      {/* wechat-style scanning interface */}
      <View style={tw`absolute p-8 top-0 left-0 right-0 bottom-0`}>
        <View
          style={tw`absolute h-full w-full relative top-0 left-0 right-0 bottom-0`}
          ref={(el) => {
            scanLineContainerRef.current = el ?? undefined;
            if (el) {
              el.measure((x, y, width, height) => {
                vh.value = height;
              });
            }
          }}
        >
          {/* Corner markers */}
          <View
            style={tw`absolute top-0 left-0 h-8 w-8 border-l-4 border-t-4 border-green-400 shadow-lg shadow-green-400`}
          />
          <View
            style={tw`absolute top-0 right-0 h-8 w-8 border-r-4 border-t-4 border-green-400 shadow-lg shadow-green-400`}
          />
          <View
            style={tw`absolute bottom-0 left-0 h-8 w-8 border-l-4 border-b-4 border-green-400 shadow-lg shadow-green-400`}
          />
          <View
            style={tw`absolute bottom-0 right-0 h-8 w-8 border-r-4 border-b-4 border-green-400 shadow-lg shadow-green-400`}
          />

          {/* Scanning line - only show when not paused */}
          {!isPaused && (
            <Animated.View
              style={[
                tw`absolute w-full h-0.5 bg-green-400 shadow-lg shadow-green-400`,
                scanLineStyle,
                {
                  shadowColor: "#4ade80",
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.8,
                  shadowRadius: 8,
                  elevation: 5,
                },
              ]}
            />
          )}
        </View>

        {/* Barcode detection indicator */}
        {barcodeLocation && (
          <Animated.View
            entering={FadeIn}
            exiting={FadeOut}
            style={[
              tw`absolute rounded-full bg-green-400`,
              {
                left: barcodeLocation.x - 8,
                top: barcodeLocation.y - 8,
                width: 16,
                height: 16,
                shadowColor: "#4ade80",
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 8,
                elevation: 5,
              },
            ]}
          />
        )}

        {/* Scanned code display */}
        {scannedCode ? (
          <View
            style={tw`bg-black/20 p-2 rounded-lg absolute bottom-[16] left-16 right-16 flex items-center justify-center`}
          >
            <Text style={tw`text-white`}>Scanned: {scannedCode}</Text>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}
