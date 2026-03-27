import React, { useCallback } from "react";
import { Alert, Animated, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { CornerDownLeft, Edit2, Trash2 } from "lucide-react-native";

type ChatMessage = {
  id: number | string;
  sender_id: number | string;
};

type MessageContextMenuModalProps = {
  visible: boolean;
  selectedMessage: ChatMessage | null;
  currentUserId: number;
  menuScaleAnim: Animated.Value;
  styles: any;
  brandText: string;
  brandDanger: string;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onDelete: (messageId: number) => void;
};

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function MessageContextMenuModalComponent({
  visible,
  selectedMessage,
  currentUserId,
  menuScaleAnim,
  styles,
  brandText,
  brandDanger,
  onClose,
  onReact,
  onReply,
  onEdit,
  onDelete,
}: MessageContextMenuModalProps) {
  const menuAnimatedStyle = {
    opacity: menuScaleAnim.interpolate({
      inputRange: [0.8, 1],
      outputRange: [0, 1],
      extrapolate: "clamp",
    }),
    transform: [{ scale: menuScaleAnim }],
  };

  const handleReactPress = useCallback(
    (emoji: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onReact(emoji);
      onClose();
    },
    [onClose, onReact],
  );

  const handleReplyPress = useCallback(() => {
    if (!selectedMessage) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onReply(selectedMessage);
    onClose();
  }, [onClose, onReply, selectedMessage]);

  const handleEditPress = useCallback(() => {
    if (!selectedMessage) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onEdit(selectedMessage);
    onClose();
  }, [onClose, onEdit, selectedMessage]);

  const handleDeletePress = useCallback(() => {
    if (!selectedMessage) return;

    Alert.alert("Delete Message", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onDelete(Number(selectedMessage.id));
          onClose();
        },
      },
    ]);
  }, [onClose, onDelete, selectedMessage]);

  const isOwnMessage = Number(selectedMessage?.sender_id || 0) === currentUserId;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable onPress={(event) => event.stopPropagation()}>
          <SafeAreaView>
            <Animated.View style={[styles.menuContainer, menuAnimatedStyle]}>
              <View
                style={styles.reactionsRow}
                accessible
                accessibilityRole="menu"
                accessibilityLabel="Message actions"
              >
                {REACTIONS.map((emoji) => (
                  <Pressable
                    key={emoji}
                    style={styles.reactionEmoji}
                    onPress={() => handleReactPress(emoji)}
                    accessibilityRole="button"
                    accessibilityLabel={`React with ${emoji}`}
                  >
                    <Text style={{ fontSize: 32 }}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.menuOptionsBox}>
                <Pressable
                  style={styles.menuOption}
                  onPress={handleReplyPress}
                  accessibilityRole="button"
                  accessibilityLabel="Reply to message"
                >
                  <CornerDownLeft size={22} color={brandText} />
                  <Text style={styles.menuOptionText}>Reply</Text>
                </Pressable>

                {isOwnMessage ? (
                  <>
                    <Pressable
                      style={styles.menuOption}
                      onPress={handleEditPress}
                      accessibilityRole="button"
                      accessibilityLabel="Edit message"
                    >
                      <Edit2 size={22} color={brandText} />
                      <Text style={styles.menuOptionText}>Edit</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.menuOption, { borderBottomWidth: 0 }]}
                      onPress={handleDeletePress}
                      accessibilityRole="button"
                      accessibilityLabel="Delete message"
                    >
                      <Trash2 size={22} color={brandDanger} />
                      <Text style={[styles.menuOptionText, { color: brandDanger }]}>Delete</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            </Animated.View>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

MessageContextMenuModalComponent.displayName = "MessageContextMenuModal";

export const MessageContextMenuModal = React.memo(MessageContextMenuModalComponent);
