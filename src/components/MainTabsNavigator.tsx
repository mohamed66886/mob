import React, { useCallback, useEffect, useState } from "react";
import { 
  StyleSheet, 
  Platform, 
  View, 
  Text, 
  Pressable, 
  Dimensions, 
  I18nManager,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { api } from "../lib/api";
import SocketManager from "../lib/realtime";
import { ErrorBoundary } from "./ErrorBoundary";
import { appendReleaseLog } from "../lib/releaseLogger";
import { UserRole } from "../types/auth";

const { width } = Dimensions.get("window");
const TAB_BAR_MARGIN = 20;
const TAB_BAR_WIDTH = width - (TAB_BAR_MARGIN * 2); 
const IS_RTL = I18nManager.isRTL;

type MainTabsParamList = {
  Home: undefined;
  QR: undefined;
  Materials: undefined;
  Tasks: undefined;
  Workspaces: undefined;
  Account: undefined;
};

const Tabs = createBottomTabNavigator<MainTabsParamList>();
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const DEBUG_DISABLE_SOCKET = process.env.EXPO_PUBLIC_DISABLE_MAIN_TABS_SOCKET === "1";
const DEBUG_DISABLE_BADGES_API = process.env.EXPO_PUBLIC_DISABLE_MAIN_TABS_API === "1";
const DEBUG_DISABLE_CUSTOM_TAB_BAR = process.env.EXPO_PUBLIC_DISABLE_CUSTOM_TAB_BAR === "1";

// ---------------------------------------------------------
// 1. Smart Animated Badge (Pop Effect)
// ---------------------------------------------------------
function PulsingBadge({ count }: { count?: number | string }) {
  const scale = useSharedValue(0);

  useEffect(() => {
    if (count && count !== 0) {
      // Smooth pop effect when a new badge count appears
      scale.value = withSequence(
        withTiming(0, { duration: 0 }),
        withSpring(1.2, { damping: 10, stiffness: 150 }),
        withSpring(1, { damping: 10, stiffness: 100 })
      );
    } else {
      scale.value = withTiming(0, { duration: 200 });
    }
  }, [count, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: scale.value > 0 ? 1 : 0,
  }));

  if (!count || count === 0) return null;

  return (
    <Animated.View style={[styles.badgeContainer, animatedStyle]}>
      <Text style={styles.badgeText}>{count}</Text>
    </Animated.View>
  );
}

type TabBarItemProps = {
  route: any;
  index: number;
  state: any;
  descriptors: any;
  navigation: any;
  primaryColor: string;
};

function TabBarItem({
  route,
  index,
  state,
  descriptors,
  navigation,
  primaryColor,
}: TabBarItemProps) {
  const { options } = descriptors[route.key];
  const isFocused = state.index === index;
  const badgeCount = options.tabBarBadge;

  // Keep animated hooks at component top-level. Calling hooks inside map callbacks can crash in release.
  const pressScale = useSharedValue(1);
  const iconScale = useSharedValue(isFocused ? 1.15 : 1);

  useEffect(() => {
    iconScale.value = withSpring(isFocused ? 1.15 : 1, { damping: 12, stiffness: 150 });
  }, [iconScale, isFocused]);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }, { translateY: isFocused ? -2 : 0 }],
  }));

  const onPressIn = () => {
    pressScale.value = withSpring(0.9);
  };

  const onPressOut = () => {
    pressScale.value = withSpring(1);
  };

  const onPress = () => {
    if (!isFocused) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  return (
    <AnimatedPressable
      key={route.key}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[styles.tabItem, animatedContainerStyle]}
    >
      <View style={styles.iconContainer}>
        <Animated.View style={animatedIconStyle}>
          {options.tabBarIcon({
            focused: isFocused,
            color: isFocused ? primaryColor : "#8e8e93",
            size: 24,
          })}
        </Animated.View>
        <PulsingBadge count={badgeCount} />
      </View>

      <Text
        style={[
          styles.label,
          { color: isFocused ? primaryColor : "#8e8e93" },
          isFocused && styles.labelFocused,
        ]}
      >
        {options.tabBarLabel}
      </Text>
    </AnimatedPressable>
  );
}

// ---------------------------------------------------------
// 2. Custom Tab Bar (macOS Dock Style)
// ---------------------------------------------------------
function CustomTabBar({ state, descriptors, navigation, primaryColor, insets }: any) {
  const tabWidth = TAB_BAR_WIDTH / state.routes.length;
  const indicatorPosition = useSharedValue(0);

  useEffect(() => {
    // Support RTL so the indicator moves in the correct direction
    const directionMultiplier = IS_RTL ? -1 : 1;
    indicatorPosition.value = withSpring(state.index * tabWidth * directionMultiplier, {
      damping: 16,
      stiffness: 120,
    });
  }, [state.index, tabWidth, indicatorPosition]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorPosition.value }],
  }));

  return (
    <View style={[styles.tabWrapper, { bottom: Math.max(insets.bottom, 15) }]}>
      {/* Glassmorphism Background */}
      <BlurView 
        intensity={Platform.OS === "ios" ? 80 : 100} 
        tint="light" 
        style={StyleSheet.absoluteFill} 
      />
      {/* Fallback for Android to ensure it's not too transparent */}
      {Platform.OS === 'android' && <View style={styles.androidFallbackBg} />}

      {/* Sliding Background Highlight */}
      <Animated.View style={[styles.slidingIndicator, { width: tabWidth }, indicatorStyle]}>
        <View style={[styles.indicatorInner, { backgroundColor: primaryColor + "15" }]} />
      </Animated.View>

      {state.routes.map((route: any, index: number) => (
        <TabBarItem
          key={route.key}
          route={route}
          index={index}
          state={state}
          descriptors={descriptors}
          navigation={navigation}
          primaryColor={primaryColor}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------
// 3. Main Component
// ---------------------------------------------------------
const TAB_ICONS: Record<keyof MainTabsParamList, { active: any, inactive: any }> = {
  Home: { active: "home", inactive: "home-outline" },
  QR: { active: "qr-code", inactive: "qr-code-outline" },
  Materials: { active: "book", inactive: "book-outline" },
  Tasks: { active: "checkmark-circle", inactive: "checkmark-circle-outline" },
  Workspaces: { active: "chatbubbles", inactive: "chatbubbles-outline" },
  Account: { active: "person", inactive: "person-outline" },
};

const TAB_LABELS: Record<keyof MainTabsParamList, string> = {
  Home: "Home",
  QR: "QR",
  Materials: "Materials",
  Tasks: "Tasks",
  Workspaces: "Chats",
  Account: "Account",
};

type MainTabsNavigatorProps = {
  renderHome: () => React.ReactNode;
  renderQr: () => React.ReactNode;
  renderMaterials: () => React.ReactNode;
  renderTasks: () => React.ReactNode;
  renderWorkspaces: (props: any) => React.ReactNode;
  renderAccount: () => React.ReactNode;
  token: string;
  userRole?: UserRole;
  primaryColor?: string;
};

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${String(token || "").trim()}` } };
}

function getPendingTasksCount(tasks: any[], role?: UserRole) {
  if (role !== "student") return 0;
  return tasks.filter((task) => !task?.my_submission_id).length;
}

export default function MainTabsNavigator({
  renderHome,
  renderQr,
  renderMaterials,
  renderTasks,
  renderWorkspaces,
  renderAccount,
  token,
  userRole,
  primaryColor = "#3390ec",
}: MainTabsNavigatorProps) {
  const insets = useSafeAreaInsets();
  const [iconsLoaded] = useFonts(Ionicons.font);
  const useSimpleAndroidTabBar = Platform.OS === "android" && !__DEV__;
  
  const [pendingTasksCount, setPendingTasksCount] = useState(0); 
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const hasValidToken = typeof token === "string" && token.trim().length > 0;

  const refreshBadges = useCallback(async () => {
    if (!hasValidToken || DEBUG_DISABLE_BADGES_API) return;

    try {
      const requests: Promise<any>[] = [api.get("/workspaces/rooms", authHeaders(token))];
      const includeTasks = userRole === "student";

      if (includeTasks) {
        requests.push(api.get("/tasks", authHeaders(token)));
      }

      const [roomsRes, tasksRes] = await Promise.all(requests);
      const rooms = Array.isArray(roomsRes?.data) ? roomsRes.data : [];
      const unread = rooms.reduce((sum: number, room: any) => sum + Number(room?.unread_count || 0), 0);
      setUnreadMessagesCount(unread);

      if (includeTasks) {
        const tasks = Array.isArray(tasksRes?.data) ? tasksRes.data : [];
        setPendingTasksCount(getPendingTasksCount(tasks, userRole));
      } else {
        setPendingTasksCount(0);
      }
    } catch (error) {
      appendReleaseLog("warn", "MainTabs refreshBadges failed", error);
      // Keep previous badge values on transient network errors.
    }
  }, [hasValidToken, token, userRole]);

  useEffect(() => {
    refreshBadges();
    const timer = setInterval(refreshBadges, 10000);
    return () => clearInterval(timer);
  }, [refreshBadges]);

  useFocusEffect(
    useCallback(() => {
      refreshBadges();
      return undefined;
    }, [refreshBadges]),
  );

  useEffect(() => {
    if (!hasValidToken || DEBUG_DISABLE_SOCKET) return;

    let socket: any;
    try {
      socket = SocketManager.getInstance(token).socket;
    } catch (error) {
      appendReleaseLog("error", "MainTabs socket init failed", error);
      return;
    }

    if (!socket) return;
    const onRealtimeRefresh = () => {
      refreshBadges();
    };

    socket.on("connect", onRealtimeRefresh);
    socket.on("receive_message", onRealtimeRefresh);
    socket.on("message_seen", onRealtimeRefresh);
    socket.on("message_updated", onRealtimeRefresh);
    socket.on("room_created", onRealtimeRefresh);
    socket.on("user_joined_room", onRealtimeRefresh);

    return () => {
      socket.off("connect", onRealtimeRefresh);
      socket.off("receive_message", onRealtimeRefresh);
      socket.off("message_seen", onRealtimeRefresh);
      socket.off("message_updated", onRealtimeRefresh);
      socket.off("room_created", onRealtimeRefresh);
      socket.off("user_joined_room", onRealtimeRefresh);
    };
  }, [hasValidToken, refreshBadges, token]);



  if (!iconsLoaded) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={primaryColor} />
      </View>
    );
  }

  if (!hasValidToken) {
    appendReleaseLog("warn", "MainTabs mounted without token");
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.badStateText}>Session expired. Please login again.</Text>
      </View>
    );
  }

  return (
    <Tabs.Navigator
      tabBar={
        useSimpleAndroidTabBar || DEBUG_DISABLE_CUSTOM_TAB_BAR
          ? undefined
          : (props) => <CustomTabBar {...props} primaryColor={primaryColor} insets={insets} />
      }
      screenOptions={({ route }) => ({
        headerShown: false,
        unmountOnBlur: true,
        tabBarHideOnKeyboard: true,
        tabBarStyle: useSimpleAndroidTabBar
          ? {
              backgroundColor: "#ffffff",
              borderTopColor: "#e5e7eb",
            }
          : undefined,
        tabBarLabel: TAB_LABELS[route.name],
        tabBarBadge:
          route.name === "Tasks" && pendingTasksCount > 0
            ? pendingTasksCount > 99 ? "99+" : pendingTasksCount
            : route.name === "Workspaces" && unreadMessagesCount > 0
            ? unreadMessagesCount > 99 ? "99+" : unreadMessagesCount
            : undefined,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name];
          const iconName = focused ? icons.active : icons.inactive;
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="Home">
        {() => <ErrorBoundary>{renderHome()}</ErrorBoundary>}
      </Tabs.Screen>
      <Tabs.Screen name="QR">
        {() => <ErrorBoundary>{renderQr()}</ErrorBoundary>}
      </Tabs.Screen>
      <Tabs.Screen name="Materials">
        {() => <ErrorBoundary>{renderMaterials()}</ErrorBoundary>}
      </Tabs.Screen>
      <Tabs.Screen name="Tasks">
        {() => <ErrorBoundary>{renderTasks()}</ErrorBoundary>}
      </Tabs.Screen>
      <Tabs.Screen name="Workspaces">
        {(props) => <ErrorBoundary>{renderWorkspaces(props)}</ErrorBoundary>}
      </Tabs.Screen>
      <Tabs.Screen name="Account">
        {() => <ErrorBoundary>{renderAccount()}</ErrorBoundary>}
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}

// ---------------------------------------------------------
// 4. Styles
// ---------------------------------------------------------
const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  tabWrapper: {
    flexDirection: "row",
    height: 72,
    position: "absolute",
    left: TAB_BAR_MARGIN,
    right: TAB_BAR_MARGIN,
    borderRadius: 36,
    overflow: "hidden",
    backgroundColor: "transparent",
    // Shadow for iOS
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    // Elevation for Android
    elevation: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.4)",
  },
  androidFallbackBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    paddingTop: 4,
  },
  iconContainer: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  label: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: "600",
  },
  labelFocused: {
    fontWeight: "800",
  },
  badStateText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "600",
  },
  slidingIndicator: {
    position: "absolute",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  indicatorInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  badgeContainer: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: "#FF3B30",
    borderRadius: 12,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    zIndex: 10,
    shadowColor: "#FF3B30",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
});