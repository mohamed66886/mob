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
import { User } from "../types/auth";
import { api } from "../lib/api";

const BRAND = {
  primary: "#11468f",
  background: "#F8FAFC",
  text: "#0F172A",
  muted: "#64748B",
  surface: "#FFFFFF",
  border: "#E2E8F0",
};

export default function MaterialViewerNativeScreen({
  route,
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

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>{String(title || "Material Viewer")}</Text>
        <Text style={styles.description}>
          In-app secure PDF rendering is available on iOS and Android builds. Open this material in a browser tab on web.
        </Text>

        <Pressable style={styles.button} onPress={openFile}>
          <Text style={styles.buttonText}>Open Material</Text>
        </Pressable>

        <Text style={styles.hint} numberOfLines={2}>
          {resolvedUrl}
        </Text>
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
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: BRAND.text,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: BRAND.muted,
  },
  button: {
    backgroundColor: BRAND.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  hint: {
    fontSize: 12,
    color: BRAND.muted,
  },
});