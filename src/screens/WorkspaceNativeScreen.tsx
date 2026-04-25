import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  withSpring,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { api } from "../lib/api";
import {
  Edit2,
  Search,
  Plus,
  UserPlus,
  X,
  MessageCircle,
  Hash,
  Users,
  BookOpen
} from "lucide-react-native";
import { useSocket } from "../lib/useSocket";

type WorkspaceRoom = {
  id: number;
  name: string;
  type: "subject" | "section" | "custom";
  last_message_content?: string;
  last_message_sender?: string;
  last_message_at?: string;
  created_at?: string;
  unread_count?: number;
};

const BRAND = {
  primary: "#3390ec",
  primaryDark: "#2b7cb9",
  surface: "#FFFFFF",
  background: "#FFFFFF",
  backgroundMuted: "#f4f4f5",
  text: "#1c1c1e",
  textMuted: "#8e8e93",
  border: "#E5E5EA",
  danger: "#FF3B30",
  success: "#34C759",
  unreadBadge: "#3390ec",
};

const CREATE_ROOM_FROZEN = true;

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

const getAvatarColor = (name: string) => {
  const colors = ['#e17076', '#faa774', '#a695e7', '#7bc862', '#6ec9cb', '#65aadd', '#ee7aae'];
  const charCode = name.charCodeAt(0) || 0;
  return colors[charCode % colors.length];
};

// تم حل مشكلة التواريخ (Timezones) هنا
const parseServerDate = (value?: string) => {
  if (!value) return null;

  const normalized = String(value).trim();
  if (!normalized) return null;

  let isoString = normalized;
  if (!normalized.includes("T")) {
    isoString = normalized.replace(" ", "T");
  }
  // إجبار التعامل كـ UTC لو مفيش Timezone مبعوتة
  if (!isoString.endsWith("Z") && !isoString.includes("+") && !isoString.includes("-")) {
    isoString += "Z"; 
  }

  const date = new Date(isoString);
  if (!Number.isNaN(date.getTime())) return date;

  return null;
};

const formatTime = (value?: string) => {
  const date = parseServerDate(value);
  if (!date) return "";

  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays >= 1 && diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

const SkeletonChatRow = () => {
  const opacity = useSharedValue(0.5);
  useEffect(() => { opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true); }, []);
  return (
    <Animated.View style={[styles.roomRow, { opacity }]}>
      <View style={[styles.avatar, { backgroundColor: BRAND.border }]} />
      <View style={styles.roomContent}>
        <View style={styles.roomTopRow}>
          <View style={{ width: "40%", height: 16, backgroundColor: BRAND.border, borderRadius: 4 }} />
          <View style={{ width: "10%", height: 12, backgroundColor: BRAND.border, borderRadius: 4 }} />
        </View>
        <View style={{ width: "70%", height: 14, backgroundColor: BRAND.border, borderRadius: 4, marginTop: 6 }} />
      </View>
    </Animated.View>
  );
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const RoomItem = React.memo(({ item, index, onPress }: { item: WorkspaceRoom, index: number, onPress: (r: WorkspaceRoom) => void }) => {
  const scale = useSharedValue(1);
  const hasUnread = Number(item.unread_count || 0) > 0;

  return (
    <Animated.View entering={FadeInDown.delay(index * 30).springify().damping(14)}>
      <AnimatedPressable
        onPressIn={() => (scale.value = withSpring(0.98))}
        onPressOut={() => (scale.value = withSpring(1))}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress(item);
        }}
        style={[{ transform: [{ scale }] }, styles.roomRow]}
      >
        <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.name) }]}>
          <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>

        <View style={styles.roomContent}>
          <View style={styles.roomTopRow}>
            <Text style={styles.roomName} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.roomTime, hasUnread && { color: BRAND.primary, fontWeight: "600" }]}>
              {formatTime(item.last_message_at || item.created_at)}
            </Text>
          </View>

          <View style={styles.roomBottomRow}>
            <Text style={[styles.roomLastMsg, hasUnread && { color: BRAND.text }]} numberOfLines={2}>
              {item.last_message_sender ? <Text style={styles.senderName}>{item.last_message_sender}: </Text> : null}
              {item.last_message_content || "No messages yet"}
            </Text>

            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unread_count}</Text>
              </View>
            )}
          </View>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
});

export default function WorkspaceNativeScreen({ token, user, navigation }: any) {
  const insets = useSafeAreaInsets();
  const [rooms, setRooms] = useState<WorkspaceRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeType, setActiveType] = useState<"all" | "subject" | "section" | "custom">("all");
  
  const [isActionModalVisible, setActionModalVisible] = useState(false);
  const [mobileAction, setMobileAction] = useState<"create" | "join">(CREATE_ROOM_FROZEN ? "join" : "create");
  const [newRoomName, setNewRoomName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const roomsRef = useRef<WorkspaceRoom[]>([]);
  const { socket, isConnected } = useSocket(token);

  const loadRooms = useCallback(async () => {
    try {
      const res = await api.get("/workspaces/rooms", authHeaders(token));
      setRooms(res.data || []);
    } catch {
      Alert.alert("Error", "Failed to load workspace rooms");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  // Centralized socket event handling
  useEffect(() => {
    if (!isConnected) return;

    // Join all known rooms on connect
    roomsRef.current.forEach((room) => {
      console.log(`Joining room on connect: ${room.id}`);
      socket.emit("join_room", { roomId: Number(room.id) });
    });

    const handleRoomUpdate = (data?: { room_id?: number }) => {
      console.log("Received room update event:", data);
      // Optimistically update or refresh the list
      loadRooms();
    };

    socket.on("receive_message", handleRoomUpdate);
    socket.on("message_seen", handleRoomUpdate);
    socket.on("message_updated", handleRoomUpdate);
    socket.on("room_created", handleRoomUpdate); // Listen for new rooms
    socket.on("user_joined_room", handleRoomUpdate); // Listen for new members

    return () => {
      socket.off("receive_message", handleRoomUpdate);
      socket.off("message_seen", handleRoomUpdate);
      socket.off("message_updated", handleRoomUpdate);
      socket.off("room_created", handleRoomUpdate);
      socket.off("user_joined_room", handleRoomUpdate);
    };
  }, [isConnected, socket, loadRooms]);


  const filteredRooms = useMemo(() => {
    const byType = activeType === "all" ? rooms : rooms.filter((r) => r.type === activeType);
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const sorted = [...byType].sort((a, b) => new Date(b.last_message_at || b.created_at || 0).getTime() - new Date(a.last_message_at || a.created_at || 0).getTime());

    if (!normalizedQuery) return sorted;
    return sorted.filter((room) => `${room.name} ${room.last_message_content || ""} ${room.last_message_sender || ""}`.toLowerCase().includes(normalizedQuery));
  }, [activeType, rooms, searchQuery]);

  const handleAction = async () => {
    const isCreate = mobileAction === "create";
    const value = isCreate ? newRoomName.trim() : inviteCode.trim();

    if (isCreate && CREATE_ROOM_FROZEN) {
      Alert.alert("Temporarily Unavailable", "Create room is disabled right now.");
      return;
    }
    
    if (isCreate && value.length < 3) return Alert.alert("Validation", "Room name must be at least 3 characters");
    if (!isCreate && !value) return Alert.alert("Validation", "Enter invite code");

    setIsSubmitting(true);
    try {
      if (isCreate) await api.post("/workspaces/rooms", { name: value }, authHeaders(token));
      else await api.post("/workspaces/rooms/join", { invite_code: value }, authHeaders(token));
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewRoomName(""); setInviteCode(""); setActionModalVisible(false);
      loadRooms();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", err.response?.data?.error || `Unable to ${isCreate ? "create" : "join"} room`);
    } finally { setIsSubmitting(false); }
  };

  const handleOpenRoom = useCallback((room: WorkspaceRoom) => {
    setRooms((prev) => prev.map((current) => current.id === room.id ? { ...current, unread_count: 0 } : current));
    api.put(`/workspaces/rooms/${Number(room.id)}/seen`, {}, authHeaders(token)).catch(() => {});

    const params = { roomId: Number(room.id), roomName: room.name };
    const parentNavigation = navigation?.getParent?.();
    if (typeof parentNavigation?.navigate === "function") return parentNavigation.navigate("WorkspaceRoomNative", params);
    if (typeof navigation?.navigate === "function") return navigation.navigate("WorkspaceRoomNative", params);
  }, [navigation, token]);

  const headerComponent = useMemo(
    () => (
      <View style={styles.headerContainer}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <Text style={styles.headerTitle}>Chats</Text>
          <Pressable
            style={styles.headerEditBtn}
            onPress={() => {
              if (CREATE_ROOM_FROZEN) setMobileAction("join");
              setActionModalVisible(true);
            }}
          >
            <Edit2 color={BRAND.primary} size={22} />
          </Pressable>
        </View>

        <View style={styles.searchWrapper}>
          <View style={styles.searchContainer}>
            <Search color={BRAND.textMuted} size={20} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for messages or users"
              placeholderTextColor={BRAND.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")}>
                <X color={BRAND.textMuted} size={18} />
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.tabsWrapper}>
          <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
            {(["all", "subject", "section", "custom"] as const).map((type) => {
              const isActive = activeType === type;
              const getIcon = () => {
                if (type === "all") return <MessageCircle size={16} color={isActive ? BRAND.primary : BRAND.textMuted} />;
                if (type === "subject") return <BookOpen size={16} color={isActive ? BRAND.primary : BRAND.textMuted} />;
                if (type === "section") return <Users size={16} color={isActive ? BRAND.primary : BRAND.textMuted} />;
                return <Hash size={16} color={isActive ? BRAND.primary : BRAND.textMuted} />;
              };
              return (
                <Pressable key={type} style={[styles.tabBtn, isActive && styles.tabBtnActive]} onPress={() => { Haptics.selectionAsync(); setActiveType(type); }}>
                  {getIcon()}
                  <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </Animated.ScrollView>
        </View>
      </View>
    ),
    [activeType, insets.top, searchQuery],
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      {headerComponent}
      
      <Animated.FlatList
        data={loading ? Array.from({ length: 7 }) as any : filteredRooms}
        keyExtractor={loading ? (_, index) => `skel-${index}` : (item) => item.id.toString()}
        renderItem={loading ? () => <SkeletonChatRow /> : ({ item, index }) => <RoomItem item={item} index={index} onPress={handleOpenRoom} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          loading ? null : (
            <Animated.View entering={FadeIn} style={styles.emptyState}>
              <View style={styles.emptyIconBg}><MessageCircle size={56} color={BRAND.primary} strokeWidth={1.5} /></View>
              <Text style={styles.emptyTitle}>No Chats Yet</Text>
              <Text style={styles.emptyText}>Join a section or create a custom room to start messaging.</Text>
            </Animated.View>
          )
        }
      />

      <AnimatedPressable 
        style={({ pressed }) => [styles.fab, { bottom: insets.bottom + 20 }, pressed && { transform: [{ scale: 0.92 }] }]} 
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          if (CREATE_ROOM_FROZEN) setMobileAction("join");
          setActionModalVisible(true);
        }}
      >
        <Edit2 color="white" size={26} strokeWidth={2.5} />
      </AnimatedPressable>

      <Modal visible={isActionModalVisible} transparent animationType="slide" onRequestClose={() => setActionModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={styles.modalBackdrop} onPress={() => setActionModalVisible(false)} />
          <View style={[styles.modalContent, { paddingBottom: insets.bottom || 20 }]}>
            <View style={styles.modalHandleContainer}><View style={styles.modalHandle} /></View>
            
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Conversation</Text>
              <Pressable onPress={() => setActionModalVisible(false)} style={styles.closeBtn}>
                <X color={BRAND.textMuted} size={22} strokeWidth={2.5} />
              </Pressable>
            </View>

            <View style={styles.segmentedControl}>
              <Pressable
                style={[
                  styles.segmentBtn,
                  mobileAction === "create" && styles.segmentBtnActive,
                  CREATE_ROOM_FROZEN && styles.segmentBtnDisabled,
                ]}
                onPress={() => {
                  if (CREATE_ROOM_FROZEN) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    Alert.alert("Temporarily Unavailable", "Create room is disabled right now.");
                    return;
                  }
                  Haptics.selectionAsync();
                  setMobileAction("create");
                }}
                disabled={CREATE_ROOM_FROZEN}
              >
                <Text
                  style={[
                    styles.segmentText,
                    mobileAction === "create" && styles.segmentTextActive,
                    CREATE_ROOM_FROZEN && styles.segmentTextDisabled,
                  ]}
                >
                  Create Room
                </Text>
              </Pressable>
              <Pressable style={[styles.segmentBtn, mobileAction === "join" && styles.segmentBtnActive]} onPress={() => { Haptics.selectionAsync(); setMobileAction("join"); }}>
                <Text style={[styles.segmentText, mobileAction === "join" && styles.segmentTextActive]}>Join via Code</Text>
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <TextInput
                style={styles.modalInput}
                placeholder={mobileAction === "create" ? "e.g., Study Group" : "Paste Invite Code"}
                placeholderTextColor={BRAND.textMuted}
                value={mobileAction === "create" ? newRoomName : inviteCode}
                onChangeText={mobileAction === "create" ? setNewRoomName : setInviteCode}
                autoFocus
              />
              <Pressable style={({ pressed }) => [styles.modalActionBtn, (isSubmitting || pressed) && { opacity: 0.8 }]} onPress={handleAction} disabled={isSubmitting}>
                {isSubmitting ? <ActivityIndicator color="white" /> : mobileAction === "create" ? <Plus color="white" size={22} /> : <UserPlus color="white" size={22} />}
                {!isSubmitting && <Text style={styles.modalActionBtnText}>{mobileAction === "create" ? "Create Room" : "Join Room"}</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.background },
  headerContainer: { backgroundColor: BRAND.surface, paddingBottom: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 28, fontWeight: "800", color: BRAND.text, letterSpacing: -0.5 },
  headerEditBtn: { padding: 8, backgroundColor: BRAND.backgroundMuted, borderRadius: 20 },
  
  searchWrapper: { paddingHorizontal: 16, paddingBottom: 12 },
  searchContainer: { flexDirection: "row", alignItems: "center", backgroundColor: BRAND.backgroundMuted, borderRadius: 12, paddingHorizontal: 14, height: 44 },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 16, color: BRAND.text },

  tabsWrapper: { paddingBottom: 8 },
  tabsScroll: { paddingHorizontal: 16, gap: 10 },
  tabBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: BRAND.backgroundMuted, gap: 6 },
  tabBtnActive: { backgroundColor: BRAND.primary + "15" },
  tabText: { fontSize: 15, fontWeight: "600", color: BRAND.textMuted },
  tabTextActive: { color: BRAND.primary },

  listContent: { paddingBottom: 100 },

  roomRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, backgroundColor: BRAND.surface },
  avatar: { width: 54, height: 54, borderRadius: 27, justifyContent: "center", alignItems: "center", marginRight: 14 },
  avatarText: { color: "white", fontSize: 22, fontWeight: "700" },
  
  roomContent: { flex: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.border, paddingBottom: 14, paddingTop: 2 },
  roomTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  roomName: { fontSize: 17, fontWeight: "700", color: BRAND.text, flex: 1, paddingRight: 8, letterSpacing: -0.3 },
  roomTime: { fontSize: 13, color: BRAND.textMuted, fontWeight: "500" },
  
  roomBottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  roomLastMsg: { fontSize: 15, color: BRAND.textMuted, flex: 1, paddingRight: 16, lineHeight: 20 },
  senderName: { color: BRAND.primary, fontWeight: "600" },
  
  unreadBadge: { backgroundColor: BRAND.unreadBadge, borderRadius: 12, paddingHorizontal: 8, minWidth: 24, height: 24, justifyContent: "center", alignItems: "center" },
  unreadText: { fontSize: 13, fontWeight: "700", color: "white" },

  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 80, paddingHorizontal: 32 },
  emptyIconBg: { width: 96, height: 96, borderRadius: 48, backgroundColor: BRAND.primary + "10", justifyContent: "center", alignItems: "center", marginBottom: 20 },
  emptyTitle: { color: BRAND.text, fontSize: 20, fontWeight: "800", marginBottom: 8 },
  emptyText: { color: BRAND.textMuted, fontSize: 15, fontWeight: "500", textAlign: "center", lineHeight: 22 },

  fab: { position: "absolute", right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: BRAND.primary, justifyContent: "center", alignItems: "center", shadowColor: BRAND.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },

  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  modalContent: { backgroundColor: BRAND.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 10 },
  modalHandleContainer: { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
  modalHandle: { width: 40, height: 5, backgroundColor: BRAND.border, borderRadius: 3 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: BRAND.text },
  closeBtn: { backgroundColor: BRAND.backgroundMuted, padding: 6, borderRadius: 20 },
  
  segmentedControl: { flexDirection: "row", backgroundColor: BRAND.backgroundMuted, marginHorizontal: 20, marginBottom: 20, padding: 4, borderRadius: 14 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  segmentBtnActive: { backgroundColor: BRAND.surface, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  segmentBtnDisabled: { opacity: 0.5 },
  segmentText: { fontSize: 14, fontWeight: "700", color: BRAND.textMuted },
  segmentTextActive: { color: BRAND.text },
  segmentTextDisabled: { color: BRAND.textMuted },

  modalBody: { paddingHorizontal: 20, gap: 16 },
  modalInput: { backgroundColor: BRAND.backgroundMuted, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: BRAND.text },
  modalActionBtn: { backgroundColor: BRAND.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 14, gap: 8, marginTop: 4 },
  modalActionBtnText: { color: "white", fontSize: 17, fontWeight: "700" },
});