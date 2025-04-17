import { useReactQueryDevTools } from "@dev-plugins/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import {
  BottomTabBarButtonProps,
  createBottomTabNavigator,
} from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import {
  createStaticNavigation,
  StaticParamList,
  useNavigation,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { AppRouter } from "@repo/backend/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import React, { useEffect } from "react";
import { Platform, StatusBar, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { enableFreeze } from "react-native-screens";
import SuperJSON from "superjson";
import { DBClient } from "./db";
import BrowseScreen from "./screens/BrowseScreen";
import CartScreen from "./screens/CartScreen";
import MoreScreen from "./screens/MoreScreen";
import {
  ProductDetailsScreen,
  ProductDetailsScreenModal,
} from "./screens/ProductDetailsScreen";
import ScanScreen from "./screens/ScanScreen";
import StoreFinderScreen from "./screens/StoreFinderScreen";
import StoresScreen from "./screens/StoresScreen";
import { ShopsterStore, StoreProvider, useStore } from "./store";
import { TrpcProvider } from "./trpc/context";
import tw from "./tw";

enableFreeze(true);

const store = new ShopsterStore(new DBClient("app-v1.db"));

const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      // TODO(PROD) inject
      // url: "http://192.168.219.70:3311/api/trpc",
      url: "https://www.mygroceries.nz/api/trpc",
      transformer: SuperJSON,
    }),
  ],
});

const tabBarOptions = {
  tabBarHideOnKeyboard: true,
  tabBarButton: (props: any) => (
    <PlatformPressable {...props} pressColor="#0000ee33" />
  ),
} as const;

const BrowseStack = createNativeStackNavigator({
  screens: {
    Browse: {
      screen: BrowseScreen,
      options: {
        headerShown: false,
      },
    },
    ProductDetails: {
      screen: ProductDetailsScreen,
      options: {
        headerShown: false,
      },
    },
  },
});

const CartStack = createNativeStackNavigator({
  screens: {
    Cart: {
      screen: CartScreen,
      options: {
        headerShown: false,
      },
    },
    ProductDetails: {
      screen: ProductDetailsScreenModal,
      options: {
        headerShown: false,
        presentation: "modal",
      },
    },
  },
});

const MainTabs = createBottomTabNavigator({
  screenOptions: {
    tabBarStyle: {
      ...Platform.select({
        android: { height: 60 },
        // ios: {
        // height: 80,
        // },
      }),
      // position: "absolute",
      // bottom: 0,
    },
  },
  screens: {
    Shopping: {
      screen: BrowseStack,
      options: {
        ...tabBarOptions,
        headerShown: false,
        tabBarLabel: "Browse",
        tabBarIcon: ({ size, color }) => (
          <Ionicons name="search" size={size} color={color} />
        ),
      },
    },
    Lists: {
      screen: CartStack,
      options: {
        ...tabBarOptions,
        headerShown: false,
        tabBarLabel: "List",
        tabBarIcon: ListsTabBarIcon,
      },
    },
    Stores: {
      screen: StoresScreen,
      options: {
        ...tabBarOptions,
        headerShown: false,
        tabBarLabel: "Stores",
        tabBarIcon: StoreFinderTabBarIcon,
      },
    },
    _Scan: {
      screen: ScanScreen,
      options: {
        tabBarLabel: "Scan",
        headerShown: false,
        tabBarButton: ScanTabBarButtonHack,
        tabBarIcon: ({ size, color }) => (
          <Ionicons name="scan" size={size} color={color} />
        ),
      },
    },

    _More: {
      screen: MoreScreen,
      options: {
        tabBarLabel: "About",
        headerShown: false,
        tabBarIcon: ({ size, color }) => (
          <Ionicons name="information-circle" size={size} color={color} />
        ),
      },
    },
  },
});

const RootStack = createNativeStackNavigator({
  screens: {
    Tabs: {
      screen: MainTabs,
      options: {
        headerShown: false,
      },
    },
    StoreFinder: {
      screen: StoreFinderScreen,
      options: {
        headerShown: false,
        presentation: "modal",
      },
    },
    Scan: {
      screen: ScanScreen,
      options: {
        headerShown: false,
        presentation: "modal",
      },
    },
  },
});

type RootStackParamList = StaticParamList<typeof RootStack>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

const Navigation = createStaticNavigation(RootStack);

const queryClient = new QueryClient({});

export default function App() {
  useReactQueryDevTools(queryClient);

  const [loaded, setLoaded] = React.useState(false);

  // load critical data at startup
  useEffect(() => {
    void (async () => {
      try {
        await store.migrate();
        await store.loadAppState();
      } catch (e) {
        console.error("Failed to load app state", e);
        throw new Error("Failed to load app state");
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <GestureHandlerRootView style={{ flex: 1, zIndex: 10 }}>
        <BottomSheetModalProvider>
          <StoreProvider store={store}>
            <QueryClientProvider client={queryClient}>
              <TrpcProvider client={trpc}>
                <AppInner />
              </TrpcProvider>
            </QueryClientProvider>
          </StoreProvider>
        </BottomSheetModalProvider>
      </GestureHandlerRootView>
    </>
  );
}

function AppInner() {
  return (
    <>
      <Navigation />
    </>
  );
}

function StoreFinderTabBarIcon({
  size,
  color,
}: {
  size: number;
  color: string;
}) {
  const selectedStoreCount = useStore((s) => s.selectedStores.size);
  return (
    <View>
      <Ionicons name="storefront" size={size} color={color} />
      <View
        style={tw`absolute -right-[12px] bg-background rounded-[10px] min-w-[20px] h-[20px] items-center justify-center border border-border`}
      >
        <Text style={tw`text-foreground text-xs font-medium`}>
          {selectedStoreCount}
        </Text>
      </View>
    </View>
  );
}

function ListsTabBarIcon({ size, color }: { size: number; color: string }) {
  const itemCount = useStore((s) => s.getActiveListCount());
  return (
    <View>
      <Ionicons name="cart" size={size} color={color} />
      <View
        style={tw`absolute -right-[10px] bg-background rounded-[10px] min-w-[20px] h-[20px] items-center justify-center border border-border`}
      >
        <Text style={tw`text-foreground text-xs font-medium`}>{itemCount}</Text>
      </View>
    </View>
  );
}

/**
 * A hack to show the scan button on the tab bar and have it open a modal.
 */
function ScanTabBarButtonHack({
  onPress,
  onLongPress,
  ...props
}: BottomTabBarButtonProps) {
  const navigation = useNavigation();
  return (
    <PlatformPressable
      {...props}
      onPress={() => {
        navigation.navigate("Scan");
      }}
    >
      {props.children}
    </PlatformPressable>
  );
}
