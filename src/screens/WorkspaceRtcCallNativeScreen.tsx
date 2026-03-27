import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Linking,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
} from "react-native-reanimated";
import { ArrowLeft, VideoOff, Terminal, ExternalLink, Info } from "lucide-react-native";
import { User } from "../types/auth";

// Premium Dark Theme Palette for Call Screens
const BRAND = {
  bg: "#0F172A", // Slate 900
  card: "#1E293B", // Slate 800
  surface: "#334155", // Slate 700
  text: "#F8FAFC",
  muted: "#94A3B8",
  primary: "#3B82F6", // Emerald/Blue mix
  primaryDark: "#2563EB",
  danger: "#EF4444",
  warning: "#F59E0B",
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function WorkspaceCallNativeScreen({
  route,
  navigation,
}: {
  token: string;
  user: User;
  route?: any;
  navigation?: any;
}) {
  const insets = useSafeAreaInsets();

  // Floating Blobs Animation
  const blobOffset = useSharedValue(0);
  useEffect(() => {
    blobOffset.value = withRepeat(
      withSequence(withTiming(20, { duration: 4000 }), withTiming(0, { duration: 4000 })),
      -1, true
    );
  }, []);

  const blobStyle1 = useAnimatedStyle(() => ({ transform: [{ translateY: blobOffset.value }] }));
  const blobStyle2 = useAnimatedStyle(() => ({ transform: [{ translateY: -blobOffset.value }] }));

  const handleCreateDevBuild = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const url = "https://docs.expo.dev/development/create-development-builds/";
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
  };

  const handleGoBack = () => {
    Haptics.selectionAsync();
    navigation?.goBack();
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Animated Background Blobs */}
      <Animated.View style={[styles.blobRight, blobStyle1]} />
      <Animated.View style={[styles.blobLeft, blobStyle2]} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={handleGoBack} style={styles.closeButton}>
          <ArrowLeft size={26} color={BRAND.text} />
        </Pressable>
        <Text style={styles.headerTitle}>System Alert</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(100).springify().damping(14)} style={styles.messageCard}>
          
          <View style={styles.iconContainer}>
            <VideoOff size={48} color={BRAND.danger} strokeWidth={1.5} />
            <View style={styles.errorBadge}>
              <Text style={styles.errorBadgeText}>Expo Go</Text>
            </View>
          </View>

          <Text style={styles.title}>Native Modules Required</Text>

          <Text style={styles.description}>
            Real-time video and audio calling (WebRTC) uses native device integrations that are securely restricted inside the standard Expo Go app.
          </Text>

          {/* Reasons Section */}
          <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.infoBox}>
            <View style={styles.boxHeader}>
              <Info size={18} color={BRAND.warning} />
              <Text style={styles.subheading}>Technical Limitations</Text>
            </View>
            <View style={styles.bulletList}>
              <Text style={styles.reasonItem}>• WebRTC requires custom iOS/Android bridging.</Text>
              <Text style={styles.reasonItem}>• In-call audio management needs native hooks.</Text>
              <Text style={styles.reasonItem}>• Expo Go sandboxes these modules for security.</Text>
            </View>
          </Animated.View>

          {/* Steps Section */}
          <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.terminalBox}>
            <View style={styles.boxHeader}>
              <Terminal size={18} color={BRAND.primary} />
              <Text style={styles.subheading}>Quick Fix (Dev Build)</Text>
            </View>
            <View style={styles.codeSnippet}>
              <Text style={styles.stepCode}>$ eas build --platform ios --profile preview</Text>
              <Text style={styles.stepComment}># Or use local Xcode/Android Studio:</Text>
              <Text style={styles.stepCode}>$ expo run:ios</Text>
              <Text style={styles.stepCode}>$ expo run:android</Text>
            </View>
          </Animated.View>

          {/* Action Button */}
          <Animated.View entering={FadeIn.delay(500)} style={styles.solution}>
            <AnimatedPressable 
              style={({ pressed }) => [styles.button, pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 }]} 
              onPress={handleCreateDevBuild}
            >
              <Text style={styles.buttonText}>Read Official Documentation</Text>
              <ExternalLink size={18} color={BRAND.text} />
            </AnimatedPressable>
            <Text style={styles.buttonHint}>
              Build a custom development client to unlock all native features for AttendQR.
            </Text>
          </Animated.View>

        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BRAND.bg, position: "relative" },
  
  // Background Effects
  blobRight: { position: "absolute", right: -80, top: 40, width: 250, height: 250, borderRadius: 125, backgroundColor: BRAND.danger, opacity: 0.15, filter: [{ blur: 40 }] },
  blobLeft: { position: "absolute", left: -60, bottom: 100, width: 200, height: 200, borderRadius: 100, backgroundColor: BRAND.primary, opacity: 0.15, filter: [{ blur: 40 }] },

  // Header
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 16, backgroundColor: BRAND.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.card, zIndex: 10 },
  closeButton: { width: 44, height: 44, justifyContent: "center", alignItems: "flex-start" },
  headerTitle: { color: BRAND.text, fontSize: 18, fontWeight: "700", letterSpacing: 0.5 },
  placeholder: { width: 44 },
  
  content: { flex: 1 },
  contentContainer: { padding: 20, justifyContent: "center" },
  
  // Main Card
  messageCard: { backgroundColor: BRAND.card, borderRadius: 24, padding: 24, alignItems: "center", borderWidth: 1, borderColor: BRAND.surface, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
  
  iconContainer: { position: "relative", marginBottom: 16, padding: 20, backgroundColor: "rgba(239, 68, 68, 0.1)", borderRadius: 40 },
  errorBadge: { position: "absolute", bottom: 5, right: -10, backgroundColor: BRAND.danger, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 2, borderColor: BRAND.card },
  errorBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", textTransform: "uppercase" },

  title: { color: BRAND.text, fontSize: 24, fontWeight: "800", textAlign: "center", marginBottom: 12, letterSpacing: -0.5 },
  description: { color: BRAND.muted, fontSize: 15, lineHeight: 24, textAlign: "center", marginBottom: 24, paddingHorizontal: 10 },
  
  // Info Boxes
  infoBox: { width: "100%", backgroundColor: "rgba(245, 158, 11, 0.1)", borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "rgba(245, 158, 11, 0.2)" },
  terminalBox: { width: "100%", backgroundColor: "#020617", borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: BRAND.surface },
  
  boxHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 },
  subheading: { color: BRAND.text, fontSize: 15, fontWeight: "700" },
  
  bulletList: { gap: 8 },
  reasonItem: { color: BRAND.muted, fontSize: 14, lineHeight: 20 },
  
  codeSnippet: { backgroundColor: "#0F172A", padding: 12, borderRadius: 8 },
  stepCode: { color: "#10B981", fontSize: 13, fontFamily: Platform.OS === 'ios' ? "Courier" : "monospace", marginBottom: 4 },
  stepComment: { color: "#64748B", fontSize: 12, fontFamily: Platform.OS === 'ios' ? "Courier" : "monospace", marginTop: 8, marginBottom: 4 },
  
  // Action
  solution: { width: "100%", alignItems: "center", gap: 12 },
  button: { width: "100%", backgroundColor: BRAND.primaryDark, borderRadius: 14, paddingVertical: 16, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10, borderWidth: 1, borderColor: BRAND.primary },
  buttonText: { color: BRAND.text, fontSize: 16, fontWeight: "700" },
  buttonHint: { color: BRAND.muted, fontSize: 13, lineHeight: 18, textAlign: "center", paddingHorizontal: 16 },
});