import React, { useCallback, useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StyleSheet, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../lib/api";
import { UserRole } from "../types/auth";

type MainTabsParamList = {
  Home: undefined;
  QR: undefined;
  Materials: undefined;
  Tasks: undefined;
  Workspaces: undefined;
  Account: undefined;
};

const Tabs = createBottomTabNavigator<MainTabsParamList>();

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

function badgeValue(count: number) {
  if (count <= 0) return undefined;
  return count > 99 ? "99+" : count;
}

// قاموس مزدوج: أيقونة مفرغة (Inactive) وأيقونة مليانة (Active) زي تليجرام
const TAB_ICONS: Record<
  keyof MainTabsParamList,
  { active: React.ComponentProps<typeof Ionicons>["name"]; inactive: React.ComponentProps<typeof Ionicons>["name"] }
> = {
  Home: { active: "home", inactive: "home-outline" },
  QR: { active: "qr-code", inactive: "qr-code-outline" },
  Materials: { active: "book", inactive: "book-outline" },
  Tasks: { active: "checkmark-circle", inactive: "checkmark-circle-outline" },
  Workspaces: { active: "chatbubbles", inactive: "chatbubbles-outline" }, // أيقونة المحادثات
  Account: { active: "person", inactive: "person-outline" }, // أيقونة البروفايل
};

// قاموس مخصص لأسماء التابات عشان تظهر بشكل نظيف 
const TAB_LABELS: Record<keyof MainTabsParamList, string> = {
  Home: "الرئيسية",
  QR: "QR",
  Materials: "المواد",
  Tasks: "المهام",
  Workspaces: "المحادثات",
  Account: "حسابي",
};

export default function MainTabsNavigator({
  renderHome,
  renderQr,
  renderMaterials,
  renderTasks,
  renderWorkspaces,
  renderAccount,
  token,
  userRole,
  primaryColor = "#3390ec", // Telegram Blue كقيمة افتراضية
}: MainTabsNavigatorProps) {
  const [iconsLoaded] = useFonts(Ionicons.font);
  const [pendingTasksCount, setPendingTasksCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  if (!iconsLoaded) {
    return null;
  }

  const refreshBadges = useCallback(async () => {
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
        const pending = tasks.filter((task: any) => !task?.my_submission_id).length;
        setPendingTasksCount(pending);
      } else {
        setPendingTasksCount(0);
      }
    } catch {
      // Keep last counters if network fails.
    }
  }, [token, userRole]);

  useEffect(() => {
    refreshBadges();
    const timer = setInterval(() => {
      refreshBadges();
    }, 10000);

    return () => clearInterval(timer);
  }, [refreshBadges]);

  useFocusEffect(
    useCallback(() => {
      refreshBadges();
    }, [refreshBadges]),
  );

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        // Auto-refresh all tab screens by remounting when user returns to the tab.
        unmountOnBlur: true,
        freezeOnBlur: false,
        tabBarActiveTintColor: primaryColor,
        tabBarInactiveTintColor: "#707579", // Telegram Inactive Text Color
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarLabel: TAB_LABELS[route.name], // استخدام الأسماء المخصصة
        tabBarBadge:
          route.name === "Tasks"
            ? badgeValue(pendingTasksCount)
            : route.name === "Workspaces"
              ? badgeValue(unreadMessagesCount)
              : undefined,
        tabBarBadgeStyle: styles.badge,
        tabBarIcon: ({ focused, color, size }) => {
          // جلب الأيقونة بناءً على حالة الـ Focus
          const icons = TAB_ICONS[route.name];
          const iconName = focused ? icons.active : icons.inactive;

          // تكبير الأيقونة سنة بسيطة لو Active (Animation خفيف بيتعمل تلقائي في React Navigation)
          return <Ionicons name={iconName} size={focused ? size + 2 : size} color={color} />;
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

const styles = StyleSheet.create({
  tabBar: {
    height: Platform.OS === "ios" ? 85 : 65, // ارتفاع مناسب للآيفون والأندرويد
    paddingBottom: Platform.OS === "ios" ? 25 : 10,
    paddingTop: 8,
    backgroundColor: "#FFFFFF", // أو #f1f2f6 لو حاببها مموهة شوية
    // شيلنا الـ Shadows القوية وحطينا Hairline Border زي تليجرام
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#A3ABB5", 
    elevation: 0, // إلغاء الـ Shadow في الأندرويد
    shadowOpacity: 0, // إلغاء الـ Shadow في الآيفون
  },
  tabBarLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  badge: {
    backgroundColor: "#e11d48",
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },
});