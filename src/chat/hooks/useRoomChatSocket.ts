import { useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import SocketManager from "../../lib/realtime";
import { normalizeMessageRecord } from "../../lib/chatMessageUtils";

type UseRoomChatSocketParams = {
  roomId: number;
  token: string;
  currentUserId: number;
  flushQueue: () => void | Promise<void>;
  removeQueuedMessage: (queueId: string) => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  setTypingUserId: (userId: number | null) => void;
  setIncomingCall: (call: any) => void;
  onMessageReceived: () => void;
};

export function useRoomChatSocket({
  roomId,
  token,
  currentUserId,
  flushQueue,
  removeQueuedMessage,
  setMessages,
  setTypingUserId,
  setIncomingCall,
  onMessageReceived,
}: UseRoomChatSocketParams) {
  const socketRef = useRef<any>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!roomId) return;

    const socket = SocketManager.getInstance(token).socket;
    socketRef.current = socket;

    const handleConnect = () => {
      setIsConnected(true);
      socket.emit("join_room", { roomId });
      Promise.resolve(flushQueue()).catch(() => {});
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const onReceiveMessage = (incoming: any) => {
      if (Number(incoming?.room_id) !== roomId) return;
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

        if (Number(normalizedIncoming.sender_id) !== Number(currentUserId)) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        return [...prev, normalizedIncoming];
      });

      onMessageReceived();
    };

    const onTyping = (payload: any) => {
      if (Number(payload?.room_id) !== roomId) return;
      if (Number(payload?.user_id) === Number(currentUserId)) return;
      setTypingUserId(payload?.is_typing ? Number(payload.user_id) : null);
    };

    const onMessageUpdated = (updatedMessage: any) => {
      if (Number(updatedMessage?.room_id) !== roomId) return;
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
      if (Number(call.room_id) !== roomId) return;

      const initiatedBy = Number(call.initiated_by || 0);
      if (initiatedBy === Number(currentUserId)) return;

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
      socket.emit("leave_room", { roomId });
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("receive_message", onReceiveMessage);
      socket.off("typing", onTyping);
      socket.off("message_updated", onMessageUpdated);
      socket.off("reaction_updated", onReactionUpdated);
      socket.off("call:started", onCallStarted);
    };
  }, [
    currentUserId,
    flushQueue,
    onMessageReceived,
    removeQueuedMessage,
    roomId,
    setIncomingCall,
    setMessages,
    setTypingUserId,
    token,
  ]);

  return {
    socketRef,
    isConnected,
  };
}
