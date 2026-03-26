import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Animated,
  Platform,
  TextInput,
  Alert,
} from "react-native";
import { Image as ImageIcon, Link2, FileText, Bell, BellOff, ChevronRight, UserPlus, Info, Search } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../lib/api";
import { User } from "../types/auth";

const BRAND = {
  primary: "#2b88d8", // Telegram Blue
  primaryDark: "#1c6ab1",
  background: "#f0f2f5", // Telegram Chat Background
  surface: "#ffffff",
  text: "#000000",
  textMuted: "#8e8e93",
  border: "#c8c7cc",
  danger: "#ff3b30",
};

function formatThreePartName(name?: string | null) {
  const normalized = String(name || "").trim().replace(/\s+/g, " ");
  if (!normalized) return "Unnamed Room";
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length <= 3) return parts.join(" ");
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

function resolveUploadUrl(fileUrl?: string | null) {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("file://") || /^https?:\/\//i.test(fileUrl)) return fileUrl;
  const base = String(api.defaults.baseURL || "https://attendqr.tech/api").replace(/\/api\/?$/, "");
  return `${base}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
}

export default function WorkspaceRoomProfileNativeScreen({
  token,
  user,
  route,
  navigation,
}: {
  token: string;
  user: User;
  route?: any;
  navigation?: any;
}) {
  const roomId = Number(route?.params?.roomId || 0);
  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [roomMessages, setRoomMessages] = useState<any[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const scrollY = useRef(new Animated.Value(0)).current;

  const roomName = String(room?.name || route?.params?.roomName || "Group");
  const inviteCode = String(room?.invite_code || room?.inviteCode || "").trim();

  const loadData = useCallback(async () => {
    if (!roomId) {
      setLoading(false);
      return;
    }

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
      setRoom(null);
      setMembers([]);
      setRoomMessages([]);
    } finally {
      setLoading(false);
    }
  }, [roomId, token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const membersCountLabel = useMemo(() => {
    const count = members.length;
    if (count === 0) return "No members";
    if (count === 1) return "1 member";
    return `${count} members`;
  }, [members.length]);

  const handleToggleMute = useCallback(async () => {
    const next = !isMuted;
    setIsMuted(next);
    try {
      await AsyncStorage.setItem(roomMuteStorageKey(roomId), next ? "1" : "0");
    } catch {
      setIsMuted(!next);
    }
  }, [isMuted, roomId]);

  const quickActions = [
    { key: "media", title: "Media", icon: <ImageIcon size={22} color={BRAND.primary} /> },
    { key: "files", title: "Files", icon: <FileText size={22} color={BRAND.primary} /> },
    { key: "links", title: "Links", icon: <Link2 size={22} color={BRAND.primary} /> },
  ];

  const filteredMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) return members;
    return members.filter((member) => {
      const text = `${member?.name || ""} ${member?.username || ""} ${member?.role || ""}`.toLowerCase();
      return text.includes(query);
    });
  }, [memberQuery, members]);

  const sharedCounts = useMemo(() => {
    let media = 0;
    let files = 0;
    let links = 0;

    roomMessages.forEach((msg) => {
      const content = String(msg?.content || "");
      const fileUrl = resolveUploadUrl(msg?.file_url || msg?.uploaded_file_url || "");
      const type = String(msg?.type || "").toLowerCase();

      if (/https?:\/\//i.test(content) || type === "link") {
        links += 1;
      }

      if (!fileUrl) return;

      const isMedia =
        type === "image" ||
        type === "video" ||
        /\.(png|jpe?g|gif|webp|mp4|mov|avi|mkv)($|\?)/i.test(fileUrl);

      if (isMedia) {
        media += 1;
      } else {
        files += 1;
      }
    });

    return { media, files, links };
  }, [roomMessages]);

  const handleSearchPress = useCallback(() => {
    setSearchEnabled((prev) => {
      const next = !prev;
      if (!next) setMemberQuery("");
      return next;
    });
  }, []);

  const handleAddPress = useCallback(() => {
    Alert.alert("Add Members", "Member invitation is not available yet in mobile.");
  }, []);

  const handleMorePress = useCallback(() => {
    Alert.alert("Group Actions", "Choose an action", [
      {
        text: "Open Chat",
        onPress: () =>
          navigation?.navigate?.("WorkspaceRoomNative", {
            roomId,
            roomName,
          }),
      },
      {
        text: isMuted ? "Unmute" : "Mute",
        onPress: handleToggleMute,
      },
      {
        text: "Refresh",
        onPress: () => loadData(),
      },
      {
        text: "Cancel",
        style: "cancel",
      },
    ]);
  }, [handleToggleMute, isMuted, loadData, navigation, roomId, roomName]);

  const handleQuickActionPress = useCallback((key: string) => {
    const count = key === "media" ? sharedCounts.media : key === "files" ? sharedCounts.files : sharedCounts.links;
    const label = key === "media" ? "Media" : key === "files" ? "Files" : "Links";

    Alert.alert(label, count > 0 ? `${count} item(s) found in this group.` : `No ${label.toLowerCase()} found yet.`);
  }, [sharedCounts.files, sharedCounts.links, sharedCounts.media]);

  // --- Parallax Animation Values ---
  const headerHeight = 220;
  const avatarScale = scrollY.interpolate({
    inputRange: [-100, 0, headerHeight],
    outputRange: [1.5, 1, 0.5],
    extrapolate: "clamp",
  });
  const avatarTranslateY = scrollY.interpolate({
    inputRange: [-100, 0, headerHeight],
    outputRange: [50, 0, -50],
    extrapolate: "clamp",
  });

  return (
    <SafeAreaView style={styles.screen}>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={BRAND.primary} size="large" />
        </View>
      ) : (
        <Animated.FlatList
          data={filteredMembers}
          keyExtractor={(item, index) => String(item?.user_id || item?.id || index)}
          contentContainerStyle={styles.content}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
          ListHeaderComponent={
            <>
              {/* Telegram-style Hero Card */}
              <View style={styles.heroCard}>
                <Animated.View style={[styles.avatarCircle, { transform: [{ scale: avatarScale }, { translateY: avatarTranslateY }] }]}>
                  <LinearGradient colors={["#3b99e0", "#2176c4"]} style={styles.avatarGradient}>
                    <Text style={styles.avatarText}>{String(roomName).charAt(0).toUpperCase()}</Text>
                  </LinearGradient>
                </Animated.View>

                <Text style={styles.groupName} numberOfLines={1}>{formatThreePartName(roomName)}</Text>
                <Text style={styles.groupSub}>{membersCountLabel}</Text>

                <View style={styles.heroActionsRow}>
                  <Pressable style={styles.heroActionBtn} onPress={handleToggleMute}>
                    {isMuted ? <BellOff size={24} color={BRAND.primary} /> : <Bell size={24} color={BRAND.primary} />}
                    <Text style={styles.heroActionText}>{isMuted ? "Unmute" : "Mute"}</Text>
                  </Pressable>
                  <Pressable style={styles.heroActionBtn} onPress={handleSearchPress}>
                    <Search size={24} color={BRAND.primary} />
                    <Text style={styles.heroActionText}>Search</Text>
                  </Pressable>
                  <Pressable style={styles.heroActionBtn} onPress={handleAddPress}>
                    <UserPlus size={24} color={BRAND.primary} />
                    <Text style={styles.heroActionText}>Add</Text>
                  </Pressable>
                  <Pressable style={styles.heroActionBtn} onPress={handleMorePress}>
                    <Info size={24} color={BRAND.primary} />
                    <Text style={styles.heroActionText}>More</Text>
                  </Pressable>
                </View>

                {searchEnabled ? (
                  <View style={styles.searchBoxWrap}>
                    <TextInput
                      value={memberQuery}
                      onChangeText={setMemberQuery}
                      placeholder="Search members..."
                      placeholderTextColor={BRAND.textMuted}
                      style={styles.searchInput}
                    />
                  </View>
                ) : null}
              </View>

              {/* Info & Shared Media Section */}
              <View style={styles.sectionCard}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Invite Code</Text>
                  <Text style={styles.infoValue}>{inviteCode || "No invite code available"}</Text>
                </View>

                <View style={styles.divider} />
                
                {quickActions.map((action, index) => (
                  <Pressable 
                    key={action.key} 
                    style={({ pressed }) => [styles.rowAction, pressed && styles.rowPressed, index === quickActions.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => handleQuickActionPress(action.key)}
                  >
                    <View style={styles.rowActionLeft}>
                      {action.icon}
                      <Text style={styles.rowTitle}>{action.title}</Text>
                    </View>
                    <View style={styles.rowActionRight}>
                      <Text style={styles.rowSub}>
                        {action.key === "media" ? sharedCounts.media : action.key === "files" ? sharedCounts.files : sharedCounts.links}
                      </Text>
                      <ChevronRight size={18} color={BRAND.border} />
                    </View>
                  </Pressable>
                ))}
              </View>

              <View style={styles.membersHeaderWrap}>
                <Text style={styles.membersHeader}>{membersCountLabel}</Text>
              </View>
            </>
          }
          renderItem={({ item, index }) => {
            const name = formatThreePartName(item?.name || "Unknown User");
            const username = String(item?.username || "").trim();
            const role = String(item?.role || "member");
            const isLast = index === filteredMembers.length - 1;

            return (
              <Pressable
                style={({ pressed }) => [styles.memberRow, pressed && styles.rowPressed, isLast && styles.memberRowLast]}
                android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
                onPress={() => {
                  Alert.alert(name, `${username ? `@${username}` : "No username"}\nRole: ${role}`);
                }}
              >
                <View style={styles.memberAvatar}>
                   <LinearGradient colors={["#66a6ff", "#89f7fe"]} style={styles.memberAvatarGradient}>
                      <Text style={styles.memberAvatarText}>{name.charAt(0).toUpperCase()}</Text>
                   </LinearGradient>
                </View>
                <View style={styles.memberInfo}>
                  <Text numberOfLines={1} style={styles.memberName}>{name}</Text>
                  <Text numberOfLines={1} style={styles.memberMeta}>
                    {username ? `@${username}` : "online"}
                  </Text>
                </View>
                {role === "doctor" && (
                   <Text style={styles.adminBadge}>owner</Text>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.emptyText}>No members to show.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.background },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingBottom: 40 },

  heroCard: {
    backgroundColor: BRAND.surface,
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 16,
    marginBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
  },
  avatarCircle: {
    width: 100, height: 100,
    borderRadius: 50,
    marginBottom: 16,
    shadowColor: BRAND.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5,
  },
  avatarGradient: { flex: 1, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 40, fontWeight: "600", color: "#fff" },
  
  groupName: { fontSize: 22, fontWeight: "500", color: BRAND.text, textAlign: "center", paddingHorizontal: 20 },
  groupSub: { marginTop: 4, fontSize: 14, color: BRAND.textMuted },
  
  heroActionsRow: { flexDirection: "row", justifyContent: "space-evenly", width: "100%", marginTop: 24, paddingHorizontal: 10 },
  heroActionBtn: { alignItems: "center", justifyContent: "center", gap: 6, minWidth: 70 },
  heroActionText: { color: BRAND.primary, fontSize: 12, fontWeight: "500" },
  searchBoxWrap: { width: "100%", paddingHorizontal: 16, marginTop: 14 },
  searchInput: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    backgroundColor: "#f8f9fb",
    color: BRAND.text,
    paddingHorizontal: 12,
    fontSize: 14,
  },

  sectionCard: {
    backgroundColor: BRAND.surface,
    borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: BRAND.border,
    marginBottom: 20,
  },
  infoRow: { paddingHorizontal: 16, paddingVertical: 14 },
  infoLabel: { fontSize: 15, color: BRAND.text },
  infoValue: { fontSize: 14, color: BRAND.textMuted, marginTop: 4 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: BRAND.border, marginLeft: 16 },

  rowAction: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.border, marginLeft: 16, // Telegram style inset separator
  },
  rowPressed: { backgroundColor: "#f9f9f9" },
  rowActionLeft: { flexDirection: "row", alignItems: "center", gap: 16 },
  rowTitle: { fontSize: 16, color: BRAND.text },
  rowActionRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowSub: { fontSize: 14, color: BRAND.textMuted },

  membersHeaderWrap: { paddingHorizontal: 16, paddingBottom: 8, paddingTop: 10 },
  membersHeader: { fontSize: 13, fontWeight: "500", color: BRAND.textMuted, textTransform: "uppercase" },

  memberRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: BRAND.surface,
  },
  memberRowLast: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.border },
  memberAvatar: { width: 46, height: 46, borderRadius: 23, marginRight: 14 },
  memberAvatarGradient: { flex: 1, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  memberAvatarText: { fontSize: 20, fontWeight: "600", color: "#fff" },
  
  memberInfo: { flex: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.border, paddingBottom: 10 },
  memberName: { fontSize: 16, fontWeight: "500", color: BRAND.text },
  memberMeta: { marginTop: 2, fontSize: 13, color: BRAND.textMuted },
  
  adminBadge: { position: "absolute", right: 16, top: 16, fontSize: 13, color: BRAND.textMuted },

  emptyText: { paddingHorizontal: 16, paddingVertical: 20, color: BRAND.textMuted, fontSize: 14, textAlign: "center" },
});