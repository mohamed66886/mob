import React from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  ScrollView,
  Linking,
} from "react-native";
import { Phone, AlertCircle } from "lucide-react-native";
import { User } from "../types/auth";

const BRAND = {
  bg: "#0b1b33",
  card: "#102a4d",
  text: "#f8fafc",
  muted: "#9fb5d1",
  primary: "#2f7de1",
  danger: "#ef4444",
};

/**
 * Fallback screen for Expo Go
 * 
 * Video calls require native modules (react-native-webrtc, react-native-incall-manager)
 * which are not available in Expo Go. Users must create a development build to use this feature.
 */
export default function WorkspaceCallNativeScreen({
  route,
  navigation,
}: {
  token: string;
  user: User;
  route?: any;
  navigation?: any;
}) {
  const handleCreateDevBuild = async () => {
    const url =
      "https://docs.expo.dev/development/create-development-builds/";
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    }
  };

  const handleGoBack = () => {
    navigation?.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={handleGoBack} style={styles.closeButton}>
          <Phone size={24} color={BRAND.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Call</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.messageCard}>
          <AlertCircle size={64} color={BRAND.danger} strokeWidth={1.5} />

          <Text style={styles.title}>Video Calls Not Supported in Expo Go</Text>

          <Text style={styles.description}>
            Real-time video calling requires native modules that are only available in development builds, not in the
            Expo Go app.
          </Text>

          <View style={styles.reasons}>
            <Text style={styles.subheading}>Why?</Text>
            <Text style={styles.reasonItem}>• WebRTC stack needs native iOS/Android implementation</Text>
            <Text style={styles.reasonItem}>• In-call audio management requires native integrations</Text>
            <Text style={styles.reasonItem}>• Expo Go sandboxes native module access for security</Text>
          </View>

          <View style={styles.solution}>
            <Text style={styles.subheading}>How to Fix</Text>
            <Pressable style={styles.button} onPress={handleCreateDevBuild}>
              <Text style={styles.buttonText}>Create a Development Build</Text>
            </Pressable>
            <Text style={styles.buttonHint}>
              Follow the Expo documentation to build a dev app for your device or simulator.
            </Text>
          </View>

          <View style={styles.steps}>
            <Text style={styles.stepsTitle}>Quick Steps:</Text>
            <Text style={styles.step}>1. Run: eas build --platform ios --profile preview</Text>
            <Text style={styles.step}>2. Or: expo run:ios (if using local Xcode)</Text>
            <Text style={styles.step}>3. Open the dev build on your device/simulator</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.card,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: BRAND.text,
    fontSize: 18,
    fontWeight: "700",
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    justifyContent: "center",
  },
  messageCard: {
    backgroundColor: BRAND.card,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 20,
    borderLeftWidth: 4,
    borderLeftColor: BRAND.danger,
  },
  title: {
    color: BRAND.text,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    color: BRAND.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  reasons: {
    width: "100%",
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  subheading: {
    color: BRAND.text,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  reasonItem: {
    color: BRAND.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  solution: {
    width: "100%",
    gap: 12,
  },
  button: {
    backgroundColor: BRAND.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  buttonText: {
    color: BRAND.text,
    fontSize: 16,
    fontWeight: "700",
  },
  buttonHint: {
    color: BRAND.muted,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
  steps: {
    width: "100%",
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  stepsTitle: {
    color: BRAND.text,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  step: {
    color: BRAND.muted,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Courier",
  },
});
