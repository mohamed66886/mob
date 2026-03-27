import React, { useCallback, useEffect, useState } from "react";
import { 
  StyleSheet, 
  Platform, 
  View, 
  Text, 
  Pressable, 
  Dimensions, 
  I18nManager 
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const badgeCount = options.tabBarBadge;

        // Micro-interaction Scale Value
        const pressScale = useSharedValue(1);
        const iconScale = useSharedValue(isFocused ? 1.15 : 1);

        useEffect(() => {
          iconScale.value = withSpring(isFocused ? 1.15 : 1, { damping: 12, stiffness: 150 });
        }, [isFocused, iconScale]);

        const animatedContainerStyle = useAnimatedStyle(() => ({
          transform: [{ scale: pressScale.value }],
        }));
        
        const animatedIconStyle = useAnimatedStyle(() => ({
          transform: [{ scale: iconScale.value }, { translateY: isFocused ? -2 : 0 }],
        }));

        const onPressIn = () => { pressScale.value = withSpring(0.9); };
        const onPressOut = () => { pressScale.value = withSpring(1); };

        const onPress = () => {
          if (!isFocused) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

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

            <Text style={[styles.label, { color: isFocused ? primaryColor : "#8e8e93" }, isFocused && styles.labelFocused]}>
              {options.tabBarLabel}
            </Text>
          </AnimatedPressable>
        );
      })}
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
  return { headers: { Authorization: `Bearer ${token}` } };
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
  const [iconsLoaded] = useFonts(Ionicons.font);
  const insets = useSafeAreaInsets();
  
  const [pendingTasksCount, setPendingTasksCount] = useState(0); 
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  const refreshBadges = useCallback(async () => {
    if (!token) return;

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
    } catch {
      // Keep previous badge values on transient network errors.
    }
  }, [token, userRole]);

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
    if (!token) return;

    const socket = SocketManager.getInstance(token).socket;
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
  }, [refreshBadges, token]);

  if (!iconsLoaded) return null;

  return (
    <Tabs.Navigator
      tabBar={(props) => <CustomTabBar {...props} primaryColor={primaryColor} insets={insets} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        unmountOnBlur: true,
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
      <Tabs.Screen name="Home">{renderHome}</Tabs.Screen>
      <Tabs.Screen name="QR">{renderQr}</Tabs.Screen>
      <Tabs.Screen name="Materials">{renderMaterials}</Tabs.Screen>
      <Tabs.Screen name="Tasks">{renderTasks}</Tabs.Screen>
      <Tabs.Screen name="Workspaces">{renderWorkspaces}</Tabs.Screen>
      <Tabs.Screen name="Account">{renderAccount}</Tabs.Screen>
    </Tabs.Navigator>
  );
}

// ---------------------------------------------------------
// 4. Styles
// ---------------------------------------------------------
const styles = StyleSheet.create({
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