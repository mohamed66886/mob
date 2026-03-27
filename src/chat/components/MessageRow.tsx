import React, { useCallback, useMemo } from "react";
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SwipeableMessage } from "./SwipeableMessage";
import { MessageBubbleContent } from "./MessageBubbleContent";

type MessageState = "pending" | "failed" | "sent" | "delivered" | "read";

type ChatMember = {
  user_id: number;
  name?: string;
  username?: string;
  user_role?: string;
  role?: string;
};

type ChatReaction = {
  user_id: number;
  reaction: string;
};

type ChatMessage = {
  id: number | string;
  type: string;
  updated_at?: string;
  dateStr?: string;
  sender_id: number | string;
  sender_name?: string;
  sender_username?: string;
  uploaded_file_url?: string;
  file_url?: string;
  content?: string;
  is_deleted?: boolean;
  local_status?: "pending" | "failed" | "sent";
  delivered?: boolean;
  seen?: boolean;
  reactions?: ChatReaction[];
  replied_message?: {
    sender_name?: string;
    content?: string;
  };
  isConsecutiveNext?: boolean;
  isConsecutivePrev?: boolean;
};

type MessageRowStyles = {
  dateHeaderWrap: StyleProp<ViewStyle>;
  dateHeaderText: StyleProp<TextStyle>;
  msgRow: StyleProp<ViewStyle>;
  msgRowMine: StyleProp<ViewStyle>;
  msgRowTheirs: StyleProp<ViewStyle>;
  senderAvatarBtn: StyleProp<ViewStyle>;
  senderAvatarText: StyleProp<TextStyle>;
  msgWrapper: StyleProp<ViewStyle>;
  msgRight: StyleProp<ViewStyle>;
  msgLeft: StyleProp<ViewStyle>;
  senderName: StyleProp<TextStyle>;
};

type MessageRowProps = {
  item: ChatMessage;
  userId: number;
  membersMap: Map<number, ChatMember>;
  selectedMessageId: number | string | undefined;
  todayStr: string;
  playingUri: string | null;
  styles: MessageRowStyles;
  brandPrimary: string;
  brandPrimaryDark: string;
  deletedMessageText: string;
  formatThreePartName: (name?: string | null) => string;
  buildReactionGroups: (reactions: ChatReaction[]) => Array<{ emoji: string; count: number; mine: boolean }>;
  resolveUploadUrl: (fileUrl?: string | null) => string;
  onSetProfileUser: (payload: any) => void;
  onSetSelectedMessage: (payload: ChatMessage) => void;
  onReact: (emoji: string, targetMessage?: ChatMessage) => void;
  onReply: (message: ChatMessage) => void;
  onShowMessageMenu: (message: ChatMessage) => void;
  onPreviewImage: (uri: string) => void;
  onTogglePlayVoice: (uri: string) => void;
  onOpenAttachment: (url: string) => void;
};

const IMAGE_FILE_EXT_RE = /\.(png|jpe?g|gif|webp)($|\?)/i;
const VOICE_FILE_EXT_RE = /\.(m4a|aac|mp3|wav|ogg)($|\?)/i;

function getInitials(name?: string) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function isImageUrl(url: string) {
  return IMAGE_FILE_EXT_RE.test(url);
}

function isVoiceUrl(url: string) {
  return VOICE_FILE_EXT_RE.test(url);
}

function MessageRowComponent({
  item,
  userId,
  membersMap,
  selectedMessageId,
  todayStr,
  playingUri,
  styles,
  brandPrimary,
  brandPrimaryDark,
  deletedMessageText,
  formatThreePartName,
  buildReactionGroups,
  resolveUploadUrl,
  onSetProfileUser,
  onSetSelectedMessage,
  onReact,
  onReply,
  onShowMessageMenu,
  onPreviewImage,
  onTogglePlayVoice,
  onOpenAttachment,
}: MessageRowProps) {
  if (item.type === "date_header") {
    return (
      <View style={styles.dateHeaderWrap}>
        <Text style={styles.dateHeaderText}>
          {item.dateStr === todayStr ? "اليوم" : item.dateStr}
        </Text>
      </View>
    );
  }

  const senderId = Number(item.sender_id);
  if (!senderId) {
    console.warn("Invalid sender_id in MessageRow item", item);
    return null;
  }

  const isMine = senderId === userId;
  const messageState: MessageState =
    item.local_status === "failed"
      ? "failed"
      : item.local_status === "pending"
        ? "pending"
        : item.seen
          ? "read"
          : item.delivered
            ? "delivered"
            : "sent";

  const fileUrl = resolveUploadUrl(item.file_url || item.uploaded_file_url || "");
  const isDeletedMessage = Boolean(item.is_deleted);
  const isImage = item.type === "image" || isImageUrl(fileUrl);
  const isVoice = item.type === "voice_note" || isVoiceUrl(fileUrl);
  const isSelected = selectedMessageId === item.id;

  const reactionsSignature = useMemo(() => {
    const reactions = Array.isArray(item.reactions) ? item.reactions : [];
    return JSON.stringify(
      reactions.map((r) => [Number(r?.user_id || 0), String(r?.reaction || "")]),
    );
  }, [item.reactions]);

  const reactionGroups = useMemo(
    () =>
      buildReactionGroups(
        (Array.isArray(item.reactions) ? item.reactions : []).map((r: ChatReaction) => ({
          ...r,
          mine: Number(r?.user_id) === userId,
        })),
      ),
    [buildReactionGroups, reactionsSignature, userId],
  );

  const handleAvatarPress = useCallback(() => {
    const member = membersMap.get(senderId);
    onSetProfileUser({
      user_id: senderId,
      name: member?.name || item.sender_name || "Unknown User",
      username: member?.username || item.sender_username || "",
      user_role: member?.user_role || "member",
      room_role: member?.role || "member",
    });
  }, [membersMap, onSetProfileUser, senderId, item.sender_name, item.sender_username]);

  const handleLongPress = useCallback(() => {
    onShowMessageMenu(item);
  }, [item, onShowMessageMenu]);

  const handleReactionPress = useCallback(
    (emoji: string, targetItem: ChatMessage) => {
      onSetSelectedMessage(targetItem);
      onReact(emoji, targetItem);
    },
    [onReact, onSetSelectedMessage],
  );

  return (
    <SwipeableMessage item={item} onReply={onReply} replyIconColor={brandPrimary}>
      <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowTheirs]}>
        {!isMine && !item.isConsecutiveNext ? (
          <Pressable
            style={styles.senderAvatarBtn}
            accessibilityRole="button"
            accessibilityLabel="Open user profile"
            accessibilityHint="Opens member details for this message sender"
            onPress={handleAvatarPress}
          >
            <Text style={styles.senderAvatarText}>
              {getInitials(item.sender_name)}
            </Text>
          </Pressable>
        ) : (
          !isMine && <View style={{ width: 28, marginRight: 6 }} />
        )}

        <Pressable
          onLongPress={handleLongPress}
          delayLongPress={400}
          style={[styles.msgWrapper, isMine ? styles.msgRight : styles.msgLeft]}
          accessibilityRole="button"
          accessibilityLabel="Open message actions"
          accessibilityHint="Long press to react, reply, edit, or delete"
        >
          {!isMine && !item.isConsecutivePrev ? (
            <Text style={styles.senderName}>{formatThreePartName(item.sender_name || "Someone")}</Text>
          ) : null}

          <MessageBubbleContent
            item={item}
            isMine={isMine}
            messageState={messageState}
            fileUrl={fileUrl}
            isDeletedMessage={isDeletedMessage}
            isImage={isImage}
            isVoice={isVoice}
            isSelected={isSelected}
            reactionGroups={reactionGroups}
            playingUri={playingUri}
            styles={styles}
            brandPrimary={brandPrimary}
            brandPrimaryDark={brandPrimaryDark}
            formatThreePartName={formatThreePartName}
            onPreviewImage={onPreviewImage}
            onTogglePlayVoice={onTogglePlayVoice}
            onOpenAttachment={onOpenAttachment}
            onReactionPress={handleReactionPress}
          />
        </Pressable>
      </View>
    </SwipeableMessage>
  );
}

MessageRowComponent.displayName = "MessageRow";

export const MessageRow = React.memo(MessageRowComponent, (prev, next) => {
  if (
    prev.item === next.item &&
    prev.selectedMessageId === next.selectedMessageId &&
    prev.playingUri === next.playingUri &&
    prev.todayStr === next.todayStr &&
    prev.userId === next.userId
  ) {
    return true;
  }

  const prevItem = prev.item;
  const nextItem = next.item;

  return (
    prevItem.id === nextItem.id &&
    prevItem.updated_at === nextItem.updated_at &&
    prevItem.seen === nextItem.seen &&
    prevItem.delivered === nextItem.delivered &&
    prevItem.local_status === nextItem.local_status &&
    prevItem.is_deleted === nextItem.is_deleted &&
    prev.selectedMessageId === next.selectedMessageId &&
    prev.playingUri === next.playingUri &&
    prev.todayStr === next.todayStr &&
    prev.userId === next.userId
  );
});
