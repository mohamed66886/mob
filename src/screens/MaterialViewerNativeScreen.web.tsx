import React from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { StatusBar } from "expo-status-bar";

const BRAND = {
  primary: "#3390ec",
  background: "#f1f2f6",
  surface: "#FFFFFF",
  text: "#1c1c1e",
  textMuted: "#8e8e93",
  border: "#E5E5EA",
};

export default function MaterialViewerNativeScreen({ route, navigation }: any) {
  const { title, url } = route?.params || {};

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.card}>
        <Text style={styles.title} numberOfLines={2}>
          {title || "Material"}
        </Text>
        <Text style={styles.subtitle}>
          Material viewer is not available on web.
        </Text>

        {!!url && (
          <Pressable
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}
            onPress={() => Linking.openURL(String(url))}
          >
            <Text style={styles.btnText}>Open file</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.9 }]}
          onPress={() => navigation?.goBack?.()}
        >
          <Text style={styles.secondaryBtnText}>Go back</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BRAND.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: BRAND.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: BRAND.text,
  },
  subtitle: {
    marginTop: 8,
    color: BRAND.textMuted,
    fontWeight: "600",
  },
  btn: {
    marginTop: 16,
    backgroundColor: BRAND.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: {
    color: "white",
    fontWeight: "800",
  },
  secondaryBtn: {
    marginTop: 10,
    backgroundColor: "transparent",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  secondaryBtnText: {
    color: BRAND.text,
    fontWeight: "800",
  },
});
