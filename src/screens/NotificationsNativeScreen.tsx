import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { api } from "../lib/api";

const BRAND = {
  primary: "#03468F",
  primaryDark: "#20466F",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  textMuted: "#64748B",
  border: "#D7E2EE",
  danger: "#DC2626",
};

const SCREEN_SIDE_PADDING = 16;

function toArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.notifications)) return value.notifications;
  return [];
}

function authHeaders(token: string) {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
}

export default function NotificationsNativeScreen({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);

  const unreadCount = items.filter((row) => !row?.is_read).length;

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/notifications", authHeaders(token));
      setItems(toArray(res.data));
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = useCallback(
    async (id: number) => {
      try {
        await api.put(`/notifications/${id}/read`, {}, authHeaders(token));
        setItems((prev) =>
          prev.map((n) => (Number(n?.id) === Number(id) ? { ...n, is_read: 1 } : n)),
        );
      } catch {
        // Keep UI stable if endpoint fails.
      }
    },
    [token],
  );

  const markAllAsRead = useCallback(async () => {
    try {
      await api.put("/notifications/read-all", {}, authHeaders(token));
      setItems((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    } catch {
      // Keep UI stable if endpoint fails.
    }
  }, [token]);

  return (
    <SafeAreaView style={styles.screen}>
      <Animated.View entering={FadeInDown.duration(260)}>
        <Text style={styles.screenTitle}>Notifications</Text>
        <Text style={styles.subtitle}>Live notification center</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80).duration(260)} style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statKey}>Total</Text>
          <Text style={styles.statValue}>{items.length}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statKey}>Unread</Text>
          <Text style={styles.statValue}>{unreadCount}</Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(120).duration(260)} style={styles.rowActions}>
        <Pressable onPress={fetchNotifications} style={styles.refreshBtn}>
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </Pressable>
        <Pressable onPress={markAllAsRead} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>Read All</Text>
        </Pressable>
      </Animated.View>

      {loading ? (
        <Animated.View entering={FadeIn.duration(220)} style={styles.loadingWrap}>
          <ActivityIndicator color={BRAND.primary} />
        </Animated.View>
      ) : null}
      {error ? (
        <Animated.View entering={FadeIn.duration(220)}>
          <Text style={styles.errorText}>{error}</Text>
        </Animated.View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(item, idx) => String(item?.id || idx)}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading ? (
            <Animated.View entering={FadeIn.delay(120).duration(250)} style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptySubtitle}>You are all caught up for now.</Text>
            </Animated.View>
          ) : null
        }
        renderItem={({ item, index }) => {
          const unread = !item?.is_read;
          return (
            <Animated.View entering={FadeInDown.delay(Math.min(index * 40, 280)).duration(240)}>
              <Pressable
                onPress={() => unread && item?.id && markAsRead(item.id)}
                style={[styles.pageCard, unread && styles.unreadCard]}
              >
                <View style={styles.notificationHeaderRow}>
                  <Text style={styles.pageTitle}>{item?.title || "Notification"}</Text>
                  <Text style={[styles.badgeText, unread ? styles.badgeUnread : styles.badgeRead]}>
                    {unread ? "New" : "Read"}
                  </Text>
                </View>
                <Text style={styles.pageSubtitle}>
                  {item?.message || item?.content || "No message"}
                </Text>
              </Pressable>
            </Animated.View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BRAND.background,
    paddingHorizontal: SCREEN_SIDE_PADDING,
    paddingTop: 16,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: BRAND.primary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: BRAND.textMuted,
    marginBottom: 12,
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: BRAND.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statKey: {
    color: BRAND.textMuted,
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    color: BRAND.primary,
    fontSize: 20,
    fontWeight: "800",
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  refreshBtn: {
    alignSelf: "flex-start",
    backgroundColor: BRAND.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  refreshBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  secondaryBtn: {
    backgroundColor: "#FFE288",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  secondaryBtnText: {
    color: BRAND.primaryDark,
    fontSize: 12,
    fontWeight: "700",
  },
  errorText: {
    color: BRAND.danger,
    fontSize: 13,
    marginBottom: 8,
  },
  loadingWrap: {
    paddingVertical: 10,
  },
  listContent: {
    gap: 10,
    paddingBottom: 20,
    flexGrow: 1,
  },
  pageCard: {
    backgroundColor: BRAND.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 14,
  },
  unreadCard: {
    borderColor: BRAND.primary,
    backgroundColor: "#EEF4FC",
  },
  notificationHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: BRAND.primaryDark,
  },
  pageSubtitle: {
    fontSize: 13,
    color: BRAND.textMuted,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  badgeUnread: {
    color: BRAND.primary,
    backgroundColor: "#DBEAFE",
  },
  badgeRead: {
    color: "#166534",
    backgroundColor: "#DCFCE7",
  },
  emptyCard: {
    marginTop: 30,
    backgroundColor: BRAND.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    paddingHorizontal: 14,
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: BRAND.primaryDark,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: BRAND.textMuted,
  },
});
