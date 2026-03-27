import { useCallback, useState } from "react";
import { Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

export type ChatAttachment = {
  uri: string;
  name: string;
  mimeType: string;
  category: "image" | "file" | "voice";
  file_url?: string;
};

export function useChatAttachments() {
  const [selectedAttachment, setSelectedAttachment] = useState<ChatAttachment | null>(null);

  const pickImage = useCallback(async () => {
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
    } catch {
      Alert.alert("خطأ", "فشل اختيار الصورة");
    }
  }, []);

  const pickImageFromCamera = useCallback(async () => {
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
  }, []);

  const pickDocument = useCallback(async () => {
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
    } catch {
      Alert.alert("خطأ", "فشل اختيار الملف");
    }
  }, []);

  return {
    selectedAttachment,
    setSelectedAttachment,
    pickImage,
    pickImageFromCamera,
    pickDocument,
  };
}
