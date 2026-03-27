import React from "react";
import { Alert, Animated, Image, Pressable, Text, TextInput, View } from "react-native";
import { CornerDownLeft, Edit2, File, Mic, Paperclip, Send, X } from "lucide-react-native";

type Attachment = {
  uri: string;
  name: string;
  mimeType: string;
  category: "image" | "file" | "voice";
};

type ChatComposerProps = {
  styles: any;
  brandPrimary: string;
  brandTextMuted: string;
  insetsBottom: number;
  replyingTo: any;
  editingMessage: any;
  selectedAttachment: Attachment | null;
  isRecording: boolean;
  recordingMs: number;
  waveAnims: Animated.Value[];
  inputText: string;
  onChangeText: (value: string) => void;
  onSendText: () => void;
  onToggleRecording: () => void;
  onPickImageFromCamera: () => void;
  onPickImage: () => void;
  onPickDocument: () => void;
  onCancelReply: () => void;
  onCancelEditing: () => void;
  onCancelAttachment: () => void;
  formatThreePartName: (name?: string | null) => string;
};

export function ChatComposer({
  styles,
  brandPrimary,
  brandTextMuted,
  insetsBottom,
  replyingTo,
  editingMessage,
  selectedAttachment,
  isRecording,
  recordingMs,
  waveAnims,
  inputText,
  onChangeText,
  onSendText,
  onToggleRecording,
  onPickImageFromCamera,
  onPickImage,
  onPickDocument,
  onCancelReply,
  onCancelEditing,
  onCancelAttachment,
  formatThreePartName,
}: ChatComposerProps) {
  const hasSendAction = Boolean(inputText.trim() || selectedAttachment);

  return (
    <>
      {replyingTo && (
        <View style={styles.replyPreview}>
          <CornerDownLeft size={20} color={brandPrimary} style={{ marginRight: 12 }} />
          <View style={styles.replyPreviewContent}>
            <Text style={styles.replyPreviewLabel}>Reply to {formatThreePartName(replyingTo.sender_name)}</Text>
            <Text style={styles.replyPreviewText} numberOfLines={1}>
              {replyingTo.content || "Attachment"}
            </Text>
          </View>
          <Pressable onPress={onCancelReply} style={{ padding: 4 }}>
            <X size={20} color={brandTextMuted} />
          </Pressable>
        </View>
      )}

      {editingMessage && (
        <View style={styles.replyPreview}>
          <Edit2 size={20} color={brandPrimary} style={{ marginRight: 12 }} />
          <View style={styles.replyPreviewContent}>
            <Text style={styles.replyPreviewLabel}>Edit Message</Text>
            <Text style={styles.replyPreviewText} numberOfLines={1}>
              {editingMessage.content || "Message"}
            </Text>
          </View>
          <Pressable onPress={onCancelEditing} style={{ padding: 4 }}>
            <X size={20} color={brandTextMuted} />
          </Pressable>
        </View>
      )}

      {selectedAttachment && (
        <View style={styles.replyPreview}>
          {selectedAttachment.category === "image" ? (
            <Image source={{ uri: selectedAttachment.uri }} style={styles.attachmentThumb} />
          ) : (
            <File size={20} color={brandPrimary} style={{ marginRight: 12 }} />
          )}
          <View style={styles.replyPreviewContent}>
            <Text style={styles.replyPreviewLabel}>Attachment</Text>
            <Text style={styles.replyPreviewText} numberOfLines={1}>
              {selectedAttachment.name}
            </Text>
          </View>
          <Pressable onPress={onCancelAttachment} style={{ padding: 4 }}>
            <X size={20} color={brandTextMuted} />
          </Pressable>
        </View>
      )}

      <View style={[styles.composerContainer, { paddingBottom: Math.max(insetsBottom, 10) }]}>
        <Pressable
          style={styles.attachBtn}
          onPress={() => {
            if (editingMessage) {
              Alert.alert("Notice", "Cancel editing to attach a file.");
              return;
            }
            Alert.alert("Attachment", "Choose type", [
              { text: "Camera", onPress: onPickImageFromCamera },
              { text: "Photo & Video", onPress: onPickImage },
              { text: "Document", onPress: onPickDocument },
              { text: "Cancel", style: "cancel" },
            ]);
          }}
        >
          <Paperclip color={brandTextMuted} size={24} />
        </Pressable>

        <View style={styles.inputWrapper}>
          {isRecording ? (
            <View style={styles.recordingWavesContainer}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingTime}>{new Date(recordingMs).toISOString().substring(14, 19)}</Text>
              <View style={styles.wavesRow}>
                {waveAnims.map((anim, i) => (
                  <Animated.View key={i} style={[styles.activeWave, { transform: [{ scaleY: anim }] }]} />
                ))}
              </View>
            </View>
          ) : (
            <TextInput
              style={styles.input}
              placeholder="Message"
              placeholderTextColor={brandTextMuted}
              value={inputText}
              onChangeText={onChangeText}
              multiline
            />
          )}
        </View>

        <Pressable style={styles.sendBtn} onPress={hasSendAction ? onSendText : onToggleRecording}>
          <View style={[styles.sendBtnInner, hasSendAction ? styles.sendBtnInnerActive : null]}>
            {hasSendAction ? (
              <Send color="white" size={18} style={{ marginLeft: -2, marginTop: 2 }} />
            ) : isRecording ? (
              <View style={styles.stopIcon} />
            ) : (
              <Mic color="white" size={20} />
            )}
          </View>
        </Pressable>
      </View>
    </>
  );
}
