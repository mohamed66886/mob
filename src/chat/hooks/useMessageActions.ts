import { useCallback } from "react";
import { Alert, Animated } from "react-native";
import * as Haptics from "expo-haptics";
import { DELETED_MESSAGE } from "../../lib/chatMessageUtils";

type UseMessageActionsParams = {
  socketRef: React.MutableRefObject<any>;
  selectedMessage: any;
  menuScaleAnim: Animated.Value;
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  setSelectedMessage: (message: any) => void;
  setShowMessageMenu: (visible: boolean) => void;
  setInputText: (value: string) => void;
  setEditingMessage: (message: any) => void;
  setReplyingTo: (message: any) => void;
};

export function useMessageActions({
  socketRef,
  selectedMessage,
  menuScaleAnim,
  setMessages,
  setSelectedMessage,
  setShowMessageMenu,
  setInputText,
  setEditingMessage,
  setReplyingTo,
}: UseMessageActionsParams) {
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
                  content: DELETED_MESSAGE,
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
    [setMessages, setSelectedMessage, setShowMessageMenu, socketRef],
  );

  const handleEditMessage = useCallback(
    (message: any) => {
      setInputText(message.content);
      setEditingMessage(message);
      setShowMessageMenu(false);
    },
    [setEditingMessage, setInputText, setShowMessageMenu],
  );

  const handleReply = useCallback(
    (message: any) => {
      setReplyingTo(message);
      setShowMessageMenu(false);
    },
    [setReplyingTo, setShowMessageMenu],
  );

  const handleReact = useCallback(
    (emoji: string, targetMessage?: any) => {
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

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setShowMessageMenu(false);
    },
    [selectedMessage, setShowMessageMenu, socketRef],
  );

  const showMessageMenuWithAnimation = useCallback(
    (message: any) => {
      setSelectedMessage(message);
      setShowMessageMenu(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      menuScaleAnim.setValue(0.8);
      Animated.spring(menuScaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 5,
      }).start();
    },
    [menuScaleAnim, setSelectedMessage, setShowMessageMenu],
  );

  return {
    handleDeleteMessage,
    handleEditMessage,
    handleReply,
    handleReact,
    showMessageMenuWithAnimation,
  };
}
