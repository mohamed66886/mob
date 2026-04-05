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
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as ScreenCapture from "expo-screen-capture";
import Constants from "expo-constants";
import { WebView } from "react-native-webview";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { ArrowLeft, ShieldAlert, FileText } from "lucide-react-native";

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

  const safePdfUrl = resolvedUrl.includes("?") ? `${resolvedUrl}&ext=.pdf` : `${resolvedUrl}?ext=.pdf`;

  const pdfSource = {
    uri: safePdfUrl,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf" },
    cache: false,
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
    const [pdfBase64, setPdfBase64] = useState<string | null>(null);
    const [loadError, setLoadError] = useState(false);

    // Fetch PDF with auth and convert to base64 for inline rendering
    useEffect(() => {
      if (!isPdf) {
        setIsLoading(false);
        return;
      }
      let cancelled = false;
      (async () => {
        try {
          const response = await fetch(resolvedUrl, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf" },
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          const reader = new FileReader();
          reader.onloadend = () => {
            if (cancelled) return;
            const base64 = (reader.result as string).split(",")[1];
            setPdfBase64(base64);
            setIsLoading(false);
          };
          reader.onerror = () => {
            if (cancelled) return;
            setLoadError(true);
            setIsLoading(false);
          };
          reader.readAsDataURL(blob);
        } catch (e) {
          console.warn("PDF fetch error:", e);
          if (!cancelled) {
            setLoadError(true);
            setIsLoading(false);
          }
        }
      })();
      return () => { cancelled = true; };
    }, [resolvedUrl, token, isPdf]);

    // Build HTML that uses PDF.js to render the base64 PDF
    const pdfViewerHtml = pdfBase64 ? `
      <!DOCTYPE html>
      <html><head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            background: #1e1e1e; 
            overflow-y: auto; 
            -webkit-overflow-scrolling: touch; 
            -webkit-touch-callout: none;
            -webkit-user-select: none;
            -khtml-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            user-select: none;
          }
          canvas { display: block; margin: 8px auto; max-width: 100%; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
          #loading { color: #fff; text-align: center; padding: 40px; font-family: -apple-system, sans-serif; font-size: 16px; }
          #error { color: #ff6b6b; text-align: center; padding: 40px; font-family: -apple-system, sans-serif; }
        </style>
      </head><body oncontextmenu="return false;">
        <div id="container"></div>
        <script>
          window.addEventListener('contextmenu', function (e) { e.preventDefault(); });
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          
          const pdfData = atob('${pdfBase64}');
          const uint8 = new Uint8Array(pdfData.length);
          for (let i = 0; i < pdfData.length; i++) uint8[i] = pdfData.charCodeAt(i);
          
          pdfjsLib.getDocument({ data: uint8 }).promise.then(async (pdf) => {
            const container = document.getElementById('container');
            const dpr = window.devicePixelRatio || 1;
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const scale = (window.innerWidth - 16) / page.getViewport({ scale: 1 }).width;
              const viewport = page.getViewport({ scale: scale * dpr });
              const canvas = document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              canvas.style.width = (viewport.width / dpr) + 'px';
              canvas.style.height = (viewport.height / dpr) + 'px';
              container.appendChild(canvas);
              await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            }
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage('loaded');
          }).catch((err) => {
            document.getElementById('container').innerHTML = '<div id="error">Failed to render PDF</div>';
          });
        </script>
      </body></html>
    ` : null;

    const videoHtml = type === "video" ? `
      <!DOCTYPE html>
      <html><head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            background: #1e1e1e; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            -webkit-touch-callout: none;
            -webkit-user-select: none;
            -khtml-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            user-select: none;
          }
          video { width: 100%; max-height: 100vh; object-fit: contain; }
        </style>
      </head><body oncontextmenu="return false;">
        <video controls controlsList="nodownload noremoteplayback" disablePictureInPicture playsinline>
          <source src="${resolvedUrl}" />
          Your browser does not support the video tag.
        </video>
        <script>
          window.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        </script>
      </body></html>
    ` : null;

    const getSource = () => {
      if (isPdf && pdfViewerHtml) return { html: pdfViewerHtml };
      if (type === "video" && videoHtml) return { html: videoHtml };
      return { uri: resolvedUrl, headers: { Authorization: `Bearer ${token}` } };
    };

    const showWebView = !isPdf || pdfBase64 !== null;

    return (
      <View style={styles.viewerContainer}>
        <StatusBar style="light" />

        {/* Header */}
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
          <View style={{ width: 40 }} />
        </Animated.View>

        {/* Inline Viewer */}
        <View style={styles.pdfWrapper}>
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={BRAND.primary} />
              <Text style={styles.loadingText}>Loading Document...</Text>
            </View>
          )}

          {loadError && (
            <View style={styles.loadingOverlay}>
              <ShieldAlert color="#FF3B30" size={48} strokeWidth={1.5} />
              <Text style={[styles.loadingText, { marginTop: 16 }]}>Failed to load document</Text>
              <Pressable
                style={{ marginTop: 20, backgroundColor: BRAND.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
                onPress={() => {
                  setLoadError(false);
                  setIsLoading(true);
                  setPdfBase64(null);
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Retry</Text>
              </Pressable>
            </View>
          )}

          {showWebView && !loadError && (
            <WebView
              source={getSource()}
              style={[styles.pdfView, { marginTop: insets.top + 60 }]}
              originWhitelist={["*"]}
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              scalesPageToFit={true}
              injectedJavaScript={`
                var style = document.createElement('style');
                style.type = 'text/css';
                style.innerHTML = 'body { -webkit-touch-callout: none; -webkit-user-select: none; -khtml-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; outline: none; -webkit-tap-highlight-color: rgba(0,0,0,0); }';
                document.head.appendChild(style);
                window.addEventListener('contextmenu', function (e) { e.preventDefault(); });
                true;
              `}
              onError={() => {
                setIsLoading(false);
                Alert.alert("Error", "Unable to display file.");
              }}
            />
          )}

          {/* Watermark */}
          <View style={styles.watermarkOverlay} pointerEvents="none">
            <Text style={styles.watermarkText}>
              {`${watermarkChunks}\n\n${watermarkChunks}\n\n${watermarkChunks}\n\n${watermarkChunks}\n\n${watermarkChunks}`}
            </Text>
          </View>
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
            trustAllCerts={Platform.OS === 'android'}
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
              Alert.alert("Error", "Unable to load file securely. Please try again.");
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