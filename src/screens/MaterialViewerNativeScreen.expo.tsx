import React from "react";
import {
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FileText, AlertCircle } from "lucide-react-native";
import { User } from "../types/auth";
import { api } from "../lib/api";

const BRAND = {
  primary: "#11468f",
  primaryDark: "#0f3f7f",
  surface: "#FFFFFF",
  background: "#F8FAFC",
  textMuted: "#64748B",
  border: "#E1E9F2",
};

/**
 * Expo Go fallback for MaterialViewerNativeScreen
 * 
 * react-native-pdf requires native iOS/Android modules,
 * which are not available in Expo Go.
 */
export default function MaterialViewerNativeScreen({
  token,
  route,
  navigation,
}: {
  token: string;
  user: User;
  route?: any;
  navigation?: any;
}) {
  const { id: materialId, title, url } = route?.params || {};

  const resolvedUrl = (() => {
    const raw = String(url || "").trim();
    if (raw && /^https?:\/\//i.test(raw)) return raw;
    if (raw) {
      const base = String(api.defaults.baseURL || "https://attendqr.tech/api").replace(/\/api\/?$/, "");
      return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
    }
    return `${api.defaults.baseURL}/materials/${materialId}/file`;
  })();

  const openFile = async () => {
    const supported = await Linking.canOpenURL(resolvedUrl);
    if (!supported) {
      Alert.alert("Unable to open", "Your browser cannot open this file URL.");
      return;
    }
    await Linking.openURL(resolvedUrl);
  };

  const handleCreateDevBuild = async () => {
    const url = "https://docs.expo.dev/development/create-development-builds/";
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <AlertCircle size={48} color={BRAND.primary} strokeWidth={1.5} />

        <Text style={styles.title}>{String(title || "View Material")}</Text>

        <Text style={styles.description}>
          Secure PDF rendering with watermarks is only available in development builds. You can still open files in
          your browser.
        </Text>

        <Pressable style={styles.button} onPress={openFile}>
          <FileText size={16} color="#FFFFFF" />
          <Text style={styles.buttonText}>Open in Browser</Text>
        </Pressable>

        <Text style={styles.hint} numberOfLines={2}>
          {resolvedUrl}
        </Text>

        <View style={styles.devBuildSection}>
          <Text style={styles.sectionTitle}>For Secure In-App Viewing:</Text>
          <Pressable style={styles.secondaryButton} onPress={handleCreateDevBuild}>
            <Text style={styles.secondaryButtonText}>Create Dev Build</Text>
          </Pressable>
          <Text style={styles.sectionHint}>Follow the Expo documentation to build for your device.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BRAND.background,
    justifyContent: "center",
    padding: 16,
  },
  card: {
    backgroundColor: BRAND.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 20,
    gap: 16,
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: BRAND.textMuted,
    textAlign: "center",
  },
  button: {
    backgroundColor: BRAND.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  hint: {
    fontSize: 12,
    color: BRAND.textMuted,
    textAlign: "center",
  },
  devBuildSection: {
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: BRAND.border,
    paddingTop: 16,
    gap: 12,
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  secondaryButton: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: "100%",
    alignItems: "center",
  },
  secondaryButtonText: {
    color: BRAND.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  sectionHint: {
    fontSize: 12,
    color: BRAND.textMuted,
    textAlign: "center",
  },
});
