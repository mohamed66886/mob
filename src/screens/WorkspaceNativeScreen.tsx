import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Pressable,
  TextInput,
  FlatList,
  Alert,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { api } from "../lib/api";
import { User } from "../types/auth";
import {
  Edit2,
  Search,
  Plus,
  UserPlus,
  X,
  MessageCircle,
} from "lucide-react-native";
import { getRealtimeSocket } from "../lib/realtime";

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

// Telegram color palette
const BRAND = {
  primary: "#3390ec", // Telegram Blue
  primaryDark: "#2b7cb9",
  surface: "#FFFFFF",
  background: "#FFFFFF", // Telegram chat list is usually fully white
  backgroundMuted: "#f1f2f6",
  text: "#000000",
  textMuted: "#707579",
  border: "#E1E9F2",
  danger: "#e11d48",
  success: "#059669",
  unreadBadge: "#c6d9ea", // Telegram light blue for unread background in some themes, or primary
};

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Helper to generate consistent Telegram-like avatar colors based on name
const getAvatarColor = (name: string) => {
  const colors = ['#e17076', '#faa774', '#a695e7', '#7bc862', '#6ec9cb', '#65aadd', '#ee7aae'];
  const charCode = name.charCodeAt(0) || 0;
  return colors[charCode % colors.length];
};

export default function WorkspaceNativeScreen({
  token,
  user,
  navigation,
}: {
  token: string;
  user: User;
  navigation?: any;
}) {
  const [rooms, setRooms] = useState<WorkspaceRoom[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeType, setActiveType] = useState<"all" | "subject" | "section" | "custom">("all");
  
  // FAB / Modal states
  const [isActionModalVisible, setActionModalVisible] = useState(false);
  const [mobileAction, setMobileAction] = useState<"create" | "join">("create");
  const [newRoomName, setNewRoomName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const socketRef = useRef<any>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomsRef = useRef<WorkspaceRoom[]>([]);

  const roomTypeLabels = {
    all: "All Chats",
    subject: "Subjects",
    section: "Sections",
    custom: "Custom",
  } as const;

  const loadRooms = useCallback(async () => {
    try {
      const res = await api.get("/workspaces/rooms", authHeaders(token));
      setRooms(res.data || []);
    } catch {
      Alert.alert("Error", "Failed to load workspace rooms");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const scheduleRoomsRefresh = useCallback(
    (delay = 200) => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = setTimeout(() => {
        loadRooms();
      }, delay);
    },
    [loadRooms],
  );

  const joinKnownRooms = useCallback((socket: any, nextRooms: WorkspaceRoom[]) => {
    nextRooms.forEach((room) => {
      socket.emit("join_room", { roomId: Number(room.id) });
    });
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    roomsRef.current = rooms;
    if (socketRef.current?.connected) {
      joinKnownRooms(socketRef.current, rooms);
    }
  }, [joinKnownRooms, rooms]);

  useEffect(() => {
    const socket = getRealtimeSocket(token);
    socketRef.current = socket;

    const onConnect = () => {
      joinKnownRooms(socket, roomsRef.current);
      scheduleRoomsRefresh(0);
    };

    const onRoomChanged = () => {
      scheduleRoomsRefresh(250);
    };

    socket.on("connect", onConnect);
    socket.on("receive_message", onRoomChanged);
    socket.on("message_seen", onRoomChanged);
    socket.on("message_updated", onRoomChanged);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("receive_message", onRoomChanged);
      socket.off("message_seen", onRoomChanged);
      socket.off("message_updated", onRoomChanged);
    };
  }, [joinKnownRooms, scheduleRoomsRefresh, token]);

  useEffect(() => {
    if (typeof navigation?.addListener !== "function") return;
    const unsubscribe = navigation.addListener("focus", () => {
      loadRooms();
    });
    return unsubscribe;
  }, [loadRooms, navigation]);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  const filteredRooms = useMemo(() => {
    const byType = activeType === "all" ? rooms : rooms.filter((r) => r.type === activeType);
    const normalizedQuery = searchQuery.trim().toLowerCase();

    // Sort by last activity descending (like Telegram)
    const sorted = [...byType].sort((a, b) => {
      const dateA = new Date(a.last_message_at || a.created_at || 0).getTime();
      const dateB = new Date(b.last_message_at || b.created_at || 0).getTime();
      return dateB - dateA;
    });

    if (!normalizedQuery) return sorted;
    return sorted.filter((room) => {
      const text = `${room.name} ${room.last_message_content || ""} ${room.last_message_sender || ""}`.toLowerCase();
      return text.includes(normalizedQuery);
    });
  }, [activeType, rooms, searchQuery]);

  const createRoom = async () => {
    const name = newRoomName.trim();
    if (name.length < 3) {
      Alert.alert("Validation", "Room name must be at least 3 characters");
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post("/workspaces/rooms", { name }, authHeaders(token));
      setNewRoomName("");
      setActionModalVisible(false);
      loadRooms();
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.error || "Unable to create room");
    } finally {
      setIsSubmitting(false);
    }
  };

  const joinByInvite = async () => {
    if (!inviteCode.trim()) {
      Alert.alert("Validation", "Enter invite code");
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post("/workspaces/rooms/join", { invite_code: inviteCode.trim() }, authHeaders(token));
      setInviteCode("");
      setActionModalVisible(false);
      loadRooms();
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.error || "Invalid invite code");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Telegram-style time formatting (HH:MM if today, otherwise Short Date or Day)
  const formatTime = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    const today = new Date();
    
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    const diffTime = Math.abs(today.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    
    if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MessageCircle color={BRAND.primaryDark} size={28} />
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Workspaces</Text>
            <Text style={styles.headerSubtitle}>{filteredRooms.length} chats</Text>
          </View>
        </View>
      </View>

      {/* Global Search Bar */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchContainer}>
          <Search color={BRAND.textMuted} size={18} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search"
            placeholderTextColor={BRAND.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Telegram-style Folder Tabs */}
      <View style={styles.tabsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {(["all", "subject", "section", "custom"] as const).map((type) => {
            const isActive = activeType === type;
            return (
              <Pressable
                key={type}
                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                onPress={() => setActiveType(type)}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {roomTypeLabels[type]}
                </Text>
                {isActive && <View style={styles.tabIndicator} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );

  const handleOpenRoom = (room: WorkspaceRoom) => {
    setRooms((prev) =>
      prev.map((current) =>
        current.id === room.id ? { ...current, unread_count: 0 } : current,
      ),
    );

    api.put(`/workspaces/rooms/${Number(room.id)}/seen`, {}, authHeaders(token)).catch(() => {});

    const parentNavigation = navigation?.getParent?.();
    const params = { roomId: Number(room.id), roomName: room.name };

    if (typeof parentNavigation?.navigate === "function") {
      parentNavigation.navigate("WorkspaceRoomNative", params);
      return;
    }
    if (typeof navigation?.navigate === "function") {
      navigation.navigate("WorkspaceRoomNative", params);
      return;
    }
    Alert.alert("Navigation Error", "Unable to open room details.");
  };

  const renderRoom = ({ item }: { item: WorkspaceRoom }) => {
    const hasUnread = Number(item.unread_count || 0) > 0;
    
    return (
      <Pressable
        style={({ pressed }) => [
          styles.roomRow,
          pressed && { backgroundColor: BRAND.backgroundMuted },
        ]}
        onPress={() => handleOpenRoom(item)}
      >
        <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.name) }]}>
          <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>

        <View style={styles.roomContent}>
          <View style={styles.roomTopRow}>
            <Text style={styles.roomName} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.roomTime, hasUnread && { color: BRAND.text }]}>
              {formatTime(item.last_message_at || item.created_at)}
            </Text>
          </View>

          <View style={styles.roomBottomRow}>
            <Text style={styles.roomLastMsg} numberOfLines={2}>
              {item.last_message_sender ? (
                <Text style={styles.senderName}>{item.last_message_sender}: </Text>
              ) : null}
              {item.last_message_content || "No messages yet"}
            </Text>

            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unread_count}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={BRAND.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={filteredRooms}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderRoom}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={true}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MessageCircle size={48} color={BRAND.border} strokeWidth={1} />
            <Text style={styles.emptyText}>No chats yet</Text>
          </View>
        }
      />

      {/* Floating Action Button (Telegram style Pencil/Edit icon) */}
      <Pressable 
        style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.95 }] }]} 
        onPress={() => setActionModalVisible(true)}
      >
        <Edit2 color="white" size={24} />
      </Pressable>

      {/* Actions Modal (Create / Join) */}
      <Modal
        visible={isActionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setActionModalVisible(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay} 
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Chat</Text>
              <Pressable onPress={() => setActionModalVisible(false)} style={{ padding: 4 }}>
                <X color={BRAND.textMuted} size={24} />
              </Pressable>
            </View>

            <View style={styles.segmentedControl}>
              <Pressable
                style={[styles.segmentBtn, mobileAction === "create" && styles.segmentBtnActive]}
                onPress={() => setMobileAction("create")}
              >
                <Text style={[styles.segmentText, mobileAction === "create" && styles.segmentTextActive]}>Create Room</Text>
              </Pressable>
              <Pressable
                style={[styles.segmentBtn, mobileAction === "join" && styles.segmentBtnActive]}
                onPress={() => setMobileAction("join")}
              >
                <Text style={[styles.segmentText, mobileAction === "join" && styles.segmentTextActive]}>Join Room</Text>
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <TextInput
                style={styles.modalInput}
                placeholder={mobileAction === "create" ? "Room Name" : "Invite Code"}
                placeholderTextColor={BRAND.textMuted}
                value={mobileAction === "create" ? newRoomName : inviteCode}
                onChangeText={mobileAction === "create" ? setNewRoomName : setInviteCode}
                autoFocus
              />
              <Pressable
                style={[styles.modalActionBtn, isSubmitting && { opacity: 0.7 }]}
                onPress={mobileAction === "create" ? createRoom : joinByInvite}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="white" size="small" />
                ) : mobileAction === "create" ? (
                  <Plus color="white" size={20} />
                ) : (
                  <UserPlus color="white" size={20} />
                )}
                {!isSubmitting && (
                  <Text style={styles.modalActionBtnText}>{mobileAction === "create" ? "Create" : "Join"}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BRAND.background,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) : 0,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  headerContainer: { backgroundColor: BRAND.surface, paddingBottom: 0 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: BRAND.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  headerTitle: { fontSize: 20, fontWeight: "700", color: BRAND.text },
  headerSubtitle: { fontSize: 13, color: BRAND.textMuted, marginTop: 2 },
  
  searchWrapper: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BRAND.backgroundMuted,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38, // Sleek height
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: BRAND.text },

  tabsWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
  },
  tabsScroll: { paddingHorizontal: 8 },
  tabBtn: { paddingVertical: 14, paddingHorizontal: 16, position: "relative" },
  tabBtnActive: {},
  tabText: { fontSize: 15, fontWeight: "600", color: BRAND.textMuted },
  tabTextActive: { color: BRAND.primary },
  tabIndicator: {
    position: "absolute",
    bottom: -1,
    left: 12,
    right: 12,
    height: 3,
    backgroundColor: BRAND.primary,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },

  listContent: { paddingBottom: 80 }, // Padding for FAB

  // Telegram List Item Styles
  roomRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: BRAND.surface,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: { color: "white", fontSize: 20, fontWeight: "600" },
  
  roomContent: {
    flex: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
    paddingBottom: 10,
    paddingTop: 2,
  },
  roomTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  roomName: { fontSize: 16, fontWeight: "600", color: BRAND.text, flex: 1, paddingRight: 8 },
  roomTime: { fontSize: 12, color: BRAND.textMuted },
  
  roomBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roomLastMsg: { fontSize: 15, color: BRAND.textMuted, flex: 1, paddingRight: 12 },
  senderName: { color: BRAND.primary }, // Blue name in last message preview
  
  unreadBadge: {
    backgroundColor: BRAND.primary,
    borderRadius: 12,
    paddingHorizontal: 6,
    minWidth: 24,
    height: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  unreadText: { fontSize: 12, fontWeight: "600", color: "white" },

  emptyState: {
    paddingVertical: 60,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: { color: BRAND.textMuted, fontSize: 16, fontWeight: "500" },

  // Floating Action Button
  fab: {
    position: "absolute",
    right: 16,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BRAND.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    backgroundColor: BRAND.surface,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: BRAND.text },
  
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: BRAND.backgroundMuted,
    margin: 16,
    padding: 4,
    borderRadius: 10,
  },
  segmentBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8 },
  segmentBtnActive: { backgroundColor: BRAND.surface, elevation: 1 },
  segmentText: { fontSize: 14, fontWeight: "600", color: BRAND.textMuted },
  segmentTextActive: { color: BRAND.text },

  modalBody: { padding: 16, paddingTop: 0, gap: 16 },
  modalInput: {
    backgroundColor: BRAND.backgroundMuted,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: BRAND.text,
  },
  modalActionBtn: {
    backgroundColor: BRAND.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  modalActionBtnText: { color: "white", fontSize: 16, fontWeight: "bold" },
});