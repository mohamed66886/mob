import React, { useState, useEffect } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn } from "react-native-reanimated";
import { ArrowLeft, ShieldAlert } from "lucide-react-native";

import { User } from "../types/auth";
import { api } from "../lib/api";

const { width } = Dimensions.get("window");

const BRAND = {
  primary: "#3390ec",
  primaryDark: "#2b7cb9",
  surface: "#FFFFFF",
  background: "#f1f2f6",
  text: "#1c1c1e",
  textMuted: "#8e8e93",
  border: "#E5E5EA",
  darkBg: "#1e1e1e",
};

/**
 * Expo Go fallback for MaterialViewerNativeScreen
 * Uses WebView to render materials inline instead of opening in browser
 */
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
  const { id: materialId, title, type, url } = route?.params || {};
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(true);

  const isPdf = type === "pdf";

  const resolvedUrl = (() => {
    const raw = String(url || "").trim();
    if (raw && /^https?:\/\//i.test(raw)) return raw;
    if (raw) {
      const base = String(api.defaults.baseURL || "https://attendqr.tech/api").replace(/\/api\/?$/, "");
      return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
    }
    return `${api.defaults.baseURL}/materials/${materialId}/file`;
  })();

  // Watermark
  const studentCodeWatermark = user?.username || user?.name || `ID-${user?.id ?? "USER"}`;
  const watermarkChunks = Array.from({ length: 25 }, () => studentCodeWatermark).join("    ");

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
            style={[styles.webView, { marginTop: insets.top + 60 }]}
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

const styles = StyleSheet.create({
  viewerContainer: { flex: 1, backgroundColor: BRAND.darkBg },

  headerOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 200,
  },
  headerBackBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center", alignItems: "center",
  },
  headerTitle: {
    flex: 1, color: "#fff", fontSize: 16, fontWeight: "600",
    textAlign: "center", paddingHorizontal: 16,
  },

  pdfWrapper: { flex: 1, position: "relative" },
  webView: { flex: 1, width: width, backgroundColor: "transparent" },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BRAND.darkBg,
    justifyContent: "center", alignItems: "center",
    zIndex: 150,
  },
  loadingText: { color: "#fff", marginTop: 16, fontSize: 16, fontWeight: "500" },

  watermarkOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center", alignItems: "center",
    overflow: "hidden", zIndex: 100,
  },
  watermarkText: {
    color: "rgba(255, 255, 255, 0.05)",
    fontSize: 22, fontWeight: "800",
    transform: [{ rotate: "-35deg" }],
    textAlign: "center", lineHeight: 60,
    width: width * 2,
  },
});
