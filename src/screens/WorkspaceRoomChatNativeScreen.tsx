import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  TextInput,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Linking,
  Modal,
  Animated,
  Vibration,
  PanResponder,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av"; // استخدام expo-av المستقرة بدلاً من expo-audio التجريبية
import { api } from "../lib/api";
import { User } from "../types/auth";
import { getRealtimeSocket } from "../lib/realtime";
import { 
  ArrowLeft, MoreVertical, Phone, Video, Send, Paperclip, Mic, X, 
  File, Play, Pause, Check, CheckCheck, CornerDownLeft, Edit2, Trash2, Camera, Bell, BellOff
} from "lucide-react-native";

const OFFLINE_QUEUE_KEY = "@workspace_queued_messages";
let hasPersistentQueue: boolean | null = null;
let warnedStorageFallback = false;
let memoryQueueStore: QueuedMessage[] = [];

// ألوان تليجرام
const BRAND = {
  primary: "#3390ec", 
  primaryDark: "#2b7cb9",
  surface: "#FFFFFF",
  background: "#9db1cc", 
  text: "#000000",
  textMuted: "#707579",
  border: "#DBE4EF",
  danger: "#e11d48",
  warning: "#f59e0b",
  bubbleMine: "#e3ffc8", 
  bubbleTheirs: "#ffffff",
};

type QueuedMessage = {
  queue_id: string;
  room_id: number;
  content: string;
  type: "text" | "image" | "file" | "voice_note";
  reply_to_message_id: number | null;
  created_at: string;
  attachment?: {
    uri: string;
    name: string;
    mimeType: string;
    category: "image" | "file" | "voice";
    file_url?: string;
  };
};

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

// ==========================================
// مكون السحب للرد (Swipe to Reply)
// ==========================================
const SwipeableMessage = ({ item, onReply, children }: { item: any, onReply: (msg: any) => void, children: React.ReactNode }) => {
  const pan = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (e, gestureState) => {
        return Math.abs(gestureState.dx) > 15 && Math.abs(gestureState.dy) < 15;
      },
      onPanResponderMove: (e, gestureState) => {
        if (gestureState.dx < 0 && gestureState.dx > -60) {
          pan.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (e, gestureState) => {
        if (gestureState.dx < -40) {
          onReply(item); 
        }
        Animated.spring(pan, { toValue: 0, useNativeDriver: true, friction: 5 }).start();
      },
    })
  ).current;

  return (
    <Animated.View style={{ transform: [{ translateX: pan }] }} {...panResponder.panHandlers}>
      {children}
    </Animated.View>
  );
};

// ==========================================
// دوال التخزين (Storage Helpers)
// ==========================================
function warnStorageFallbackOnce() {
  if (warnedStorageFallback) return;
  warnedStorageFallback = true;
  console.warn("AsyncStorage unavailable. Using in-memory queue fallback for this session.");
}

async function canUsePersistentQueue(): Promise<boolean> {
  if (hasPersistentQueue !== null) return hasPersistentQueue;
  try {
    await AsyncStorage.getItem("@queue_probe_key");
    hasPersistentQueue = true;
  } catch {
    hasPersistentQueue = false;
    warnStorageFallbackOnce();
  }
  return hasPersistentQueue;
}

async function readQueueStore(): Promise<QueuedMessage[]> {
  const persistent = await canUsePersistentQueue();
  if (!persistent) return [...memoryQueueStore];
  try {
    const data = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    hasPersistentQueue = false;
    warnStorageFallbackOnce();
    return [...memoryQueueStore];
  }
}

async function writeQueueStore(items: QueuedMessage[]): Promise<void> {
  const persistent = await canUsePersistentQueue();
  if (!persistent) {
    memoryQueueStore = [...items];
    return;
  }
  try {
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
    memoryQueueStore = [...items];
  } catch {
    hasPersistentQueue = false;
    warnStorageFallbackOnce();
    memoryQueueStore = [...items];
  }
}

async function idbGetRoomQueue(roomId: number): Promise<QueuedMessage[]> {
  const all = await readQueueStore();
  return all
    .filter((item: QueuedMessage) => item.room_id === roomId)
    .sort((a: QueuedMessage, b: QueuedMessage) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

async function idbPutQueueItem(item: QueuedMessage): Promise<void> {
  const all = await readQueueStore();
  const existingIndex = all.findIndex((q) => q.queue_id === item.queue_id);
  if (existingIndex >= 0) all[existingIndex] = item;
  else all.push(item);
  await writeQueueStore(all);
}

async function idbDeleteQueueItem(queueId: string): Promise<void> {
  const all = await readQueueStore();
  const filtered = all.filter((q) => q.queue_id !== queueId);
  await writeQueueStore(filtered);
}

function normalizeMessages(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

function normalizeMessageRecord(msg: any) {
  if (!msg) return msg;

  const hasReplyObject = !!msg.replied_message;
  const hasReplyFields = msg.reply_content || msg.reply_sender_name || msg.reply_sender_id;

  return {
    ...msg,
    ...(hasReplyObject || !hasReplyFields
      ? {}
      : {
          replied_message: {
            id: msg.reply_to_message_id,
            sender_id: msg.reply_sender_id,
            sender_name: msg.reply_sender_name || "Unknown",
            content: msg.reply_content || "",
          },
        }),
    reactions: Array.isArray(msg.reactions) ? msg.reactions : [],
  };
}

function normalizeChatMessages(raw: any): any[] {
  return normalizeMessages(raw).map((msg) => normalizeMessageRecord(msg));
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
  return `${base}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
}

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
  const isCallSupported = Constants.appOwnership !== "expo";

  // States
  const [room, setRoom] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typingUserId, setTypingUserId] = useState<number | null>(null);
  const [inputText, setInputText] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<QueuedMessage["attachment"] | null>(null);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [incomingCall, setIncomingCall] = useState<any | null>(null);
  
  // Audio States (expo-av)
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [audioSound, setAudioSound] = useState<Audio.Sound | null>(null);
  const [playingUri, setPlayingUri] = useState<string | null>(null);

  // Interaction States
  const [selectedMessage, setSelectedMessage] = useState<any | null>(null);
  const [showMessageMenu, setShowMessageMenu] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [editingMessage, setEditingMessage] = useState<any | null>(null);
  const [profileUser, setProfileUser] = useState<any | null>(null);
  const [isRoomMuted, setIsRoomMuted] = useState(false);

  // Refs
  const flatListRef = useRef<FlatList>(null);
  const socketRef = useRef<any>(null);
  const queueRef = useRef<QueuedMessage[]>([]);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Animations
  const sendBtnPulse = useRef(new Animated.Value(1)).current;
  const menuScaleAnim = useRef(new Animated.Value(0)).current;
  const waveAnims = useRef(Array.from({ length: 15 }).map(() => new Animated.Value(0.2))).current;

  const setQueueInMemory = useCallback((next: QueuedMessage[]) => {
    queueRef.current = next;
    setQueuedCount(next.length);
  }, []);

  const loadData = useCallback(async () => {
    if (!numericRoomId) {
      setLoading(false);
      return;
    }
    try {
      const headers = { headers: { Authorization: `Bearer ${token}` } };
      const [roomRes, membersRes, messagesRes] = await Promise.all([
        api.get(`/workspaces/rooms/${numericRoomId}`, headers),
        api.get(`/workspaces/rooms/${numericRoomId}/members`, headers),
        api.get(`/workspaces/rooms/${numericRoomId}/messages`, headers),
      ]);

      setRoom(roomRes.data || null);
      setMembers(normalizeMessages(membersRes.data));
      setMessages(normalizeChatMessages(messagesRes.data?.data || messagesRes.data));
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200);
      try {
        await api.put(`/workspaces/rooms/${numericRoomId}/seen`, {}, headers);
      } catch {}
    } catch {
      Alert.alert("خطأ", "فشل تحميل بيانات الغرفة");
    } finally {
      setLoading(false);
    }
  }, [numericRoomId, token]);

  const uploadAttachment = useCallback(
    async (attachment: NonNullable<QueuedMessage["attachment"]>) => {
      const form = new FormData();
      form.append("file", {
        uri: attachment.uri,
        name: attachment.name,
        type: attachment.mimeType,
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
    const queued = await idbGetRoomQueue(numericRoomId);
    setQueueInMemory(queued);
    if (queued.length === 0) return;
    setMessages((prev) => {
      const existingTempIds = new Set(prev.map((m) => String(m?.client_temp_id || "")).filter(Boolean));
      const optimisticQueued = queued
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
        }));
      return optimisticQueued.length > 0 ? [...prev, ...optimisticQueued] : prev;
    });
  }, [numericRoomId, setQueueInMemory, user.id, user.name]);

  useEffect(() => {
    loadData();
    hydrateQueue().catch(() => {});
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

  // تأثير الأمواج وقت التسجيل
  useEffect(() => {
    if (isRecording) {
      const anims = waveAnims.map((anim) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, { toValue: Math.random() * 0.8 + 0.3, duration: 300 + Math.random() * 200, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 0.2, duration: 300 + Math.random() * 200, useNativeDriver: true }),
          ])
        )
      );
      anims.forEach((a) => a.start());
      return () => anims.forEach((a) => a.stop());
    }
  }, [isRecording]);

  const removeQueuedMessage = useCallback(
    async (queueId: string) => {
      const next = queueRef.current.filter((q) => q.queue_id !== queueId);
      setQueueInMemory(next);
      await idbDeleteQueueItem(queueId);
    },
    [setQueueInMemory],
  );

  const handleDeleteMessage = useCallback(
    async (messageId: number) => {
      try {
        setShowMessageMenu(false);
        setSelectedMessage(null);
        const socket = socketRef.current;
        if (!socket?.connected) {
          Alert.alert("لا يوجد اتصال", "لا يمكن حذف الرسالة بدون اتصال بالسيرفر.");
          return;
        }

        socket.emit("delete_message", { messageId: Number(messageId) });

        setMessages((prev) =>
          prev.map((m) =>
            Number(m.id) === Number(messageId)
              ? {
                  ...m,
                  content: "تم حذف هذه الرساله",
                  type: "text",
                  file_url: null,
                  reply_to_message_id: null,
                  replied_message: null,
                  reactions: [],
                }
              : m,
          ),
        );
      } catch {
        Alert.alert("خطأ", "فشل حذف الرسالة");
      }
    },
    [],
  );

  const handleEditMessage = useCallback((message: any) => {
    setInputText(message.content);
    setEditingMessage(message);
    setShowMessageMenu(false);
  }, []);

  const handleReply = useCallback((message: any) => {
    setReplyingTo(message);
    setShowMessageMenu(false);
  }, []);

  const handleReact = useCallback((emoji: string, targetMessage?: any) => {
    const message = targetMessage || selectedMessage;
    if (!message?.id) return;

    const socket = socketRef.current;
    if (!socket?.connected) {
      Alert.alert("لا يوجد اتصال", "تعذر إضافة الرياكت بدون اتصال بالسيرفر.");
      return;
    }

    socket.emit("toggle_reaction", {
      messageId: Number(message.id),
      reaction: emoji,
    });

    setShowMessageMenu(false);
  }, [selectedMessage]);

  const showMessageMenuWithAnimation = useCallback((message: any) => {
    setSelectedMessage(message);
    setShowMessageMenu(true);
    Vibration.vibrate(50);
    menuScaleAnim.setValue(0.5);
    Animated.spring(menuScaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 5,
    }).start();
  }, [menuScaleAnim]);

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

  const flushQueue = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    if (flushingRef.current) return;
    if (queueRef.current.length === 0) return;

    flushingRef.current = true;
    try {
      for (const queued of queueRef.current) {
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
            await idbPutQueueItem(queuedToSend);
          } catch {
            continue;
          }
        }

        socket.emit("send_message", {
          room_id: queuedToSend.room_id,
          content: queuedToSend.content,
          type: queuedToSend.type,
          ...(queuedToSend.attachment?.file_url ? { file_url: queuedToSend.attachment.file_url } : {}),
          reply_to_message_id: queuedToSend.reply_to_message_id,
          client_temp_id: queuedToSend.queue_id,
        });
      }
    } finally {
      flushingRef.current = false;
    }
  }, [setQueueInMemory, uploadAttachment]);

  // Socket Connection
  useEffect(() => {
    if (!numericRoomId) return;

    const socket = getRealtimeSocket(token);
    socketRef.current = socket;

    const handleConnect = () => {
      setIsConnected(true);
      socket.emit("join_room", { roomId: numericRoomId });
      flushQueue();
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const onReceiveMessage = (incoming: any) => {
      if (Number(incoming?.room_id) !== numericRoomId) return;
      const normalizedIncoming = normalizeMessageRecord(incoming);

      setMessages((prev) => {
        if (normalizedIncoming?.client_temp_id) {
          removeQueuedMessage(String(normalizedIncoming.client_temp_id)).catch(() => {});
          const idx = prev.findIndex(
            (msg) => String(msg?.client_temp_id || "") === String(normalizedIncoming.client_temp_id),
          );
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...normalizedIncoming, local_status: "sent" };
            return next;
          }
        }
        if (prev.some((m) => Number(m?.id) === Number(normalizedIncoming?.id))) return prev;
        return [...prev, normalizedIncoming];
      });

      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    };

    const onTyping = (payload: any) => {
      if (Number(payload?.room_id) !== numericRoomId) return;
      if (Number(payload?.user_id) === Number(user?.id)) return;
      setTypingUserId(payload?.is_typing ? Number(payload.user_id) : null);
    };

    const onMessageUpdated = (updatedMessage: any) => {
      if (Number(updatedMessage?.room_id) !== numericRoomId) return;
      const normalizedUpdated = normalizeMessageRecord(updatedMessage);
      setMessages((prev) =>
        prev.map((msg) =>
          Number(msg.id) === Number(normalizedUpdated.id)
            ? { ...msg, ...normalizedUpdated }
            : msg,
        ),
      );
    };

    const onReactionUpdated = (payload: any) => {
      const targetMessageId = Number(payload?.message_id);
      const targetUserId = Number(payload?.user_id);
      const reaction = String(payload?.reaction || "").trim();
      if (!targetMessageId || !targetUserId || !reaction) return;

      setMessages((prev) =>
        prev.map((msg) => {
          if (Number(msg.id) !== targetMessageId) return msg;

          const currentReactions = Array.isArray(msg.reactions) ? msg.reactions : [];
          const exists = currentReactions.some(
            (r: any) => Number(r?.user_id) === targetUserId && String(r?.reaction) === reaction,
          );

          let nextReactions = currentReactions;
          if (payload?.action === "removed" || exists) {
            nextReactions = currentReactions.filter(
              (r: any) => !(Number(r?.user_id) === targetUserId && String(r?.reaction) === reaction),
            );
          } else {
            nextReactions = [...currentReactions, { user_id: targetUserId, reaction }];
          }

          return {
            ...msg,
            reactions: nextReactions,
          };
        }),
      );
    };

    const onCallStarted = (payload: any) => {
      const call = payload?.call;
      if (!call) return;
      if (Number(call.room_id) !== numericRoomId) return;

      const initiatedBy = Number(call.initiated_by || 0);
      if (initiatedBy === Number(user?.id)) return;

      setIncomingCall(call);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("receive_message", onReceiveMessage);
    socket.on("typing", onTyping);
    socket.on("message_updated", onMessageUpdated);
    socket.on("reaction_updated", onReactionUpdated);
    socket.on("call:started", onCallStarted);
    
    if (socket.connected) handleConnect();

    return () => {
      socket.emit("leave_room", { roomId: numericRoomId });
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("receive_message", onReceiveMessage);
      socket.off("typing", onTyping);
      socket.off("message_updated", onMessageUpdated);
      socket.off("reaction_updated", onReactionUpdated);
      socket.off("call:started", onCallStarted);
    };
  }, [flushQueue, numericRoomId, removeQueuedMessage, token, user?.id]);

  const emitTypingState = useCallback(
    (isTyping: boolean) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("typing", { roomId: numericRoomId, isTyping });
    },
    [numericRoomId],
  );

  const handleTextChange = useCallback(
    (value: string) => {
      setInputText(value);
      const nowTyping = value.trim().length > 0;
      emitTypingState(nowTyping);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (nowTyping) {
        typingTimeoutRef.current = setTimeout(() => {
          emitTypingState(false);
        }, 1200);
      }
    },
    [emitTypingState],
  );

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setSelectedAttachment({
          uri: asset.uri,
          name: asset.fileName || `image_${Date.now()}.jpg`,
          mimeType: asset.mimeType || "image/jpeg",
          category: "image",
        });
      }
    } catch (error) {
      Alert.alert("خطأ", "فشل اختيار الصورة");
    }
  };

  const pickImageFromCamera = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("الصلاحيات", "نحتاج صلاحية الكاميرا لالتقاط صورة.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setSelectedAttachment({
          uri: asset.uri,
          name: asset.fileName || `camera_${Date.now()}.jpg`,
          mimeType: asset.mimeType || "image/jpeg",
          category: "image",
        });
      }
    } catch {
      Alert.alert("خطأ", "فشل فتح الكاميرا");
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setSelectedAttachment({
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType || "application/octet-stream",
          category: "file",
        });
      }
    } catch (error) {
      Alert.alert("خطأ", "فشل اختيار الملف");
    }
  };

  const handleToggleRecording = async () => {
    if (isRecording && recording) {
      try {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        setIsRecording(false);
        setRecording(null);

        if (uri) {
          setSelectedAttachment({
            uri,
            name: `voice_${Date.now()}.m4a`,
            mimeType: "audio/m4a",
            category: "voice",
          });
        }
      } catch (err) {
        setIsRecording(false);
        setRecording(null);
      }
      return;
    }

    try {
      const permInfo = await Audio.requestPermissionsAsync();
      if (!permInfo.granted) {
        Alert.alert("الصلاحيات", "نحتاج صلاحية الميكروفون لتسجيل الصوت.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(newRecording);
      setIsRecording(true);
      setRecordingMs(0);
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingMs((prev) => prev + 1000);
      }, 1000);
    } catch (e) {
      Alert.alert("خطأ", "فشل بدء التسجيل");
      setIsRecording(false);
    }
  };

  const togglePlayVoice = async (uri: string) => {
    if (!uri) return;
    try {
      if (playingUri === uri && audioSound) {
        await audioSound.pauseAsync();
        setPlayingUri(null);
        return;
      }

      if (audioSound) {
        await audioSound.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync({ uri });
      setAudioSound(sound);
      setPlayingUri(uri);
      await sound.playAsync();
      
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) setPlayingUri(null);
      });
    } catch {
      Alert.alert("خطأ", "فشل تشغيل المقطع الصوتي");
    }
  };

  const handleSendText = async () => {
    if ((!inputText.trim() && !selectedAttachment) || !numericRoomId || isSending) return;

    setIsSending(true);
    const content = inputText.trim();

    if (editingMessage?.id) {
      try {
        if (!content) {
          Alert.alert("تنبيه", "لا يمكن حفظ رسالة فارغة.");
          setIsSending(false);
          return;
        }

        const socket = socketRef.current;
        if (!socket?.connected) {
          Alert.alert("لا يوجد اتصال", "لا يمكن تعديل الرسالة بدون اتصال بالسيرفر.");
          setIsSending(false);
          return;
        }

        socket.emit("edit_message", {
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
      } finally {
        setIsSending(false);
      }
      return;
    }

    setInputText("");
    emitTypingState(false);

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
    const replyData = replyingTo ? {
      reply_to_message_id: replyToId,
      replied_message: replyingTo 
    } : {};

    const queuedItem: QueuedMessage = {
      queue_id: queueId,
      room_id: numericRoomId,
      content,
      type,
      reply_to_message_id: replyToId,
      created_at: createdAt,
      ...(selectedAttachment ? { attachment: selectedAttachment } : {}),
    };

    setMessages((prev) => [
      ...prev,
      {
        id: `local-${queueId}`,
        room_id: numericRoomId,
        sender_id: user?.id || 0,
        sender_name: user?.name || "You",
        content,
        type,
        created_at: createdAt,
        client_temp_id: queueId,
        local_status: "pending",
        ...replyData,
        ...(selectedAttachment ? { file_url: selectedAttachment.uri } : {}),
      },
    ]);

    setSelectedAttachment(null);
    setReplyingTo(null); 
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    await idbPutQueueItem(queuedItem);
    setQueueInMemory([...queueRef.current, queuedItem]);

    if (socketRef.current?.connected) {
      await flushQueue();
    }

    setIsSending(false);
  };

  const scrollToBottom = useCallback((animated = true) => {
    flatListRef.current?.scrollToEnd({ animated });
    setShowScrollToBottom(false);
  }, []);

  const groupedMessages = useMemo(() => {
    const result: any[] = [];
    let lastDate = "";

    messages.forEach((msg, index) => {
      const msgDate = new Date(msg.created_at).toLocaleDateString();
      
      if (msgDate !== lastDate) {
        result.push({ type: 'date_header', id: `date-${msgDate}`, dateStr: msgDate });
        lastDate = msgDate;
      }

      const prevMsg = messages[index - 1];
      const nextMsg = messages[index + 1];

      const isConsecutivePrev = prevMsg && prevMsg.sender_id === msg.sender_id && new Date(prevMsg.created_at).toLocaleDateString() === msgDate;
      const isConsecutiveNext = nextMsg && nextMsg.sender_id === msg.sender_id && new Date(nextMsg.created_at).toLocaleDateString() === msgDate;

      result.push({
        ...msg,
        isConsecutivePrev,
        isConsecutiveNext
      });
    });

    return result;
  }, [messages]);

  const renderMessage = ({ item }: { item: any }) => {
    if (item.type === 'date_header') {
      return (
        <View style={styles.dateHeaderWrap}>
          <Text style={styles.dateHeaderText}>
            {item.dateStr === new Date().toLocaleDateString() ? 'اليوم' : item.dateStr}
          </Text>
        </View>
      );
    }

    const isMine = Number(item.sender_id) === Number(user?.id);
    const messageState = item.local_status === "pending" ? "pending" : (item.seen ? "read" : "sent");
    const fileUrl = resolveUploadUrl(item.file_url || item.uploaded_file_url || "");
    const isDeletedMessage = String(item.content || "").trim() === "تم حذف هذه الرساله";
    const isImage = item.type === "image" || /\.(png|jpe?g|gif|webp)($|\?)/i.test(fileUrl);
    const isVoice = item.type === "voice_note" || /\.(m4a|aac|mp3|wav|ogg)($|\?)/i.test(fileUrl);
    const isSelected = selectedMessage?.id === item.id;
    const reactionGroups = buildReactionGroups(
      (Array.isArray(item.reactions) ? item.reactions : []).map((r: any) => ({
        ...r,
        mine: Number(r?.user_id) === Number(user?.id),
      })),
    );

    const bubbleStyles = [
      styles.msgBubble,
      isMine ? styles.bubbleMine : styles.bubbleTheirs,
      isMine && item.isConsecutiveNext && { borderBottomRightRadius: 4 },
      isMine && item.isConsecutivePrev && { borderTopRightRadius: 4 },
      !isMine && item.isConsecutiveNext && { borderBottomLeftRadius: 4 },
      !isMine && item.isConsecutivePrev && { borderTopLeftRadius: 4 },
      isSelected && styles.msgBubbleSelected,
    ];

    const messageContent = (
      <View style={styles.messageContentWrap}>
        <View style={bubbleStyles}>
        {item.replied_message && !isDeletedMessage && (
          <View style={[styles.inlineReplyBox, isMine ? styles.inlineReplyMine : styles.inlineReplyTheirs]}>
             <Text style={styles.inlineReplyName}>{formatThreePartName(item.replied_message.sender_name)}</Text>
             <Text style={styles.inlineReplyText} numberOfLines={1}>{item.replied_message.content || 'مرفق'}</Text>
          </View>
        )}

        {fileUrl && !isDeletedMessage ? (
          isImage ? (
            <Pressable onPress={() => setPreviewImageUri(fileUrl)}>
              <Image source={{ uri: fileUrl }} style={styles.imagePreview} resizeMode="cover" />
            </Pressable>
          ) : isVoice ? (
            <Pressable style={[styles.voiceRow, isMine ? {backgroundColor: 'rgba(255,255,255,0.4)'} : {}]} onPress={() => togglePlayVoice(fileUrl)}>
              <View style={[styles.playBtn, isMine ? {backgroundColor: '#4CA952'} : {}]}>
                {playingUri === fileUrl ? <Pause color="white" size={14} /> : <Play color="white" size={14} style={{ marginLeft: 2 }} />}
              </View>
              <View style={styles.voiceWaveArea}>
                {[0.4, 0.7, 0.5, 1, 0.3, 0.8, 0.6, 0.9, 0.4, 0.2, 0.6, 0.8, 0.5, 0.9, 0.3].map((h, i) => (
                  <View key={i} style={[styles.voiceWaveLine, { height: `${h * 100}%`, backgroundColor: isMine ? '#4CA952' : BRAND.primaryDark }]} />
                ))}
              </View>
            </Pressable>
          ) : (
            <Pressable style={styles.fileRow} onPress={() => Linking.openURL(fileUrl).catch(() => {})}>
              <File color={BRAND.primary} size={16} />
              <Text style={styles.fileText}>مرفق</Text>
            </Pressable>
          )
        ) : null}

        <Text style={isDeletedMessage ? styles.msgDeletedText : (isMine ? styles.msgTextMine : styles.msgTextTheirs)}>{item.content}</Text>
        
        <View style={styles.metaRow}>
          <Text style={[styles.msgTime, isMine ? styles.msgTimeMine : styles.msgTimeTheirs]}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
          {isMine ? (
            <View style={styles.tickContainer}>
              {messageState === "pending" ? (
                <ActivityIndicator size={10} color="#355b8f" />
              ) : messageState === "read" ? (
                <CheckCheck size={14} color="#34B7F1" />
              ) : (
                <Check size={14} color="#355b8f" />
              )}
            </View>
          ) : null}
        </View>
        </View>

        {reactionGroups.length > 0 && !isDeletedMessage ? (
          <View style={[styles.reactionChipsRow, isMine ? styles.reactionRowRight : styles.reactionRowLeft]}>
            {reactionGroups.map((group) => (
              <Pressable
                key={`${item.id}-${group.emoji}`}
                style={[styles.reactionChip, group.mine && styles.reactionChipMine]}
                onPress={() => {
                  setSelectedMessage(item);
                  handleReact(group.emoji, item);
                }}
              >
                <Text style={styles.reactionChipEmoji}>{group.emoji}</Text>
                <Text style={styles.reactionChipCount}>{group.count}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );

    return (
      <SwipeableMessage item={item} onReply={handleReply}>
        <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowTheirs]}>
          {!isMine ? (
            <Pressable
              style={styles.senderAvatarBtn}
              onPress={() => {
                const member = members.find((m) => Number(m.user_id) === Number(item.sender_id));
                setProfileUser({
                  user_id: item.sender_id,
                  name: member?.name || item.sender_name || "Unknown User",
                  username: member?.username || item.sender_username || "",
                  user_role: member?.user_role || "member",
                  room_role: member?.role || "member",
                });
              }}
            >
              <Text style={styles.senderAvatarText}>{String(formatThreePartName(item.sender_name || "U")).charAt(0).toUpperCase()}</Text>
            </Pressable>
          ) : null}

          <Pressable
            onLongPress={() => showMessageMenuWithAnimation(item)}
            delayLongPress={400}
            style={[styles.msgWrapper, isMine ? styles.msgRight : styles.msgLeft]}
          >
            {!isMine && !item.isConsecutivePrev && (
              <Text style={styles.senderName}>{formatThreePartName(item.sender_name || "Someone")}</Text>
            )}
            {messageContent}
          </Pressable>
        </View>
      </SwipeableMessage>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => (navigation?.canGoBack?.() ? navigation.goBack() : undefined)}
            >
              <ArrowLeft color={BRAND.text} size={20} />
            </Pressable>
            <View style={styles.headerInfo}>
              <Text numberOfLines={1} style={styles.roomTitle}>
                {String(room?.name || route?.params?.roomName || "Room Chat")}
              </Text>
              <Text numberOfLines={1} style={styles.roomSubtitle}>
                {typingUserId ? "يكتب الآن..." : `${members.length} أعضاء`}
              </Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            {isCallSupported ? (
              <>
                <Pressable style={styles.iconBtn} onPress={() => startCallFromChat("voice")}>
                  <Phone color={BRAND.primaryDark} size={18} />
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={() => startCallFromChat("video")}>
                  <Video color={BRAND.primaryDark} size={18} />
                </Pressable>
              </>
            ) : null}
            <Pressable style={styles.iconBtn} onPress={() => setShowHeaderMenu(true)}>
              <MoreVertical color={BRAND.textMuted} size={18} />
            </Pressable>
          </View>
        </View>

        {/* Chat Area */}
        <View style={styles.chatBackground}>
          {incomingCall ? (
            <View style={styles.incomingCallBar}>
              <Text style={styles.incomingCallText}>
                {incomingCall.call_type === "video" ? "مكالمة فيديو واردة" : "مكالمة صوتية واردة"}
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
                  <Text style={styles.callActionBtnText}>رد</Text>
                </Pressable>
                <Pressable
                  style={[styles.callActionBtn, styles.callDismissBtn]}
                  onPress={() => setIncomingCall(null)}
                >
                  <Text style={styles.callActionBtnText}>رفض</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator color={BRAND.primary} />
              <Text style={styles.emptyText}>جاري التحميل...</Text>
            </View>
          ) : null}
          <FlatList
            ref={flatListRef}
            data={groupedMessages}
            keyExtractor={(item, idx) => String(item.client_temp_id || item.id || idx)}
            renderItem={renderMessage}
            contentContainerStyle={styles.chatList}
            ListEmptyComponent={
              !loading ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>لا توجد رسائل</Text>
                </View>
              ) : null
            }
            onContentSizeChange={() => {
              if (!showScrollToBottom) scrollToBottom(true);
            }}
          />
        </View>

        {/* Reply Preview Above Input */}
        {replyingTo && (
          <View style={styles.replyPreview}>
            <CornerDownLeft size={20} color={BRAND.primary} style={{marginRight: 8}}/>
            <View style={styles.replyPreviewContent}>
              <Text style={styles.replyPreviewLabel}>الرد على {formatThreePartName(replyingTo.sender_name)}</Text>
              <Text style={styles.replyPreviewText} numberOfLines={1}>
                {replyingTo.content || "مرفق"}
              </Text>
            </View>
            <Pressable onPress={() => setReplyingTo(null)} style={{padding: 4}}>
              <X size={20} color={BRAND.textMuted} />
            </Pressable>
          </View>
        )}

        {/* Edit Preview Above Input */}
        {editingMessage && (
          <View style={styles.replyPreview}>
            <View style={styles.replyPreviewContent}>
              <Text style={styles.replyPreviewLabel}>تعديل الرسالة</Text>
              <Text style={styles.replyPreviewText} numberOfLines={1}>
                {editingMessage.content || "رسالة"}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setEditingMessage(null);
                setInputText("");
              }}
              style={{padding: 4}}
            >
              <X size={20} color={BRAND.textMuted} />
            </Pressable>
          </View>
        )}

        {/* Selected Attachment Preview */}
        {selectedAttachment && (
          <View style={styles.replyPreview}>
            <View style={styles.replyPreviewContent}>
              <Text style={styles.replyPreviewLabel}>مرفق جاهز</Text>
              <Text style={styles.replyPreviewText} numberOfLines={1}>
                {selectedAttachment.name}
              </Text>
            </View>
            <Pressable onPress={() => setSelectedAttachment(null)} style={{padding: 4}}>
              <X size={20} color={BRAND.textMuted} />
            </Pressable>
          </View>
        )}

        {/* Composer */}
        <View style={styles.composerContainer}>
          <View style={styles.inputWrapper}>
            {isRecording ? (
              <View style={styles.recordingWavesContainer}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingTime}>
                  {new Date(recordingMs).toISOString().substring(14, 19)}
                </Text>
                <View style={styles.wavesRow}>
                  {waveAnims.map((anim, i) => (
                    <Animated.View key={i} style={[styles.activeWave, { transform: [{ scaleY: anim }] }]} />
                  ))}
                </View>
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="رسالة..."
                  placeholderTextColor={BRAND.textMuted}
                  value={inputText}
                  onChangeText={handleTextChange}
                  multiline
                />
                <Pressable style={styles.attachBtn} onPress={() => {
                  if (editingMessage) {
                    Alert.alert("تنبيه", "ألغِ تعديل الرسالة أولًا لإضافة مرفق جديد.");
                    return;
                  }
                  Alert.alert("مرفق", "اختر نوع المرفق", [
                    { text: "التقاط صورة", onPress: pickImageFromCamera },
                    { text: "صورة", onPress: pickImage },
                    { text: "ملف", onPress: pickDocument },
                    { text: "إلغاء", style: "cancel" },
                  ]);
                }}>
                  {selectedAttachment?.category === "image" ? <Camera color={BRAND.primary} size={20} /> : <Paperclip color={BRAND.textMuted} size={20} />}
                </Pressable>
              </>
            )}
          </View>
          <Animated.View style={{ transform: [{ scale: sendBtnPulse }] }}>
            <Pressable
              style={styles.sendBtn}
              onPress={(inputText.trim() || selectedAttachment) ? handleSendText : handleToggleRecording}
            >
              {(inputText.trim() || selectedAttachment) ? <Send color="white" size={18} style={{marginLeft: -2}} /> : isRecording ? <View style={styles.stopIcon} /> : <Mic color="white" size={20} />}
            </Pressable>
          </Animated.View>
        </View>

      </KeyboardAvoidingView>
      
      {/* Message Context Menu Modal */}
      <Modal visible={showMessageMenu} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowMessageMenu(false)}>
          <Animated.View style={[styles.menuContainer, { transform: [{ scale: menuScaleAnim }] }]}>
            
            {/* Reactions Row */}
            <View style={styles.reactionsRow}>
              {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => (
                <Pressable 
                  key={emoji} 
                  style={styles.reactionEmoji}
                  onPress={() => handleReact(emoji)}
                >
                  <Text style={{ fontSize: 28 }}>{emoji}</Text>
                </Pressable>
              ))}
            </View>

            {/* Menu Options */}
            <View style={styles.menuOptionsBox}>
              <Pressable style={styles.menuOption} onPress={() => handleReply(selectedMessage)}>
                <CornerDownLeft size={20} color={BRAND.text} />
                <Text style={styles.menuOptionText}>رد</Text>
              </Pressable>

              {selectedMessage?.sender_id === user?.id && (
                <>
                  <Pressable style={styles.menuOption} onPress={() => handleEditMessage(selectedMessage)}>
                    <Edit2 size={20} color={BRAND.text} />
                    <Text style={styles.menuOptionText}>تعديل</Text>
                  </Pressable>
                  <Pressable 
                    style={[styles.menuOption, { borderBottomWidth: 0 }]} 
                    onPress={() => {
                      Alert.alert("تأكيد الحذف", "هل تريد حذف هذه الرسالة؟", [
                        { text: "إلغاء", style: "cancel" },
                        {
                          text: "حذف",
                          style: "destructive",
                          onPress: () => handleDeleteMessage(selectedMessage.id),
                        },
                      ]);
                    }}
                  >
                    <Trash2 size={20} color={BRAND.danger} />
                    <Text style={[styles.menuOptionText, { color: BRAND.danger }]}>حذف</Text>
                  </Pressable>
                </>
              )}
            </View>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* User Profile Modal */}
      <Modal visible={!!profileUser} transparent animationType="slide" onRequestClose={() => setProfileUser(null)}>
        <View style={styles.profileOverlay}>
          <View style={styles.profileCard}>
            <View style={styles.profileHeaderRow}>
              <Text style={styles.profileTitle}>الملف الشخصي</Text>
              <Pressable onPress={() => setProfileUser(null)} style={styles.profileCloseBtn}>
                <X size={18} color={BRAND.textMuted} />
              </Pressable>
            </View>

            <View style={styles.profileAvatarLg}>
              <Text style={styles.profileAvatarLgText}>
                {String(formatThreePartName(profileUser?.name || "U")).charAt(0).toUpperCase()}
              </Text>
            </View>

            <Text style={styles.profileName}>{formatThreePartName(profileUser?.name || "Unknown User")}</Text>
            <Text style={styles.profileMeta}>@{String(profileUser?.username || "unknown")}</Text>
            <Text style={styles.profileMeta}>الدور: {String(profileUser?.user_role || "member")}</Text>
            <Text style={styles.profileMeta}>دوره في الغرفة: {String(profileUser?.room_role || "member")}</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={showHeaderMenu} transparent animationType="fade" onRequestClose={() => setShowHeaderMenu(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowHeaderMenu(false)}>
          <View style={styles.headerMenuCard}>
            <Pressable style={styles.headerMenuRow} onPress={openRoomProfile}>
              <Text style={styles.headerMenuText}>Profile</Text>
            </Pressable>
            <Pressable style={[styles.headerMenuRow, styles.headerMenuRowLast]} onPress={toggleRoomMute}>
              <View style={styles.headerMenuMuteRow}>
                {isRoomMuted ? <BellOff color={BRAND.text} size={16} /> : <Bell color={BRAND.text} size={16} />}
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
  screen: { flex: 1, backgroundColor: BRAND.background },
  chatBackground: { flex: 1, backgroundColor: BRAND.background, position: "relative" },
  
  dateHeaderWrap: { alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, marginVertical: 12 },
  dateHeaderText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end' },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowTheirs: { justifyContent: 'flex-start' },
  msgWrapper: { marginBottom: 4, maxWidth: "82%" },
  msgLeft: { alignSelf: "flex-start" },
  msgRight: { alignSelf: "flex-end" },
  senderName: { fontSize: 12, color: BRAND.primaryDark, marginLeft: 6, marginBottom: 2, fontWeight: "700" },
  senderAvatarBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#ffffffcc', borderWidth: 1, borderColor: BRAND.border, alignItems: 'center', justifyContent: 'center', marginRight: 6, marginBottom: 6 },
  senderAvatarText: { fontSize: 12, color: BRAND.primaryDark, fontWeight: '800' },
  messageContentWrap: { maxWidth: '100%' },

  msgBubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, elevation: 1 },
  msgBubbleSelected: { borderWidth: 1, borderColor: BRAND.primary },
  bubbleMine: { backgroundColor: BRAND.bubbleMine },
  bubbleTheirs: { backgroundColor: BRAND.bubbleTheirs },

  msgTextMine: { fontSize: 15, color: BRAND.text, lineHeight: 22 },
  msgTextTheirs: { fontSize: 15, color: BRAND.text, lineHeight: 22 },
  msgDeletedText: { fontSize: 14, color: BRAND.textMuted, lineHeight: 21, fontStyle: 'italic' },

  metaRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 2 },
  msgTime: { fontSize: 11 },
  msgTimeMine: { color: "#68A057" },
  msgTimeTheirs: { color: BRAND.textMuted },
  tickContainer: { marginLeft: 4 },

  inlineReplyBox: { borderLeftWidth: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginBottom: 6, backgroundColor: 'rgba(0,0,0,0.04)' },
  inlineReplyMine: { borderLeftColor: '#4CA952' },
  inlineReplyTheirs: { borderLeftColor: BRAND.primary },
  inlineReplyName: { fontSize: 12, fontWeight: '700', color: BRAND.primaryDark, marginBottom: 2 },
  inlineReplyText: { fontSize: 13, color: BRAND.textMuted },

  composerContainer: { flexDirection: "row", alignItems: "flex-end", padding: 8, paddingBottom: Platform.OS === 'ios' ? 24 : 8, backgroundColor: BRAND.background },
  inputWrapper: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: BRAND.surface, borderRadius: 24, paddingHorizontal: 16, marginRight: 8, minHeight: 48, elevation: 1 },
  input: { flex: 1, fontSize: 16, maxHeight: 120, paddingVertical: 12, textAlign: 'right' },
  
  recordingWavesContainer: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND.danger, marginRight: 8 },
  recordingTime: { color: BRAND.text, fontSize: 15, fontWeight: 'bold', marginRight: 12 },
  wavesRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', height: 24 },
  activeWave: { width: 3, height: 24, backgroundColor: BRAND.primary, borderRadius: 2 },

  replyPreview: { flexDirection: "row", alignItems: "center", backgroundColor: BRAND.surface, paddingHorizontal: 16, paddingVertical: 10, borderTopLeftRadius: 16, borderTopRightRadius: 16, marginHorizontal: 8, marginBottom: -10 },
  replyPreviewContent: { flex: 1, paddingHorizontal: 8 },
  replyPreviewLabel: { fontSize: 13, fontWeight: "600", color: BRAND.primaryDark, marginBottom: 2 },
  replyPreviewText: { fontSize: 14, color: BRAND.text },
  
  attachBtn: { padding: 10, alignSelf: "center" },
  sendBtn: { backgroundColor: BRAND.primary, width: 48, height: 48, borderRadius: 24, justifyContent: "center", alignItems: "center", elevation: 2, marginLeft: 4 },
  stopIcon: { width: 14, height: 14, backgroundColor: "white", borderRadius: 3 },
  
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: BRAND.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.border },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  headerInfo: { marginLeft: 10, flex: 1 },
  roomTitle: { fontSize: 16, fontWeight: "700", color: BRAND.text },
  roomSubtitle: { marginTop: 2, fontSize: 12, color: BRAND.textMuted },
  headerActions: { flexDirection: "row", alignItems: "center", marginLeft: 8 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(51, 144, 236, 0.08)", marginLeft: 6 },
  
  incomingCallBar: { marginHorizontal: 10, marginTop: 10, marginBottom: 4, padding: 10, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: BRAND.border },
  incomingCallText: { fontSize: 13, color: BRAND.text, fontWeight: "600", marginBottom: 8 },
  incomingCallActions: { flexDirection: "row", justifyContent: "flex-end" },
  callActionBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, marginLeft: 8 },
  callAcceptBtn: { backgroundColor: BRAND.primary },
  callDismissBtn: { backgroundColor: BRAND.textMuted },
  callActionBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  
  chatList: { paddingHorizontal: 12, paddingBottom: 24, paddingTop: 10 },
  emptyWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 24 },
  emptyText: { marginTop: 8, fontSize: 13, color: BRAND.textMuted },
  
  imagePreview: { width: 220, height: 220, borderRadius: 12, marginBottom: 4 },
  fileRow: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.05)", padding: 8, borderRadius: 8, marginBottom: 4 },
  fileText: { marginLeft: 8, fontSize: 14, color: BRAND.primaryDark, fontWeight: "500" },
  voiceRow: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.05)", padding: 6, borderRadius: 24, marginBottom: 4, minWidth: 160 },
  playBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: BRAND.primary, alignItems: "center", justifyContent: "center", marginRight: 8 },
  voiceWaveArea: { flex: 1, flexDirection: "row", alignItems: "center", height: 20, marginRight: 8, gap: 2 },
  voiceWaveLine: { width: 2, borderRadius: 1 },

  reactionChipsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, gap: 4 },
  reactionRowRight: { alignSelf: 'flex-end' },
  reactionRowLeft: { alignSelf: 'flex-start' },
  reactionChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: '#d7e4f4' },
  reactionChipMine: { backgroundColor: '#e8f4ff', borderColor: '#9dc9f4' },
  reactionChipEmoji: { fontSize: 13 },
  reactionChipCount: { marginLeft: 4, fontSize: 12, color: BRAND.textMuted, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  menuContainer: { width: '80%', maxWidth: 320 },
  reactionsRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: BRAND.surface, borderRadius: 30, padding: 12, marginBottom: 16 },
  reactionEmoji: { padding: 4 },
  menuOptionsBox: { backgroundColor: BRAND.surface, borderRadius: 16, overflow: 'hidden' },
  menuOption: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BRAND.border },
  menuOptionText: { fontSize: 16, color: BRAND.text, marginLeft: 16, fontWeight: '500' },

  headerMenuCard: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 92 : 72,
    right: 14,
    width: 170,
    backgroundColor: BRAND.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    overflow: 'hidden',
  },
  headerMenuRow: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
    justifyContent: 'center',
  },
  headerMenuRowLast: {
    borderBottomWidth: 0,
  },
  headerMenuText: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.text,
  },
  headerMenuMuteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  profileOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  profileCard: { backgroundColor: BRAND.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 28, minHeight: 320 },
  profileHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileTitle: { fontSize: 18, fontWeight: '700', color: BRAND.text },
  profileCloseBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2f5f8' },
  profileAvatarLg: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#e9f3ff', borderWidth: 1, borderColor: '#bad8f5', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 18, marginBottom: 12 },
  profileAvatarLgText: { fontSize: 34, fontWeight: '800', color: BRAND.primaryDark },
  profileName: { fontSize: 20, fontWeight: '800', color: BRAND.text, textAlign: 'center', marginBottom: 6 },
  profileMeta: { fontSize: 14, color: BRAND.textMuted, textAlign: 'center', marginTop: 4 },
});