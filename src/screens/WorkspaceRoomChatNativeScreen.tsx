import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Modal,
  Animated,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { Image as ExpoImage } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../lib/api";
import {
  DELETED_MESSAGE,
  isSafeHttpsUrl,
  normalizeMessages,
} from "../lib/chatMessageUtils";
import { User } from "../types/auth";
import {
  ArrowLeft,
  MoreVertical,
  Phone,
  Video,
  X,
  Bell,
  BellOff,
} from "lucide-react-native";
import { MessageRow } from "../chat/components/MessageRow";
import { MessageContextMenuModal } from "../chat/components/MessageContextMenuModal";
import { ChatComposer } from "../chat/components/ChatComposer";
import { UserProfileModal } from "../chat/components/UserProfileModal";
import { useDebouncedTyping } from "../chat/hooks/useDebouncedTyping";
import { usePaginatedRoomMessages } from "../chat/hooks/usePaginatedRoomMessages";
import { useSocket } from "../lib/useSocket";
import { useChatAudio } from "../chat/hooks/useChatAudio";
import { useChatAttachments } from "../chat/hooks/useChatAttachments";
import { useMessageActions } from "../chat/hooks/useMessageActions";
import { deleteQueueItem, getRoomQueue, putQueueItem, type QueuedMessage } from "../chat/lib/queueStore";

const BRAND = {
  primary: "#3390ec",
  primaryDark: "#2b7cb9",
  surface: "#FFFFFF",
  background: "#e5ebf1",
  text: "#1c1c1e",
  textMuted: "#8e8e93",
  border: "#D1D5DB",
  danger: "#FF3B30",
  success: "#34C759",
  warning: "#FFCC00",
  bubbleMine: "#e3ffc8",
  bubbleTheirs: "#ffffff",
  inputBg: "#f4f4f5",
};

const MAX_QUEUE_SIZE = 50;
const MAX_SEND_ATTEMPTS = 4;
const SEND_ACK_TIMEOUT_MS = 3000;
const NEAR_BOTTOM_THRESHOLD_PX = 100;

function getRetryDelayMs(attempt: number) {
  return Math.min(1000 * 2 ** attempt, 10000);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isNearBottom(offsetY: number, layoutHeight: number, contentHeight: number) {
  return offsetY + layoutHeight >= contentHeight - NEAR_BOTTOM_THRESHOLD_PX;
}

function formatThreePartName(name?: string | null) {
  const normalized = String(name || "").trim().replace(/\s+/g, " ");
  if (!normalized) return "Unknown User";
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length <= 3) return parts.join(" ");
  return parts.slice(0, 3).join(" ");
}

function roomMuteStorageKey(roomId: number) {
  return `@workspace_room_muted_${roomId}`;
}

function buildReactionGroups(reactions: any[]) {
  const groups = new Map<string, { emoji: string; count: number; mine: boolean }>();
  reactions.forEach((entry) => {
    const emoji = String(entry?.reaction || "").trim();
    if (!emoji) return;
    const current = groups.get(emoji);
    if (current) {
      current.count += 1;
      if (entry?.mine) current.mine = true;
      return;
    }
    groups.set(emoji, {
      emoji,
      count: 1,
      mine: Boolean(entry?.mine),
    });
  });
  return Array.from(groups.values());
}

function resolveUploadUrl(fileUrl?: string | null) {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("file://") || /^https?:\/\//i.test(fileUrl)) return fileUrl;
  const base = String(api.defaults.baseURL || "https://attendqr.tech/api").replace(/\/api\/?$/, "");
  try {
    return new URL(fileUrl, `${base}/`).toString();
  } catch {
    return `${base}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
  }
}

const getAvatarColor = (name: string) => {
  const colors = ['#e17076', '#faa774', '#a695e7', '#7bc862', '#6ec9cb', '#65aadd', '#ee7aae'];
  const charCode = name.charCodeAt(0) || 0;
  return colors[charCode % colors.length];
};

export default function RoomChatNativeScreen({
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
  const numericRoomId = Number(route?.params?.roomId || 0);
  const currentUserId = Number(user?.id || 0);
  const isCallSupported = Constants.appOwnership !== "expo";
  const insets = useSafeAreaInsets();
  const todayStr = useMemo(() => new Date().toLocaleDateString(), []);

  const [room, setRoom] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typingUserId, setTypingUserId] = useState<number | null>(null);
  const [inputText, setInputText] = useState("");
  const [queuedCount, setQueuedCount] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [incomingCall, setIncomingCall] = useState<any | null>(null);

  const [selectedMessage, setSelectedMessage] = useState<any | null>(null);
  const [showMessageMenu, setShowMessageMenu] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [editingMessage, setEditingMessage] = useState<any | null>(null);
  const [profileUser, setProfileUser] = useState<any | null>(null);
  const [isRoomMuted, setIsRoomMuted] = useState(false);

  const membersMap = useMemo(() => {
    const map = new Map<number, any>();
    members.forEach((member) => {
      map.set(Number(member?.user_id || 0), member);
    });
    return map;
  }, [members]);

  const flatListRef = useRef<FlatList>(null);
  const socketRef = useRef<any>(null);
  const queueRef = useRef<QueuedMessage[]>([]);
  const flushingRef = useRef(false);
  const isNearBottomRef = useRef(true);

  const menuScaleAnim = useRef(new Animated.Value(0)).current;

  const { socket, isConnected } = useSocket(token);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  const {
    selectedAttachment,
    setSelectedAttachment,
    pickImage,
    pickImageFromCamera,
    pickDocument,
  } = useChatAttachments();

  const {
    isRecording,
    recordingMs,
    playingUri,
    waveAnims,
    toggleRecording,
    togglePlayVoice,
  } = useChatAudio({
    onVoiceRecorded: (attachment) => setSelectedAttachment(attachment),
  });

  const setQueueInMemory = useCallback((next: QueuedMessage[]) => {
    const capped = next.slice(-MAX_QUEUE_SIZE);
    queueRef.current = capped;
    setQueuedCount(capped.length);
  }, []);

  const {
    messages,
    setMessages,
    groupedMessages,
    hasMoreMessages,
    isLoadingOlderMessages,
    prependingOlderRef,
    loadInitialMessages,
    loadOlderMessages,
  } = usePaginatedRoomMessages({
    roomId: numericRoomId,
    token,
    isScreenLoading: loading,
  });

  const loadData = useCallback(async (signal?: AbortSignal) => {
    if (!numericRoomId) {
      setLoading(false);
      return;
    }
    try {
      const requestConfig = {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      };
      const [roomRes, membersRes] = await Promise.all([
        api.get(`/workspaces/rooms/${numericRoomId}`, requestConfig),
        api.get(`/workspaces/rooms/${numericRoomId}/members`, requestConfig),
      ]);

      setRoom(roomRes.data || null);
      setMembers(normalizeMessages(membersRes.data));
      await loadInitialMessages();
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200);
      try {
        await api.put(`/workspaces/rooms/${numericRoomId}/seen`, {}, requestConfig);
      } catch {}
    } catch (error: any) {
      if (error?.code === "ERR_CANCELED") return;
      Alert.alert("خطأ", "فشل تحميل بيانات الغرفة");
    } finally {
      setLoading(false);
    }
  }, [loadInitialMessages, numericRoomId, token]);

  // Join room and set up listeners
  useEffect(() => {
    if (!isConnected || !numericRoomId) return;

    console.log(`Socket connected, joining room: ${numericRoomId}`);
    socket.emit("join_room", { roomId: numericRoomId });

    const handleNewMessage = (message: any) => {
      if (Number(message?.room_id) !== numericRoomId) return;

      setMessages((prev) => {
        // Avoid duplicates from optimistic UI
        if (message.client_temp_id && prev.some(m => m.client_temp_id === message.client_temp_id)) {
          return prev.map((m) => {
            if (m.client_temp_id !== message.client_temp_id) return m;
            return {
              ...message,
              created_at: m.created_at || message.created_at,
              local_status: "sent",
            };
          });
        }
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, message];
      });

      if (isNearBottomRef.current) {
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    };

    const handleMessageUpdated = (data: any) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (Number(m.id) !== Number(data?.id)) return m;
          return {
            ...m,
            ...data,
            // created_at should be immutable; keep local/stable value to avoid timezone jumps.
            created_at: m.created_at || data?.created_at,
          };
        }),
      );
    };

    const handleTyping = (data: { roomId: number; userId: number }) => {
      if (Number(data.roomId) === numericRoomId && Number(data.userId) !== currentUserId) {
        setTypingUserId(data.userId);
        setTimeout(() => setTypingUserId(null), 2000); // Clear after 2s
      }
    };
    
    const handleIncomingCall = (call: any) => {
      if (Number(call?.room_id) === numericRoomId) {
        setIncomingCall(call);
      }
    };

    socket.on("receive_message", handleNewMessage);
    socket.on("message_updated", handleMessageUpdated);
    socket.on("typing", handleTyping);
    socket.on("incoming_call", handleIncomingCall);

    return () => {
      console.log(`Leaving room: ${numericRoomId}`);
      socket.off("receive_message", handleNewMessage);
      socket.off("message_updated", handleMessageUpdated);
      socket.off("typing", handleTyping);
      socket.off("incoming_call", handleIncomingCall);
    };
  }, [isConnected, numericRoomId, socket, setMessages, currentUserId]);


  // تعديل رفع المرفقات (إصلاح الـ iOS / Android Form-data)
  const uploadAttachment = useCallback(
    async (attachment: NonNullable<QueuedMessage["attachment"]>) => {
      const form = new FormData();
      
      let fileUri = attachment.uri;
      if (Platform.OS === 'ios' && !fileUri.startsWith('file://')) {
        fileUri = `file://${fileUri}`;
      }

      form.append("file", {
        uri: fileUri,
        name: attachment.name || `upload_${Date.now()}`,
        type: attachment.mimeType || "application/octet-stream",
      } as any);

      const res = await api.post(
        `/workspaces/rooms/${numericRoomId}/messages/upload`,
        form,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
        },
      );
      return String(res.data?.file_url || res.data?.url || "");
    },
    [numericRoomId, token],
  );

  const hydrateQueue = useCallback(async () => {
    const queued = await getRoomQueue(numericRoomId);
    const cappedQueue = queued.slice(-MAX_QUEUE_SIZE);
    const dropped = queued.slice(0, Math.max(0, queued.length - MAX_QUEUE_SIZE));
    if (dropped.length > 0) {
      await Promise.allSettled(dropped.map((entry) => deleteQueueItem(entry.queue_id)));
    }

    setQueueInMemory(cappedQueue);
    if (cappedQueue.length === 0) return;
    setMessages((prev) => {
      const existingTempIds = new Set(prev.map((m) => String(m?.client_temp_id || "")).filter(Boolean));
      const optimisticQueued = cappedQueue
        .filter((q) => !existingTempIds.has(q.queue_id))
        .map((q) => ({
          id: `pending-${q.queue_id}`,
          room_id: q.room_id,
          sender_id: user.id,
          sender_name: user.name,
          content: q.content,
          type: q.type,
          created_at: q.created_at,
          client_temp_id: q.queue_id,
          local_status: "pending",
          attachment: q.attachment ? { file_url: q.attachment.uri } : undefined,
        }));
      return optimisticQueued.length > 0 ? [...prev, ...optimisticQueued] : prev;
    });
  }, [numericRoomId, setQueueInMemory, user.id, user.name]);

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    hydrateQueue().catch(() => {});
    return () => {
      controller.abort();
    };
  }, [hydrateQueue, loadData]);

  useEffect(() => {
    let active = true;
    if (!numericRoomId) {
      setIsRoomMuted(false);
      return;
    }

    AsyncStorage.getItem(roomMuteStorageKey(numericRoomId))
      .then((value) => {
        if (!active) return;
        setIsRoomMuted(value === "1");
      })
      .catch(() => {
        if (!active) return;
        setIsRoomMuted(false);
      });

    return () => {
      active = false;
    };
  }, [numericRoomId]);

  const removeQueuedMessage = useCallback(
    async (queueId: string) => {
      const next = queueRef.current.filter((q) => q.queue_id !== queueId);
      setQueueInMemory(next);
      await deleteQueueItem(queueId);
    },
    [setQueueInMemory],
  );

  const openRoomProfile = useCallback(() => {
    setShowHeaderMenu(false);
    navigation?.navigate?.("WorkspaceRoomProfileNative", {
      roomId: numericRoomId,
      roomName: String(room?.name || route?.params?.roomName || "Room Chat"),
    });
  }, [navigation, numericRoomId, room?.name, route?.params?.roomName]);

  const toggleRoomMute = useCallback(async () => {
    const next = !isRoomMuted;
    setShowHeaderMenu(false);
    setIsRoomMuted(next);
    try {
      await AsyncStorage.setItem(roomMuteStorageKey(numericRoomId), next ? "1" : "0");
    } catch {
      setIsRoomMuted(!next);
    }
  }, [isRoomMuted, numericRoomId]);

  const startCallFromChat = useCallback(
    (callType: "voice" | "video") => {
      if (!numericRoomId) return;
      if (!isCallSupported) {
        Alert.alert("Calls Need Dev Build", "WebRTC calls are not supported in Expo Go.");
        return;
      }

      navigation?.navigate?.("WorkspaceCallNative", {
        roomId: numericRoomId,
        roomName: String(room?.name || route?.params?.roomName || "Room Chat"),
        callType,
      });
    },
    [isCallSupported, navigation, numericRoomId, room?.name, route?.params?.roomName],
  );

  // تحديث الـ Queue لمعالجة حالات الفشل
  const flushQueue = useCallback(async () => {
    if (!socket?.connected) return;
    if (flushingRef.current) return;
    if (queueRef.current.length === 0) return;

    flushingRef.current = true;
    try {
      const snapshot = [...queueRef.current];
      for (const queued of snapshot) {
        const stillQueued = queueRef.current.some((entry) => entry.queue_id === queued.queue_id);
        if (!stillQueued) continue;

        let queuedToSend = queued;
        if (queued.attachment && !queued.attachment.file_url) {
          try {
            const uploadedUrl = await uploadAttachment(queued.attachment);
            if (!uploadedUrl) continue;
            queuedToSend = {
              ...queued,
              attachment: {
                ...queued.attachment,
                file_url: uploadedUrl,
              },
            };
            const nextQueue = queueRef.current.map((q) =>
              q.queue_id === queued.queue_id ? queuedToSend : q,
            );
            setQueueInMemory(nextQueue);
            await putQueueItem(queuedToSend);
          } catch {
            continue;
          }
        }

        const payload = {
          room_id: queuedToSend.room_id,
          content: queuedToSend.content,
          type: queuedToSend.type,
          ...(queuedToSend.attachment?.file_url ? { file_url: queuedToSend.attachment.file_url } : {}),
          reply_to_message_id: queuedToSend.reply_to_message_id,
          client_temp_id: queuedToSend.queue_id,
        };

        // Simplified: Fire-and-forget with optimistic UI
        // The `receive_message` handler will confirm the message.
        socket.emit("send_message", payload, (response: any) => {
          if (response?.success) {
            // Update message from pending to sent, using the real ID from server
            setMessages((prev) =>
              prev.map((m) => {
                if (m.client_temp_id !== queuedToSend.queue_id) return m;
                return {
                  ...response.data,
                  created_at: m.created_at || response.data?.created_at,
                  local_status: "sent",
                };
              }),
            );
            removeQueuedMessage(queuedToSend.queue_id);
          } else {
            // Mark as failed
            setMessages(prev => prev.map(m => 
              m.client_temp_id === queuedToSend.queue_id 
                ? { ...m, local_status: 'failed' } 
                : m
            ));
          }
        });
      }
    } finally {
      flushingRef.current = false;
    }
  }, [socket, uploadAttachment, setQueueInMemory, removeQueuedMessage, setMessages]);

  useEffect(() => {
    if (isConnected) {
      flushQueue();
    }
  }, [isConnected, flushQueue]);


  const {
    handleDeleteMessage,
    handleEditMessage,
    handleReply,
    handleReact,
    showMessageMenuWithAnimation,
  } = useMessageActions({
    socketRef,
    selectedMessage,
    menuScaleAnim,
    setMessages,
    setSelectedMessage,
    setShowMessageMenu,
    setInputText,
    setEditingMessage,
    setReplyingTo,
  });

  const emitTypingState = useCallback(
    (isTyping: boolean) => {
      if (!socket?.connected) return;
      socket.emit("typing", { roomId: numericRoomId, isTyping });
    },
    [numericRoomId, socket],
  );

  const { handleTypingValue, stopTypingNow } = useDebouncedTyping(emitTypingState, 1200);

  const handleTextChange = useCallback(
    (value: string) => {
      setInputText(value);
      handleTypingValue(value);
    },
    [handleTypingValue],
  );

  const handleSendText = async () => {
    if ((!inputText.trim() && !selectedAttachment) || !numericRoomId) return;

    setIsSending(true);
    const content = inputText.trim();

    if (editingMessage?.id) {
      if (!content) {
        Alert.alert("تنبيه", "لا يمكن حفظ رسالة فارغة.");
        setIsSending(false);
        return;
      }
      const socketInstance = socketRef.current;
      if (!socketInstance?.connected) {
        Alert.alert("لا يوجد اتصال", "لا يمكن تعديل الرسالة بدون اتصال بالسيرفر.");
        setIsSending(false);
        return;
      }
      socketInstance.emit("edit_message", {
        messageId: Number(editingMessage.id),
        content,
      });
      setMessages((prev) =>
        prev.map((m) =>
          Number(m.id) === Number(editingMessage.id)
            ? {
                ...m,
                content,
                edited: true,
              }
            : m,
        ),
      );
      setInputText("");
      setEditingMessage(null);
      setSelectedAttachment(null);
      setReplyingTo(null);
      setIsSending(false);
      return;
    }

    setInputText("");
    setSelectedAttachment(null);
    setReplyingTo(null);
    stopTypingNow();

    const queueId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();

    const type: QueuedMessage["type"] = selectedAttachment
      ? selectedAttachment.category === "image"
        ? "image"
        : selectedAttachment.category === "voice"
          ? "voice_note"
          : "file"
      : "text";

    const replyToId = replyingTo?.id || null;

    const optimisticMessage: any = {
      id: `local-${queueId}`,
      room_id: numericRoomId,
      sender_id: user?.id || 0,
      sender_name: user?.name || "You",
      content,
      type,
      created_at: createdAt,
      client_temp_id: queueId,
      local_status: "pending",
      reply_to_message_id: replyToId,
      replied_message: replyingTo,
      file_url: selectedAttachment?.uri,
      reactions: [],
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    const queuedItem: QueuedMessage = {
      queue_id: queueId,
      room_id: numericRoomId,
      content,
      type,
      reply_to_message_id: replyToId,
      created_at: createdAt,
      ...(selectedAttachment ? { attachment: selectedAttachment } : {}),
    };

    setQueueInMemory([...queueRef.current, queuedItem]);
    void putQueueItem(queuedItem);

    if (isConnected) {
      void flushQueue();
    }

    setIsSending(false);
  };

  const scrollToBottom = useCallback((animated = true) => {
    if (groupedMessages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated });
    }
    isNearBottomRef.current = true;
    setShowScrollToBottom(false);
  }, [groupedMessages.length]);

  const handleListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const nearBottom = isNearBottom(contentOffset.y, layoutMeasurement.height, contentSize.height);
    isNearBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom);
  }, []);

  const handleOpenAttachment = useCallback(async (fileUrl: string) => {
    if (!isSafeHttpsUrl(fileUrl)) {
      Alert.alert("رابط غير آمن", "يسمح فقط بفتح الروابط الآمنة HTTPS.");
      return;
    }

    try {
      const supported = await Linking.canOpenURL(fileUrl);
      if (!supported) {
        Alert.alert("خطأ", "لا يمكن فتح هذا الرابط على الجهاز.");
        return;
      }
      await Linking.openURL(fileUrl);
    } catch {
      Alert.alert("خطأ", "تعذر فتح المرفق.");
    }
  }, []);

  const renderMessage = useCallback(({ item }: { item: any }) => {
    return (
      <MessageRow
        item={item}
        userId={currentUserId}
        membersMap={membersMap}
        selectedMessageId={selectedMessage?.id}
        todayStr={todayStr}
        playingUri={playingUri}
        styles={styles}
        brandPrimary={BRAND.primary}
        brandPrimaryDark={BRAND.primaryDark}
        deletedMessageText={DELETED_MESSAGE}
        formatThreePartName={formatThreePartName}
        buildReactionGroups={buildReactionGroups}
        resolveUploadUrl={resolveUploadUrl}
        onSetProfileUser={setProfileUser}
        onSetSelectedMessage={setSelectedMessage}
        onReact={handleReact}
        onReply={handleReply}
        onShowMessageMenu={showMessageMenuWithAnimation}
        onPreviewImage={setPreviewImageUri}
        onTogglePlayVoice={togglePlayVoice}
        onOpenAttachment={handleOpenAttachment}
      />
    );
  }, [
    buildReactionGroups,
    formatThreePartName,
    handleOpenAttachment,
    handleReact,
    handleReply,
    membersMap,
    playingUri,
    resolveUploadUrl,
    selectedMessage?.id,
    showMessageMenuWithAnimation,
    todayStr,
    togglePlayVoice,
    currentUserId,
  ]);

  const keyExtractor = useCallback((item: any) => {
    if (item?.id !== undefined && item?.id !== null) return String(item.id);
    if (item?.client_temp_id) return String(item.client_temp_id);
    return `fallback-${String(item?.created_at || "na")}-${String(item?.sender_id || "na")}-${String(item?.type || "msg")}`;
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => (navigation?.canGoBack?.() ? navigation.goBack() : undefined)}
            >
              <ArrowLeft color={BRAND.primary} size={24} />
            </Pressable>
            <Pressable onPress={openRoomProfile} style={styles.headerInfo}>
              <Text numberOfLines={1} style={styles.roomTitle}>
                {String(room?.name || route?.params?.roomName || "Room Chat")}
              </Text>
              <Text numberOfLines={1} style={styles.roomSubtitle}>
                {typingUserId
                  ? "Typing..."
                  : !isConnected
                    ? "Connecting..."
                    : queuedCount > 0
                      ? `${members.length} members • ${queuedCount} sending`
                      : `${members.length} members`}
              </Text>
            </Pressable>
          </View>
          <View style={styles.headerActions}>
            {isCallSupported ? (
              <>
                <Pressable style={styles.headerActionBtn} onPress={() => startCallFromChat("voice")}>
                  <Phone color={BRAND.primary} size={20} />
                </Pressable>
                <Pressable style={styles.headerActionBtn} onPress={() => startCallFromChat("video")}>
                  <Video color={BRAND.primary} size={20} />
                </Pressable>
              </>
            ) : null}
            <Pressable style={styles.headerActionBtn} onPress={() => setShowHeaderMenu(true)}>
              <MoreVertical color={BRAND.textMuted} size={20} />
            </Pressable>
          </View>
        </View>

        <View style={styles.chatBackground}>
          {incomingCall ? (
            <View style={styles.incomingCallBar}>
              <Text style={styles.incomingCallText}>
                {incomingCall.call_type === "video" ? "Incoming Video Call" : "Incoming Voice Call"}
              </Text>
              <View style={styles.incomingCallActions}>
                <Pressable
                  style={[styles.callActionBtn, styles.callAcceptBtn]}
                  onPress={() => {
                    navigation?.navigate?.("WorkspaceCallNative", {
                      roomId: numericRoomId,
                      roomName: String(room?.name || route?.params?.roomName || "Room Chat"),
                      callType: incomingCall.call_type === "voice" ? "voice" : "video",
                      callId: Number(incomingCall.id || 0) || undefined,
                    });
                    setIncomingCall(null);
                  }}
                >
                  <Phone color="white" size={14} style={{ marginRight: 4 }} />
                  <Text style={styles.callActionBtnText}>Answer</Text>
                </Pressable>
                <Pressable
                  style={[styles.callActionBtn, styles.callDismissBtn]}
                  onPress={() => setIncomingCall(null)}
                >
                   <X color="white" size={14} style={{ marginRight: 4 }} />
                  <Text style={styles.callActionBtnText}>Decline</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* التعديل هنا: مبنظهرش الـ ActivityIndicator لو عندنا رسايل مكيشة */}
          {loading && groupedMessages.length === 0 ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator color={BRAND.primary} size="large" />
            </View>
          ) : null}

          <FlatList
            ref={flatListRef}
            data={groupedMessages}
            keyExtractor={keyExtractor}
            renderItem={renderMessage}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={11}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews={Platform.OS === "android"}
            contentContainerStyle={styles.chatList}
            showsVerticalScrollIndicator={false}
            onScroll={handleListScroll}
            scrollEventThrottle={16}
            ListHeaderComponent={
              hasMoreMessages ? (
                <View style={styles.loadOlderWrap}>
                  <Pressable
                    style={[styles.loadOlderBtn, isLoadingOlderMessages && styles.loadOlderBtnDisabled]}
                    onPress={loadOlderMessages}
                    disabled={isLoadingOlderMessages}
                  >
                    {isLoadingOlderMessages ? (
                      <ActivityIndicator size="small" color={BRAND.primary} />
                    ) : (
                      <Text style={styles.loadOlderText}>تحميل رسائل أقدم</Text>
                    )}
                  </Pressable>
                </View>
              ) : null
            }
            ListEmptyComponent={
              !loading && groupedMessages.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <View style={styles.emptyBadge}>
                    <Text style={styles.emptyText}>No messages here yet...</Text>
                  </View>
                </View>
              ) : null
            }
            onContentSizeChange={() => {
              if (isNearBottomRef.current && !prependingOlderRef.current) {
                scrollToBottom(false); // Use non-animated for initial load
              }
            }}
            onLayout={() => {
              // Scroll to bottom on initial layout
              if (isNearBottomRef.current && !prependingOlderRef.current) {
                 setTimeout(() => scrollToBottom(false), 250);
              }
            }}
          />
          {showScrollToBottom ? (
            <Pressable style={styles.scrollToBottomBtn} onPress={() => scrollToBottom(true)}>
              <Text style={styles.scrollToBottomText}>↓</Text>
            </Pressable>
          ) : null}
        </View>

        <ChatComposer
          styles={styles}
          brandPrimary={BRAND.primary}
          brandTextMuted={BRAND.textMuted}
          insetsBottom={insets.bottom}
          replyingTo={replyingTo}
          editingMessage={editingMessage}
          selectedAttachment={selectedAttachment || null}
          isRecording={isRecording}
          recordingMs={recordingMs}
          waveAnims={waveAnims}
          inputText={inputText}
          onChangeText={handleTextChange}
          onSendText={handleSendText}
          onToggleRecording={toggleRecording}
          onPickImageFromCamera={pickImageFromCamera}
          onPickImage={pickImage}
          onPickDocument={pickDocument}
          onCancelReply={() => setReplyingTo(null)}
          onCancelEditing={() => {
            setEditingMessage(null);
            setInputText("");
          }}
          onCancelAttachment={() => setSelectedAttachment(null)}
          formatThreePartName={formatThreePartName}
        />

      </KeyboardAvoidingView>

      <MessageContextMenuModal
        visible={showMessageMenu}
        selectedMessage={selectedMessage}
        currentUserId={Number(user?.id || 0)}
        menuScaleAnim={menuScaleAnim}
        styles={styles}
        brandText={BRAND.text}
        brandDanger={BRAND.danger}
        onClose={() => setShowMessageMenu(false)}
        onReact={handleReact}
        onReply={handleReply}
        onEdit={handleEditMessage}
        onDelete={handleDeleteMessage}
      />

      <UserProfileModal
        profileUser={profileUser}
        styles={styles}
        brandTextMuted={BRAND.textMuted}
        onClose={() => setProfileUser(null)}
        formatThreePartName={formatThreePartName}
        getAvatarColor={getAvatarColor}
      />

        <Modal visible={!!previewImageUri} transparent animationType="fade" onRequestClose={() => setPreviewImageUri(null)}>
          <View style={styles.imageViewerOverlay}>
              <Pressable style={styles.imageViewerClose} onPress={() => setPreviewImageUri(null)}>
                  <X color="white" size={30} />
              </Pressable>
            <ExpoImage
            source={previewImageUri || ""}
            style={styles.imageViewerFull}
            contentFit="contain"
            cachePolicy="memory-disk"
            />
          </View>
      </Modal>

      <Modal visible={showHeaderMenu} transparent animationType="fade" onRequestClose={() => setShowHeaderMenu(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowHeaderMenu(false)}>
          <View style={styles.headerMenuCard}>
            <Pressable style={styles.headerMenuRow} onPress={openRoomProfile}>
              <Text style={styles.headerMenuText}>Room Info</Text>
            </Pressable>
            <Pressable style={[styles.headerMenuRow, styles.headerMenuRowLast]} onPress={toggleRoomMute}>
              <View style={styles.headerMenuMuteRow}>
                {isRoomMuted ? <BellOff color={BRAND.text} size={18} /> : <Bell color={BRAND.text} size={18} />}
                <Text style={styles.headerMenuText}>{isRoomMuted ? "Unmute" : "Mute"}</Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.surface },
  chatBackground: { flex: 1, backgroundColor: BRAND.background, position: "relative" },

  dateHeaderWrap: { alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6, marginVertical: 16 },
  dateHeaderText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 2, width: '100%' },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowTheirs: { justifyContent: 'flex-start' },
  msgWrapper: { maxWidth: "78%" },
  msgLeft: { alignSelf: "flex-start" },
  msgRight: { alignSelf: "flex-end" },
  senderName: { fontSize: 13, color: BRAND.primaryDark, marginLeft: 10, marginBottom: 4, fontWeight: "600" },
  senderAvatarBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: BRAND.primary, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end', marginBottom: 2, marginRight: 8 },
  senderAvatarText: { fontSize: 14, color: '#fff', fontWeight: 'bold' },
  messageContentWrap: { maxWidth: '100%' },

  msgBubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 1 },
  msgBubbleSelected: { borderWidth: 1, borderColor: BRAND.primary },
  bubbleMine: { backgroundColor: BRAND.bubbleMine },
  bubbleTheirs: { backgroundColor: BRAND.bubbleTheirs },

  msgTextMine: { fontSize: 16, color: BRAND.text, lineHeight: 22 },
  msgTextTheirs: { fontSize: 16, color: BRAND.text, lineHeight: 22 },
  msgDeletedText: { fontSize: 15, color: BRAND.textMuted, lineHeight: 22, fontStyle: 'italic' },

  metaRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 4 },
  msgTime: { fontSize: 11, fontWeight: '500' },
  msgTimeMine: { color: "#68A057" },
  msgTimeTheirs: { color: BRAND.textMuted },
  tickContainer: { marginLeft: 4 },

  inlineReplyBox: { borderLeftWidth: 3, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginBottom: 8, backgroundColor: 'rgba(0,0,0,0.05)' },
  inlineReplyMine: { borderLeftColor: '#4CA952' },
  inlineReplyTheirs: { borderLeftColor: BRAND.primary },
  inlineReplyName: { fontSize: 13, fontWeight: '700', color: BRAND.primaryDark, marginBottom: 2 },
  inlineReplyText: { fontSize: 14, color: BRAND.textMuted },

  composerContainer: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingTop: 10, backgroundColor: BRAND.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BRAND.border },
  inputWrapper: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: BRAND.inputBg, borderRadius: 20, paddingHorizontal: 16, minHeight: 40, maxHeight: 120, marginBottom: 10 },
  input: { flex: 1, fontSize: 16, paddingVertical: 10, paddingTop: 10 },

  recordingWavesContainer: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND.danger, marginRight: 8 },
  recordingTime: { color: BRAND.text, fontSize: 15, fontWeight: 'bold', marginRight: 12 },
  wavesRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', height: 24 },
  activeWave: { width: 3, height: 24, backgroundColor: BRAND.primary, borderRadius: 2 },

  replyPreview: { flexDirection: "row", alignItems: "center", backgroundColor: BRAND.inputBg, paddingHorizontal: 16, paddingVertical: 12, borderTopLeftRadius: 16, borderTopRightRadius: 16, marginHorizontal: 8, marginTop: 4 },
  replyPreviewContent: { flex: 1, paddingHorizontal: 8 },
  replyPreviewLabel: { fontSize: 14, fontWeight: "700", color: BRAND.primary, marginBottom: 2 },
  replyPreviewText: { fontSize: 15, color: BRAND.text },
  attachmentThumb: { width: 36, height: 36, borderRadius: 6, marginRight: 12 },

  attachBtn: { padding: 12, paddingBottom: 18 },
  sendBtn: { padding: 8, paddingBottom: 14 },
  sendBtnInner: { width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND.textMuted, justifyContent: 'center', alignItems: 'center' },
  sendBtnInnerActive: { backgroundColor: BRAND.primary },
  stopIcon: { width: 14, height: 14, backgroundColor: "white", borderRadius: 3 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, backgroundColor: BRAND.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.border },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  headerInfo: { marginLeft: 12, flex: 1 },
  roomTitle: { fontSize: 18, fontWeight: "700", color: BRAND.text },
  roomSubtitle: { marginTop: 2, fontSize: 13, color: BRAND.textMuted },
  headerActions: { flexDirection: "row", alignItems: "center" },
  iconBtn: { padding: 8 },
  headerActionBtn: { padding: 10 },

  incomingCallBar: { marginHorizontal: 12, marginTop: 12, marginBottom: 4, padding: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.95)", borderWidth: 1, borderColor: BRAND.primary, shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  incomingCallText: { fontSize: 14, color: BRAND.text, fontWeight: "700", marginBottom: 12 },
  incomingCallActions: { flexDirection: "row", justifyContent: "flex-end" },
  callActionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, marginLeft: 8 },
  callAcceptBtn: { backgroundColor: BRAND.success },
  callDismissBtn: { backgroundColor: BRAND.danger },
  callActionBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  chatList: { paddingHorizontal: 12, paddingBottom: 24, paddingTop: 10 },
  emptyWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  emptyBadge: { backgroundColor: 'rgba(0,0,0,0.1)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  emptyText: { fontSize: 14, color: '#fff', fontWeight: '500' },
  loadOlderWrap: { alignItems: "center", paddingTop: 4, paddingBottom: 10 },
  loadOlderBtn: { backgroundColor: BRAND.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: BRAND.border },
  loadOlderBtnDisabled: { opacity: 0.6 },
  loadOlderText: { color: BRAND.primaryDark, fontSize: 13, fontWeight: '700' },
  scrollToBottomBtn: {
    position: "absolute",
    right: 16,
    bottom: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: BRAND.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  scrollToBottomText: { color: "#fff", fontSize: 22, lineHeight: 24, fontWeight: "700" },

  imagePreview: { width: 240, height: 240, borderRadius: 14, marginBottom: 6 },
  fileRow: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.04)", padding: 10, borderRadius: 12, marginBottom: 6 },
  fileText: { marginLeft: 10, fontSize: 15, color: BRAND.primaryDark, fontWeight: "600" },
  voiceRow: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.04)", padding: 8, borderRadius: 24, marginBottom: 6, minWidth: 180 },
  playBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: BRAND.primary, alignItems: "center", justifyContent: "center", marginRight: 10 },
  voiceWaveArea: { flex: 1, flexDirection: "row", alignItems: "center", height: 24, marginRight: 8, gap: 2 },
  voiceWaveLine: { width: 3, borderRadius: 1.5 },

  reactionChipsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, gap: 6 },
  reactionRowRight: { alignSelf: 'flex-end' },
  reactionRowLeft: { alignSelf: 'flex-start' },
  reactionChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.85)' },
  reactionChipMine: { backgroundColor: '#e8f4ff', borderWidth: 1, borderColor: '#9dc9f4' },
  reactionChipEmoji: { fontSize: 14 },
  reactionChipCount: { marginLeft: 6, fontSize: 13, color: BRAND.textMuted, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  menuContainer: { width: '85%', maxWidth: 340 },
  reactionsRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: BRAND.surface, borderRadius: 30, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  reactionEmoji: { padding: 4 },
  menuOptionsBox: { backgroundColor: BRAND.surface, borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  menuOption: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.border },
  menuOptionText: { fontSize: 17, color: BRAND.text, marginLeft: 16, fontWeight: '500' },

  headerMenuCard: { position: 'absolute', top: Platform.OS === 'ios' ? 95 : 75, right: 16, width: 180, backgroundColor: BRAND.surface, borderRadius: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  headerMenuRow: { minHeight: 48, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.border, justifyContent: 'center' },
  headerMenuRowLast: { borderBottomWidth: 0 },
  headerMenuText: { fontSize: 16, fontWeight: '500', color: BRAND.text },
  headerMenuMuteRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  profileOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  profileCard: { backgroundColor: BRAND.inputBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 },
  profileHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileTitle: { fontSize: 20, fontWeight: '700', color: BRAND.text },
  profileCloseBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.border },
  profileAvatarLg: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 24, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  profileAvatarLgText: { fontSize: 40, fontWeight: '800', color: '#fff' },
  profileName: { fontSize: 22, fontWeight: '700', color: BRAND.text, textAlign: 'center', marginBottom: 4 },
  profileUsername: { fontSize: 16, color: BRAND.primary, textAlign: 'center', marginBottom: 24 },
  profileDetailsBox: { backgroundColor: BRAND.surface, borderRadius: 16, paddingHorizontal: 16 },
  profileDetailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.border },
  profileDetailLabel: { fontSize: 16, color: BRAND.text },
  profileDetailValue: { fontSize: 16, color: BRAND.textMuted, fontWeight: '500', textTransform: 'capitalize' },

  imageViewerOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  imageViewerClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  imageViewerFull: { width: '100%', height: '100%' }
});