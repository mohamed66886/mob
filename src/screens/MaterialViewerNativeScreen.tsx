import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  AppState,
  AppStateStatus,
  Alert,
  Linking,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as ScreenCapture from "expo-screen-capture";
import Constants from "expo-constants";
import { WebView } from "react-native-webview";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { ArrowLeft, ShieldAlert, FileText, ExternalLink } from "lucide-react-native";

import { User } from "../types/auth";
import { api } from "../lib/api";

const { width, height } = Dimensions.get("window");

// Lazy import for react-native-pdf
let Pdf: any = null;
const isExpoGo = Constants.appOwnership === "expo";
if (!isExpoGo) {
  try {
    Pdf = require("react-native-pdf").default;
  } catch (e) {
    console.warn("PDF module not available:", e);
  }
}

// Telegram/iOS Premium Palette
const BRAND = {
  primary: "#3390ec",
  primaryDark: "#2b7cb9",
  surface: "#FFFFFF",
  background: "#f1f2f6",
  text: "#1c1c1e",
  textMuted: "#8e8e93",
  border: "#E5E5EA",
  darkBg: "#1e1e1e", // Dark background for PDF viewer to make pages pop
};

export default function MaterialViewerNativeScreen({
  token,
  user,
  route,
  navigation,
}: any) {
  const { id: materialId, title, type, url } = route?.params || {};
  const insets = useSafeAreaInsets();

  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [isViewerBlocked, setIsViewerBlocked] = useState(false);

  const isPdf = type === "pdf";

  const resolvedUrl = (() => {
    const raw = String(url || "").trim();
    if (raw && /^https?:\/\//i.test(raw)) return raw;
    if (raw) {
      const base = String(api.defaults.baseURL || "https://your-api.com/api").replace(/\/api\/?$/, "");
      return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
    }
    return `${api.defaults.baseURL}/materials/${materialId}/file`;
  })();

  const pdfSource = {
    uri: resolvedUrl,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf" },
    cache: true,
  };

  // Watermark setup
  const studentCodeWatermark = user?.username || user?.name || `ID-${user?.id ?? "USER"}`;
  const watermarkChunks = Array.from({ length: 25 }, () => studentCodeWatermark).join("    ");

  // Anti-Cheat Mechanism
  useEffect(() => {
    const setupSecurity = async () => {
      try {
        await ScreenCapture.preventScreenCaptureAsync();
      } catch (e) {
        console.warn("Screen capture prevention not supported");
      }
    };
    setupSecurity();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (appState.match(/active/) && nextAppState === "background") {
        setIsViewerBlocked(true);
      }
      setAppState(nextAppState);
    });

    return () => {
      subscription.remove();
      ScreenCapture.allowScreenCaptureAsync().catch(() => {});
    };
  }, [appState]);

  // --- UI States ---

  if (isViewerBlocked) {
    return (
      <View style={[styles.blockedScreen, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <Animated.View entering={FadeInDown.springify()} style={styles.blockedContent}>
          <ShieldAlert color="#FF3B30" size={64} strokeWidth={1.5} style={{ marginBottom: 20 }} />
          <Text style={styles.blockedTitle}>Viewer Locked</Text>
          <Text style={styles.blockedText}>
            For security reasons, the document was locked because the app was minimized or left active in the background.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.unblockBtn, pressed && { opacity: 0.8 }]}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setIsViewerBlocked(false);
            }}
          >
            <Text style={styles.unblockBtnText}>Reload Securely</Text>
          </Pressable>
          <Pressable style={styles.leaveBtn} onPress={() => navigation?.goBack()}>
            <Text style={styles.leaveBtnText}>Go Back</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  if (isExpoGo) {
    const openFile = async () => {
      const supported = await Linking.canOpenURL(resolvedUrl);
      if (!supported) return Alert.alert("Error", "Cannot open this file URL.");
      await Linking.openURL(resolvedUrl);
    };

    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.fallbackHeader}>
          <Pressable onPress={() => navigation?.goBack()} style={styles.backBtnWrapper}>
            <ArrowLeft color={BRAND.text} size={28} />
          </Pressable>
        </View>
        <View style={styles.fallbackCard}>
          <View style={styles.iconCircle}>
            <FileText size={40} color={BRAND.primary} />
          </View>
          <Text style={styles.fallbackTitle}>Native PDF Not Supported</Text>
          <Text style={styles.fallbackDesc}>
            You are using Expo Go. Secure native PDF viewing requires a custom build. You can securely open it externally.
          </Text>
          <Pressable style={styles.fallbackButton} onPress={openFile}>
            <Text style={styles.fallbackButtonText}>Open in Browser</Text>
            <ExternalLink size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.viewerContainer}>
      <StatusBar style="light" />
      
      {/* Absolute Transparent Header */}
      <Animated.View entering={FadeIn.delay(300)} style={[styles.headerOverlay, { paddingTop: insets.top + 10 }]}>
        <Pressable 
          onPress={() => {
            Haptics.selectionAsync();
            navigation?.goBack();
          }} 
          style={styles.headerBackBtn}
        >
          <ArrowLeft color="#fff" size={24} strokeWidth={2.5} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title || "Document Viewer"}
        </Text>
        <View style={{ width: 40 }} /> {/* For alignment */}
      </Animated.View>

      {isPdf ? (
        <View style={styles.pdfWrapper}>
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={BRAND.primary} />
              <Text style={styles.loadingText}>Loading Document...</Text>
            </View>
          )}

          <Pdf
            source={pdfSource as any}
            style={styles.pdfView}
            trustAllCerts={false}
            onLoadComplete={(numberOfPages: number) => {
              setTotalPages(numberOfPages || 1);
              setIsLoading(false);
            }}
            onPageChanged={(page: number) => {
              setCurrentPage(page);
            }}
            onError={(error: unknown) => {
              console.log("PDF Load Error:", error);
              setIsLoading(false);
              Alert.alert("Error", "Unable to load file securely.");
            }}
          />
          
          {/* Subtle Watermark */}
          <View style={styles.watermarkOverlay} pointerEvents="none">
            <Text style={styles.watermarkText}>
              {`${watermarkChunks}\n\n${watermarkChunks}\n\n${watermarkChunks}\n\n${watermarkChunks}\n\n${watermarkChunks}`}
            </Text>
          </View>

          {/* Floating Page Indicator */}
          {!isLoading && totalPages > 0 && (
            <Animated.View entering={FadeInDown.delay(500)} style={[styles.pageIndicator, { bottom: insets.bottom + 24 }]}>
              <Text style={styles.pageIndicatorText}>
                {currentPage} / {totalPages}
              </Text>
            </Animated.View>
          )}
        </View>
      ) : (
        <View style={styles.unsupportedContainer}>
          <Pressable onPress={() => navigation?.goBack()} style={[styles.headerBackBtn, { position: "absolute", top: insets.top + 10, left: 16 }]}>
            <ArrowLeft color={BRAND.text} size={28} />
          </Pressable>
          <FileText color={BRAND.textMuted} size={64} strokeWidth={1} style={{ marginBottom: 16 }} />
          <Text style={styles.unsupportedText}>File type not supported</Text>
          <Text style={styles.unsupportedSubText}>Please use PDF files for the secure viewer.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.background },
  viewerContainer: { flex: 1, backgroundColor: BRAND.darkBg },

  // Header Overlay
  headerOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "rgba(0,0,0,0.4)", // Semi-transparent for PDF
    zIndex: 200, // Above everything
  },
  headerBackBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  headerTitle: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center", paddingHorizontal: 16 },

  pdfWrapper: { flex: 1, position: "relative" },
  pdfView: { flex: 1, width: width, backgroundColor: "transparent" },

  // Loading
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: BRAND.darkBg, justifyContent: "center", alignItems: "center", zIndex: 150 },
  loadingText: { color: "#fff", marginTop: 16, fontSize: 16, fontWeight: "500" },

  // Watermark
  watermarkOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center", overflow: "hidden", zIndex: 100 },
  watermarkText: {
    color: "rgba(255, 255, 255, 0.05)", // Better opacity for dark background
    fontSize: 22,
    fontWeight: "800",
    transform: [{ rotate: "-35deg" }],
    textAlign: "center",
    lineHeight: 60,
    width: width * 2,
  },

  // Pagination Pill
  pageIndicator: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    zIndex: 200,
  },
  pageIndicatorText: { color: "#fff", fontSize: 14, fontWeight: "700", letterSpacing: 1 },

  // Security Blocked State
  blockedScreen: { flex: 1, backgroundColor: "#111", justifyContent: "center", alignItems: "center" },
  blockedContent: { alignItems: "center", paddingHorizontal: 32 },
  blockedTitle: { color: "#FFF", fontSize: 26, fontWeight: "800", marginBottom: 12 },
  blockedText: { color: "#9CA3AF", fontSize: 16, textAlign: "center", marginBottom: 32, lineHeight: 24 },
  unblockBtn: { backgroundColor: BRAND.primary, width: "100%", paddingVertical: 16, borderRadius: 16, alignItems: "center", marginBottom: 16 },
  unblockBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  leaveBtn: { paddingVertical: 12 },
  leaveBtnText: { color: BRAND.textMuted, fontSize: 16, fontWeight: "600" },

  // Expo Go Fallback
  fallbackHeader: { paddingHorizontal: 16, paddingBottom: 16 },
  backBtnWrapper: { padding: 8, marginLeft: -8 },
  fallbackCard: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32, marginTop: -50 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: BRAND.primary + "15", justifyContent: "center", alignItems: "center", marginBottom: 24 },
  fallbackTitle: { fontSize: 22, fontWeight: "800", color: BRAND.text, textAlign: "center", marginBottom: 12 },
  fallbackDesc: { fontSize: 15, lineHeight: 22, color: BRAND.textMuted, textAlign: "center", marginBottom: 32 },
  fallbackButton: { backgroundColor: BRAND.primary, borderRadius: 16, width: "100%", paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  fallbackButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },

  // Unsupported
  unsupportedContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: BRAND.background },
  unsupportedText: { fontSize: 20, fontWeight: "700", color: BRAND.text, marginBottom: 8 },
  unsupportedSubText: { fontSize: 15, color: BRAND.textMuted, textAlign: "center" },
});