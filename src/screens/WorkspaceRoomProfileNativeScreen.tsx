import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  Image as ImageIcon, Link2, FileText, Bell, BellOff,
  ChevronRight, UserPlus, MoreHorizontal, Search, ArrowLeft,
  Users
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  FadeInDown,
  FadeIn
} from "react-native-reanimated";

import { api } from "../lib/api";
import { User } from "../types/auth";

const BRAND = {
  primary: "#3390ec", // Telegram Blue
  primaryDark: "#2b7cb9",
  background: "#f1f2f6", // Soft gray background
  surface: "#ffffff",
  text: "#1c1c1e",
  textMuted: "#8e8e93",
  border: "#E5E5EA",
  danger: "#FF3B30",
};

const getAvatarColor = (name: string) => {
  const colors = ['#e17076', '#faa774', '#a695e7', '#7bc862', '#6ec9cb', '#65aadd', '#ee7aae'];
  const charCode = name.charCodeAt(0) || 0;
  return colors[charCode % colors.length];
};

function formatThreePartName(name?: string | null) {
  const normalized = String(name || "").trim().replace(/\s+/g, " ");
  if (!normalized) return "Unknown";
  const parts = normalized.split(" ").filter(Boolean);
  return parts.slice(0, 3).join(" ");
}

function normalizeMessages(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

function roomMuteStorageKey(roomId: number) {
  return `@workspace_room_muted_${roomId}`;
}

export default function WorkspaceRoomProfileNativeScreen({ token, user, route, navigation }: any) {
  const roomId = Number(route?.params?.roomId || 0);
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [roomMessages, setRoomMessages] = useState<any[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");

  const scrollY = useSharedValue(0);

  const roomName = String(room?.name || route?.params?.roomName || "Group");
  const inviteCode = String(room?.invite_code || room?.inviteCode || "").trim();

  const loadData = useCallback(async () => {
    if (!roomId) return setLoading(false);
    try {
      const headers = { headers: { Authorization: `Bearer ${token}` } };
      const [roomRes, membersRes, messagesRes, muteFlag] = await Promise.all([
        api.get(`/workspaces/rooms/${roomId}`, headers),
        api.get(`/workspaces/rooms/${roomId}/members`, headers),
        api.get(`/workspaces/rooms/${roomId}/messages`, headers),
        AsyncStorage.getItem(roomMuteStorageKey(roomId)),
      ]);

      setRoom(roomRes?.data || null);
      setMembers(normalizeMessages(membersRes?.data));
      setRoomMessages(normalizeMessages(messagesRes?.data?.data || messagesRes?.data));
      setIsMuted(muteFlag === "1");
    } catch {
      setRoom(null); setMembers([]); setRoomMessages([]);
    } finally {
      setLoading(false);
    }
  }, [roomId, token]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggleMute = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !isMuted;
    setIsMuted(next);
    try { await AsyncStorage.setItem(roomMuteStorageKey(roomId), next ? "1" : "0"); } 
    catch { setIsMuted(!next); }
  }, [isMuted, roomId]);

  const filteredMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) return members;
    return members.filter((member) => `${member?.name || ""} ${member?.username || ""} ${member?.role || ""}`.toLowerCase().includes(query));
  }, [memberQuery, members]);

  const sharedCounts = useMemo(() => {
    let media = 0, files = 0, links = 0;
    roomMessages.forEach((msg) => {
      const type = String(msg?.type || "").toLowerCase();
      if (/https?:\/\//i.test(msg?.content || "") || type === "link") links += 1;
      if (!msg?.file_url && !msg?.uploaded_file_url) return;
      if (type === "image" || type === "video" || /\.(png|jpe?g|gif|webp|mp4|mov)($|\?)/i.test(msg.file_url)) media += 1;
      else files += 1;
    });
    return { media, files, links };
  }, [roomMessages]);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const headerOpacityStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [80, 120], [0, 1], Extrapolation.CLAMP),
  }));

  const avatarAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollY.value, [-100, 0, 100], [1.3, 1, 0.7], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [-100, 0, 100], [0, 0, -20], Extrapolation.CLAMP);
    return { transform: [{ scale }, { translateY }] };
  });

  if (loading) {
    return (
      <View style={[styles.screen, styles.centerAll]}>
        <ActivityIndicator color={BRAND.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      <Animated.View style={[styles.stickyHeader, { paddingTop: insets.top }, headerOpacityStyle]}>
        <Text style={styles.stickyHeaderTitle} numberOfLines={1}>{formatThreePartName(roomName)}</Text>
      </Animated.View>

      <Pressable 
        style={[styles.backBtn, { top: insets.top + 10 }]} 
        onPress={() => { Haptics.selectionAsync(); navigation?.goBack(); }}
      >
        <ArrowLeft color={BRAND.primary} size={28} />
      </Pressable>

      <Animated.FlatList
        data={filteredMembers}
        keyExtractor={(item, index) => String(item?.user_id || item?.id || index)}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={[styles.heroCard, { paddingTop: insets.top + 50 }]}>
              <Animated.View style={[styles.avatarCircle, avatarAnimatedStyle]}>
                <LinearGradient colors={["#66a6ff", "#89f7fe"]} style={styles.avatarGradient}>
                  <Text style={styles.avatarText}>{String(roomName).charAt(0).toUpperCase()}</Text>
                </LinearGradient>
              </Animated.View>

              <Text style={styles.groupName} numberOfLines={1}>{formatThreePartName(roomName)}</Text>
              <Text style={styles.groupSub}>{members.length} {members.length === 1 ? 'member' : 'members'}</Text>

              <View style={styles.actionsRow}>
                <Pressable style={styles.actionItem} onPress={handleToggleMute}>
                  <View style={styles.actionIconBg}>
                    {isMuted ? <BellOff size={22} color={BRAND.primary} /> : <Bell size={22} color={BRAND.primary} />}
                  </View>
                  <Text style={styles.actionText}>{isMuted ? "Unmute" : "Mute"}</Text>
                </Pressable>
                <Pressable style={styles.actionItem} onPress={() => { Haptics.selectionAsync(); setSearchEnabled(!searchEnabled); }}>
                  <View style={styles.actionIconBg}><Search size={22} color={BRAND.primary} /></View>
                  <Text style={styles.actionText}>Search</Text>
                </Pressable>
                <Pressable style={styles.actionItem} onPress={() => Alert.alert("Add", "Not available yet.")}>
                  <View style={styles.actionIconBg}><UserPlus size={22} color={BRAND.primary} /></View>
                  <Text style={styles.actionText}>Add</Text>
                </Pressable>
                <Pressable style={styles.actionItem} onPress={() => Alert.alert("More", "Options coming soon.")}>
                  <View style={styles.actionIconBg}><MoreHorizontal size={22} color={BRAND.primary} /></View>
                  <Text style={styles.actionText}>More</Text>
                </Pressable>
              </View>

              {searchEnabled && (
                <Animated.View entering={FadeInDown.springify()} style={styles.searchBoxWrap}>
                  <Search color={BRAND.textMuted} size={18} style={styles.searchIconInput} />
                  <TextInput
                    value={memberQuery}
                    onChangeText={setMemberQuery}
                    placeholder="Search members..."
                    placeholderTextColor={BRAND.textMuted}
                    style={styles.searchInput}
                    autoFocus
                  />
                </Animated.View>
              )}
            </View>

            {inviteCode ? (
              <View style={styles.sectionCard}>
                <View style={styles.rowAction}>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowTitle}>Invite Code</Text>
                    <Text style={styles.rowSubTitle}>{inviteCode}</Text>
                  </View>
                </View>
              </View>
            ) : null}

            <View style={styles.sectionCard}>
              {[
                { key: "media", title: "Media", icon: <ImageIcon size={22} color={BRAND.primary} />, count: sharedCounts.media },
                { key: "files", title: "Files", icon: <FileText size={22} color={BRAND.primary} />, count: sharedCounts.files },
                { key: "links", title: "Links", icon: <Link2 size={22} color={BRAND.primary} />, count: sharedCounts.links },
              ].map((action, index) => (
                <Pressable 
                  key={action.key} 
                  style={({ pressed }) => [styles.rowAction, index > 0 && styles.rowBorder, pressed && styles.rowPressed]}
                  onPress={() => Alert.alert(action.title, `${action.count} item(s) found.`)}
                >
                  {action.icon}
                  <Text style={styles.rowTitleMenu}>{action.title}</Text>
                  <View style={styles.rowActionRight}>
                    <Text style={styles.rowCount}>{action.count}</Text>
                    <ChevronRight size={18} color={BRAND.border} />
                  </View>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionHeader}>{members.length} Members</Text>
          </>
        }
        renderItem={({ item, index }) => {
          const name = formatThreePartName(item?.name);
          const role = String(item?.role || "member");
          const isLast = index === filteredMembers.length - 1;

          return (
            <Pressable
              style={({ pressed }) => [styles.memberRow, isLast && styles.memberRowLast, pressed && styles.rowPressed]}
              onPress={() => {
                Haptics.selectionAsync();
                Alert.alert(name, `Role: ${role}`);
              }}
            >
              <View style={[styles.memberAvatar, { backgroundColor: getAvatarColor(name) }]}>
                 <Text style={styles.memberAvatarText}>{name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.memberInfo}>
                <Text numberOfLines={1} style={styles.memberName}>{name}</Text>
                <Text numberOfLines={1} style={styles.memberMeta}>
                  {item?.username ? `@${item.username}` : "online"}
                </Text>
              </View>
              {role === "doctor" && (
                 <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>Owner</Text></View>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Animated.View entering={FadeIn} style={styles.emptyState}>
            <Users size={48} color={BRAND.border} />
            <Text style={styles.emptyText}>No members found.</Text>
          </Animated.View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.background },
  centerAll: { alignItems: "center", justifyContent: "center" },
  content: { paddingBottom: 40 },

  stickyHeader: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: BRAND.surface,
    paddingBottom: 14,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
    zIndex: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 3,
  },
  stickyHeaderTitle: { fontSize: 17, fontWeight: "700", color: BRAND.text },
  backBtn: { position: 'absolute', left: 16, zIndex: 20, padding: 4 },

  heroCard: { backgroundColor: BRAND.surface, alignItems: "center", paddingBottom: 24, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.border },
  avatarCircle: { width: 110, height: 110, borderRadius: 55, marginBottom: 16, shadowColor: BRAND.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 6 },
  avatarGradient: { flex: 1, borderRadius: 55, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 44, fontWeight: "700", color: "#fff" },
  
  groupName: { fontSize: 24, fontWeight: "800", color: BRAND.text, textAlign: "center", paddingHorizontal: 20 },
  groupSub: { marginTop: 4, fontSize: 15, color: BRAND.textMuted, fontWeight: "500" },
  
  actionsRow: { flexDirection: "row", justifyContent: "center", gap: 24, width: "100%", marginTop: 24 },
  actionItem: { alignItems: "center", gap: 8 },
  actionIconBg: { width: 48, height: 48, borderRadius: 24, backgroundColor: BRAND.primary + "15", alignItems: "center", justifyContent: "center" },
  actionText: { color: BRAND.primary, fontSize: 13, fontWeight: "600" },

  searchBoxWrap: { flexDirection: "row", alignItems: "center", backgroundColor: BRAND.background, marginHorizontal: 20, marginTop: 24, borderRadius: 12, paddingHorizontal: 12, height: 44, width: "90%" },
  searchIconInput: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: BRAND.text },

  sectionCard: { backgroundColor: BRAND.surface, marginTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: BRAND.border },
  rowAction: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BRAND.border, marginLeft: 50 },
  rowPressed: { backgroundColor: BRAND.background },
  
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 13, color: BRAND.textMuted, marginBottom: 4, textTransform: "uppercase", fontWeight: "600" },
  rowSubTitle: { fontSize: 16, color: BRAND.text, fontWeight: "500" },
  
  rowTitleMenu: { fontSize: 16, color: BRAND.text, flex: 1, marginLeft: 16 },
  rowActionRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowCount: { fontSize: 15, color: BRAND.textMuted, fontWeight: "500" },

  sectionHeader: { fontSize: 13, fontWeight: "700", color: BRAND.textMuted, textTransform: "uppercase", paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8 },

  memberRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: BRAND.surface },
  memberRowLast: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.border },
  memberAvatar: { width: 48, height: 48, borderRadius: 24, marginRight: 14, alignItems: "center", justifyContent: "center" },
  memberAvatarText: { fontSize: 20, fontWeight: "700", color: "#fff" },
  
  memberInfo: { flex: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.border, paddingBottom: 12, paddingTop: 4 },
  memberName: { fontSize: 17, fontWeight: "600", color: BRAND.text, marginBottom: 2 },
  memberMeta: { fontSize: 14, color: BRAND.textMuted },
  
  adminBadge: { position: "absolute", right: 16, top: 20, backgroundColor: BRAND.primary + "15", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  adminBadgeText: { fontSize: 12, fontWeight: "700", color: BRAND.primary },

  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyText: { color: BRAND.textMuted, fontSize: 15, fontWeight: "500" },
});