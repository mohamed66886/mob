import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  Dimensions,
  AppState,
  AppStateStatus,
  Alert,
} from "react-native";
import * as ScreenCapture from "expo-screen-capture";
import Constants from "expo-constants";
import { WebView } from "react-native-webview";
import Pdf from "react-native-pdf";
import { User } from "../types/auth";
import { api } from "../lib/api";

const { width, height } = Dimensions.get("window");

const BRAND = {
  primary: "#11468f",
  primaryDark: "#0f3f7f",
  surface: "#FFFFFF",
  background: "#F8FAFC",
  textMuted: "#64748B",
  border: "#E1E9F2",
};

export default function MaterialViewerNativeScreen({
  token,
  user,
  route,
  navigation,
}: {
  token: string;
  user: User;
  route?: any;
  navigation?: any;
}) {
  const { id: materialId, type, url } = route?.params || {};

  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [isViewerBlocked, setIsViewerBlocked] = useState(false);

  const isPdf = type === "pdf";
  const isExpoGo = Constants.appOwnership === "expo";

  const resolvedUrl = (() => {
    const raw = String(url || "").trim();
    if (raw && /^https?:\/\//i.test(raw)) return raw;
    if (raw) {
      const base = String(api.defaults.baseURL || "https://attendqr.tech/api").replace(/\/api\/?$/, "");
      return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
    }
    return `${api.defaults.baseURL}/materials/${materialId}/file`;
  })();

  const pdfSource = {
    uri: resolvedUrl,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf" },
    cache: true,
  };

  // 1. Watermark setup
  const studentCodeWatermark =
    user?.username || user?.name || `ID-${user?.id ?? "USER"}`;
  const watermarkChunks = Array.from({ length: 20 }, () => studentCodeWatermark).join("   ");

  // 2. Anti-Cheat: Block Screenshots & Handle App Backgrounding
  useEffect(() => {
    const setupSecurity = async () => {
      try {
        // Prevents screenshots and screen recordings (Android turns black, iOS might send a warning/black out depending on OS version)
        await ScreenCapture.preventScreenCaptureAsync();
      } catch (e) {
        console.warn("Screen capture prevention not supported on this environment");
      }
    };

    setupSecurity();

    // Listen if user minimizes the app (to prevent reading from the task switcher)
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (appState.match(/active/) && nextAppState === "background") {
        setIsViewerBlocked(true); // Lock viewer if they leave
      }
      setAppState(nextAppState);
    });

    return () => {
      subscription.remove();
      ScreenCapture.allowScreenCaptureAsync().catch(() => {});
    };
  }, [appState]);

  // Handle blocking mechanism
  if (isViewerBlocked) {
    return (
      <SafeAreaView style={styles.blockedScreen}>
        <Text style={styles.blockedTitle}>Viewer Locked</Text>
        <Text style={styles.blockedText}>
          The viewer was locked to protect the content because the app was minimized.
        </Text>
        <Pressable
          style={styles.unblockBtn}
          onPress={() => setIsViewerBlocked(false)}
        >
          <Text style={styles.unblockBtnText}>Reload Material</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      {/* Content */}
      <View style={styles.viewerContainer}>
        {isPdf ? (
          <View style={styles.pdfWrapper}>
            {isExpoGo ? (
              <WebView
                source={{ uri: pdfSource.uri, headers: pdfSource.headers }}
                originWhitelist={["*"]}
                onLoadEnd={() => {
                  if (totalPages === 0) setTotalPages(1);
                }}
                onNavigationStateChange={() => {
                  setCurrentPage(1);
                }}
                onError={(error: unknown) => {
                  console.log("PDF Load Error:", error);
                  Alert.alert("Error", "Unable to load file securely.");
                }}
                style={styles.pdfView}
              />
            ) : (
              <Pdf
                source={pdfSource as any}
                style={styles.pdfView}
                trustAllCerts={false}
                onLoadComplete={(numberOfPages: number) => {
                  setTotalPages(numberOfPages || 1);
                }}
                onPageChanged={(page: number) => {
                  setCurrentPage(page);
                }}
                onError={(error: unknown) => {
                  console.log("PDF Load Error:", error);
                  Alert.alert("Error", "Unable to load file securely.");
                }}
              />
            )}
            
            {/* Native Watermark Overlay */}
            <View style={styles.watermarkOverlay} pointerEvents="none">
              <Text style={styles.watermarkText}>
                {`${watermarkChunks}\n\n${watermarkChunks}\n\n${watermarkChunks}\n\n${watermarkChunks}`}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.unsupportedContainer}>
            <Text style={styles.unsupportedText}>
              This file type is not supported for in-app viewing.
            </Text>
            <Text style={styles.unsupportedSubText}>
              Please use PDF files for the secure viewer.
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.background },

  viewerContainer: {
    flex: 1,
    backgroundColor: "#E5E7EB", // Darker background to make PDF pop
  },
  pdfWrapper: {
    flex: 1,
    position: "relative",
  },
  pdfView: {
    flex: 1,
    width: width,
    height: height,
    backgroundColor: "transparent",
  },

  // Watermark styling
  watermarkOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    zIndex: 100, // Make sure it's above the PDF
  },
  watermarkText: {
    color: "rgba(0, 0, 0, 0.08)", // Very subtle opacity
    fontSize: 24,
    fontWeight: "900",
    transform: [{ rotate: "-35deg" }],
    textAlign: "center",
    lineHeight: 60,
    width: width * 2, // Extra width to cover rotation corners
  },

  // Blocked / Unsupported States
  blockedScreen: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  blockedTitle: { color: "#FFF", fontSize: 24, fontWeight: "bold", marginBottom: 12 },
  blockedText: { color: "#9CA3AF", fontSize: 15, textAlign: "center", marginBottom: 30, lineHeight: 22 },
  unblockBtn: { backgroundColor: BRAND.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  unblockBtnText: { color: "#FFF", fontSize: 16, fontWeight: "bold" },

  unsupportedContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  unsupportedText: { fontSize: 16, color: BRAND.textMuted, textAlign: "center", marginBottom: 8 },
  unsupportedSubText: { fontSize: 13, color: BRAND.border, textAlign: "center" },
});