import React from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { AlertCircle, Check, CheckCheck, File, Pause, Play } from "lucide-react-native";
import { formatChatTime } from "../../lib/chatMessageUtils";

type MessageBubbleContentProps = {
  item: any;
  isMine: boolean;
  messageState: "pending" | "failed" | "sent" | "delivered" | "read";
  fileUrl: string;
  isDeletedMessage: boolean;
  isImage: boolean;
  isVoice: boolean;
  isSelected: boolean;
  reactionGroups: Array<{ emoji: string; count: number; mine: boolean }>;
  playingUri: string | null;
  styles: any;
  brandPrimary: string;
  brandPrimaryDark: string;
  formatThreePartName: (name?: string | null) => string;
  onPreviewImage: (uri: string) => void;
  onTogglePlayVoice: (uri: string) => void;
  onOpenAttachment: (url: string) => void;
  onReactionPress: (emoji: string, item: any) => void;
};

function MessageBubbleContentComponent({
  item,
  isMine,
  messageState,
  fileUrl,
  isDeletedMessage,
  isImage,
  isVoice,
  isSelected,
  reactionGroups,
  playingUri,
  styles,
  brandPrimary,
  brandPrimaryDark,
  formatThreePartName,
  onPreviewImage,
  onTogglePlayVoice,
  onOpenAttachment,
  onReactionPress,
}: MessageBubbleContentProps) {
  const bubbleStyles = [
    styles.msgBubble,
    isMine ? styles.bubbleMine : styles.bubbleTheirs,
    isMine && item.isConsecutiveNext && { borderBottomRightRadius: 4 },
    isMine && item.isConsecutivePrev && { borderTopRightRadius: 4 },
    !isMine && item.isConsecutiveNext && { borderBottomLeftRadius: 4 },
    !isMine && item.isConsecutivePrev && { borderTopLeftRadius: 4 },
    isSelected && styles.msgBubbleSelected,
  ];

  return (
    <View style={styles.messageContentWrap}>
      <View style={bubbleStyles}>
        {item.replied_message && !isDeletedMessage ? (
          <View style={[styles.inlineReplyBox, isMine ? styles.inlineReplyMine : styles.inlineReplyTheirs]}>
            <Text style={styles.inlineReplyName}>{formatThreePartName(item.replied_message.sender_name)}</Text>
            <Text style={styles.inlineReplyText} numberOfLines={1}>
              {item.replied_message.content || "مرفق"}
            </Text>
          </View>
        ) : null}

        {fileUrl && !isDeletedMessage ? (
          isImage ? (
            <Pressable onPress={() => onPreviewImage(fileUrl)}>
              <Image source={{ uri: fileUrl }} style={styles.imagePreview} resizeMode="cover" />
            </Pressable>
          ) : isVoice ? (
            <Pressable
              style={[styles.voiceRow, isMine ? { backgroundColor: "rgba(255,255,255,0.4)" } : {}]}
              onPress={() => onTogglePlayVoice(fileUrl)}
            >
              <View style={[styles.playBtn, isMine ? { backgroundColor: "#4CA952" } : {}]}>
                {playingUri === fileUrl ? (
                  <Pause color="white" size={14} />
                ) : (
                  <Play color="white" size={14} style={{ marginLeft: 2 }} />
                )}
              </View>
              <View style={styles.voiceWaveArea}>
                {[0.4, 0.7, 0.5, 1, 0.3, 0.8, 0.6, 0.9, 0.4, 0.2, 0.6, 0.8, 0.5, 0.9, 0.3].map((h, i) => (
                  <View
                    key={i}
                    style={[
                      styles.voiceWaveLine,
                      {
                        height: `${h * 100}%`,
                        backgroundColor: isMine ? "#4CA952" : brandPrimaryDark,
                      },
                    ]}
                  />
                ))}
              </View>
            </Pressable>
          ) : (
            <Pressable style={styles.fileRow} onPress={() => onOpenAttachment(fileUrl)}>
              <File color={brandPrimary} size={16} />
              <Text style={styles.fileText}>مرفق</Text>
            </Pressable>
          )
        ) : null}

        <Text style={isDeletedMessage ? styles.msgDeletedText : isMine ? styles.msgTextMine : styles.msgTextTheirs}>
          {item.content}
        </Text>

        <View style={styles.metaRow}>
          <Text style={[styles.msgTime, isMine ? styles.msgTimeMine : styles.msgTimeTheirs]}>
            {formatChatTime(item.created_at)}
          </Text>
          {isMine ? (
            <View style={styles.tickContainer}>
              {messageState === "pending" ? (
                <ActivityIndicator size={10} color="#68A057" />
              ) : messageState === "failed" ? (
                <AlertCircle size={14} color="#FF3B30" />
              ) : messageState === "read" ? (
                <CheckCheck size={14} color="#34B7F1" />
              ) : messageState === "delivered" ? (
                <CheckCheck size={14} color="#68A057" />
              ) : (
                <Check size={14} color="#68A057" />
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
              onPress={() => onReactionPress(group.emoji, item)}
            >
              <Text style={styles.reactionChipEmoji}>{group.emoji}</Text>
              <Text style={styles.reactionChipCount}>{group.count}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

MessageBubbleContentComponent.displayName = "MessageBubbleContent";

export const MessageBubbleContent = React.memo(MessageBubbleContentComponent);
