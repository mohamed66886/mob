import { useCallback, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../../lib/api";
import { normalizeChatMessages, parseChatDate } from "../../lib/chatMessageUtils";

type UsePaginatedRoomMessagesArgs = {
  roomId: number;
  token: string;
  isScreenLoading: boolean;
  pageSize?: number;
};

// استخدام اسم مميز للكاش عشان ميحصلش تعارض مع أي داتا تانية في التطبيق
const getCacheKey = (roomId: number) => `@attendqr_chat_room_${roomId}`;

export function usePaginatedRoomMessages({
  roomId,
  token,
  isScreenLoading,
  pageSize = 30,
}: UsePaginatedRoomMessagesArgs) {
  const [messages, setMessages] = useState<any[]>([]);
  const [messagesPage, setMessagesPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const prependingOlderRef = useRef(false);

  const groupedMessages = useMemo(() => {
    const result: any[] = [];
    let lastDateStr = "";

    messages.forEach((msg, index) => {
      // معالجة آمنة للتاريخ لتجنب الـ Invalid Date
      const msgDateObj = parseChatDate(msg.created_at) || new Date();
      const msgDate = msgDateObj.toLocaleDateString();

      // إضافة فاصل التاريخ (اليوم)
      if (msgDate !== lastDateStr) {
        result.push({ type: "date_header", id: `date-${msgDate}`, dateStr: msgDate });
        lastDateStr = msgDate;
      }

      const prevMsg = messages[index - 1];
      const nextMsg = messages[index + 1];

      // احتساب الرسايل المتتالية (نفس المرسل + في خلال 5 دقايق) لـ UI أنظف
      const isConsecutivePrev =
        prevMsg &&
        prevMsg.type !== "date_header" &&
        prevMsg.sender_id === msg.sender_id &&
        msgDateObj.getTime() - (parseChatDate(prevMsg.created_at)?.getTime() || msgDateObj.getTime()) < 5 * 60 * 1000;

      const isConsecutiveNext =
        nextMsg &&
        nextMsg.type !== "date_header" &&
        nextMsg.sender_id === msg.sender_id &&
        (parseChatDate(nextMsg.created_at)?.getTime() || msgDateObj.getTime()) - msgDateObj.getTime() < 5 * 60 * 1000;

      result.push({
        ...msg,
        isConsecutivePrev,
        isConsecutiveNext,
      });
    });

    return result;
  }, [messages]);

  const loadInitialMessages = useCallback(async () => {
    if (!roomId) return;
    const cacheKey = getCacheKey(roomId);

    // 1. قراءة الداتا من الكاش وعرضها فوراً (Offline First)
    try {
      const cachedData = await AsyncStorage.getItem(cacheKey);
      if (cachedData) {
        const parsedCache = JSON.parse(cachedData);
        if (parsedCache && parsedCache.length > 0) {
          setMessages(parsedCache);
        }
      }
    } catch (error) {
      console.warn("Cache read error:", error);
    }

    // 2. جلب الداتا الجديدة من السيرفر في الخلفية
    try {
      const res = await api.get(`/workspaces/rooms/${roomId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          page: 1,
          limit: pageSize,
        },
      });

      const freshMessages = normalizeChatMessages(res.data?.data || res.data);
      
      // 3. تحديث الـ State والكاش بالداتا الفريش
      setMessages(freshMessages);
      setMessagesPage(1);
      setHasMoreMessages(Boolean(res.data?.pagination?.hasMore));

      await AsyncStorage.setItem(cacheKey, JSON.stringify(freshMessages));
    } catch (error) {
      // لو السيرفر واقع أو مفيش نت، المستخدم لسه شايف الرسايل اللي في الكاش
      console.warn("Failed to fetch fresh messages:", error);
    }
  }, [pageSize, roomId, token]);

  const loadOlderMessages = useCallback(async () => {
    if (!roomId || isScreenLoading || isLoadingOlderMessages || !hasMoreMessages) return;

    setIsLoadingOlderMessages(true);
    try {
      const nextPage = messagesPage + 1;
      const res = await api.get(`/workspaces/rooms/${roomId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          page: nextPage,
          limit: pageSize,
        },
      });

      const olderMessages = normalizeChatMessages(res.data?.data || res.data);
      if (olderMessages.length > 0) {
        prependingOlderRef.current = true;
        setMessages((prev) => {
          const existingIds = new Set(prev.map((msg) => String(msg?.id || "")).filter(Boolean));
          const uniqueOlder = olderMessages.filter((msg) => !existingIds.has(String(msg?.id || "")));
          return uniqueOlder.length > 0 ? [...uniqueOlder, ...prev] : prev;
        });

        setTimeout(() => {
          prependingOlderRef.current = false;
        }, 200);
      }

      setMessagesPage(nextPage);
      setHasMoreMessages(Boolean(res.data?.pagination?.hasMore));
    } catch {
      // Keep UI stable on network failures
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [hasMoreMessages, isLoadingOlderMessages, isScreenLoading, messagesPage, pageSize, roomId, token]);

  return {
    messages,
    setMessages,
    groupedMessages,
    hasMoreMessages,
    isLoadingOlderMessages,
    prependingOlderRef,
    loadInitialMessages,
    loadOlderMessages,
  };
}