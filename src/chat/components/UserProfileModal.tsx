import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { X } from "lucide-react-native";

type UserProfileModalProps = {
  profileUser: any;
  styles: any;
  brandTextMuted: string;
  onClose: () => void;
  formatThreePartName: (name?: string | null) => string;
  getAvatarColor: (name: string) => string;
};

export function UserProfileModal({
  profileUser,
  styles,
  brandTextMuted,
  onClose,
  formatThreePartName,
  getAvatarColor,
}: UserProfileModalProps) {
  return (
    <Modal visible={!!profileUser} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.profileOverlay}>
        <View style={styles.profileCard}>
          <View style={styles.profileHeaderRow}>
            <Text style={styles.profileTitle}>User Info</Text>
            <Pressable onPress={onClose} style={styles.profileCloseBtn}>
              <X size={20} color={brandTextMuted} />
            </Pressable>
          </View>

          <View style={[styles.profileAvatarLg, { backgroundColor: getAvatarColor(profileUser?.name || "U") }]}>
            <Text style={styles.profileAvatarLgText}>
              {String(formatThreePartName(profileUser?.name || "U")).charAt(0).toUpperCase()}
            </Text>
          </View>

          <Text style={styles.profileName}>{formatThreePartName(profileUser?.name || "Unknown User")}</Text>
          <Text style={styles.profileUsername}>@{String(profileUser?.username || "unknown")}</Text>

          <View style={styles.profileDetailsBox}>
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>App Role</Text>
              <Text style={styles.profileDetailValue}>{String(profileUser?.user_role || "member")}</Text>
            </View>
            <View style={[styles.profileDetailRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.profileDetailLabel}>Room Role</Text>
              <Text style={styles.profileDetailValue}>{String(profileUser?.room_role || "member")}</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
