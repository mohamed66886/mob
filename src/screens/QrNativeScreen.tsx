import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  Platform,
  Animated,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { usePreventScreenCapture } from "expo-screen-capture";
import QRCode from "react-native-qrcode-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LottieView from "../components/AppLottieView.native";

// Ensure your import paths are correct
import { api } from "../lib/api";
import { User } from "../types/auth";
import { QrCode, CheckCircle2, X, Camera, ScanLine } from "lucide-react-native";

const BRAND = {
  primary: "#3390ec",
  primaryDark: "#2b7cb9",
  background: "#f4f6f9",
  surface: "#FFFFFF",
  text: "#1c1c1e",
  textMuted: "#8e8e93",
  border: "#E5E5EA",
  danger: "#ff3b30",
  success: "#34c759",
};

const { width } = Dimensions.get("window");
const NO_ACTIVE_LECTURE_LOTTIE_URL =
  "https://lottie.host/36231eac-12d7-4faa-962a-a63da9e1fea8/8RCqh6mgDP.json";

const getAvatarColor = (name: string) => {
  const colors = ['#e17076', '#faa774', '#a695e7', '#7bc862', '#6ec9cb', '#65aadd', '#ee7aae'];
  const charCode = (name || "X").charCodeAt(0) || 0;
  return colors[charCode % colors.length];
};

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

async function getDeviceFingerprint(): Promise<string> {
  try {
    let fp = await AsyncStorage.getItem("device_fingerprint");
    if (!fp) {
      fp = "fp_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 10);
      await AsyncStorage.setItem("device_fingerprint", fp);
    }
    return fp;
  } catch {
    return "unknown_device_fp";
  }
}

// Professional camera frame overlay
const ScannerOverlay = () => (
  <View style={styles.scannerOverlay}>
    <View style={styles.focusFrame}>
      <View style={[styles.corner, styles.topLeft]} />
      <View style={[styles.corner, styles.topRight]} />
      <View style={[styles.corner, styles.bottomLeft]} />
      <View style={[styles.corner, styles.bottomRight]} />
      <Animated.View style={styles.scanLine} />
    </View>
  </View>
);

export default function UnifiedQrNativeScreen({ token, user }: { token: string; user: User }) {
  usePreventScreenCapture();
  const insets = useSafeAreaInsets();

  const role = String(user?.role || "").toLowerCase().trim();
  const isStudent = role === "student";
  const canScan = isStudent; // Student is now the scanner
  const canGenerate = role === "doctor" || role === "assistant"; // Doctor/Assistant is now the generator
  const isAdmin = ["super_admin", "college_admin", "university_admin"].includes(role);

  const [isLoading, setIsLoading] = useState(true);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [inlineNotice, setInlineNotice] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  
  const [qrTs, setQrTs] = useState(Date.now());
  const [isScanning, setIsScanning] = useState(false);
  const [scanLock, setScanLock] = useState(false);
  const [scanLog, setScanLog] = useState<any[]>([]);
  const [cameraZoom, setCameraZoom] = useState(0.08);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  
  const [permission, requestPermission] = useCameraPermissions();
  const wasLectureActiveRef = useRef(false);
  const consecutiveFetchFailuresRef = useRef(0);

  // --- Animations ---
  const scrollY = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const HEADER_MAX_HEIGHT = 90 + insets.top;
  const HEADER_MIN_HEIGHT = 60 + insets.top;

  const headerHeight = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [HEADER_MAX_HEIGHT, HEADER_MIN_HEIGHT],
    extrapolate: "clamp",
  });

  const titleOpacity = scrollY.interpolate({
    inputRange: [0, 50],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  // QR Pulse Effect (Now for those who generate)
  useEffect(() => {
    if (canGenerate) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [canGenerate]);

  // Data Fetching & Timers
  useEffect(() => {
    const interval = setInterval(() => setQrTs(Date.now()), 5000); // 5 seconds refresh rate
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!inlineNotice) return;
    const timer = setTimeout(() => setInlineNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [inlineNotice]);

  useEffect(() => {
    if (!showSuccessPopup) return;
    const timer = setTimeout(() => setShowSuccessPopup(false), 2200);
    return () => clearTimeout(timer);
  }, [showSuccessPopup]);

  useEffect(() => {
    const resolveActiveLecture = async () => {
      try {
        const primary = await api.get("/lectures/active-for-user", authHeaders(token));
        if (primary?.data) return primary.data;
      } catch {
        // Fallbacks below handle roles/environments where this endpoint may fail.
      }

      if (role === "student") {
        try {
          const mySubjectsRes = await api.get("/subjects/my-subjects", authHeaders(token));
          const mySubjects = Array.isArray(mySubjectsRes?.data) ? mySubjectsRes.data : [];

          if (mySubjects.length === 0) return null;

          const lectureRequests = mySubjects.map((subject: any) =>
            api.get(`/lectures?subject_id=${subject.id}`, authHeaders(token)),
          );

          const lectureResponses = await Promise.allSettled(lectureRequests);
          for (const item of lectureResponses) {
            if (item.status !== "fulfilled") continue;
            const rows = Array.isArray(item.value?.data) ? item.value.data : [];
            const active = rows.find((l: any) => !!l?.is_active);
            if (active) return active;
          }
        } catch {
          // Continue to generic fallback.
        }
      }

      try {
        const generic = await api.get("/lectures", authHeaders(token));
        const rows = Array.isArray(generic?.data) ? generic.data : [];
        const active = rows.find((l: any) => !!l?.is_active);
        return active || null;
      } catch {
        return null;
      }
    };

    const fetchSubjects = async () => {
      try {
        const lecture = await resolveActiveLecture();
        const hasActiveLecture = !!lecture?.subject_id;

        if (hasActiveLecture) {
          const onlySubject = {
            id: lecture.subject_id,
            name: lecture.subject_name || "Active lecture",
          };
          setSubjects([onlySubject]);
          setSelectedSubjectId(onlySubject.id);

          if (!wasLectureActiveRef.current) {
            setInlineNotice({
              type: "success",
              message: "Lecture is now active. QR is ready.",
            });
          }

          consecutiveFetchFailuresRef.current = 0;
        } else {
          setSubjects([]);
          setSelectedSubjectId(null);
          setStudents([]);

          if (wasLectureActiveRef.current) {
            setInlineNotice({
              type: "info",
              message: "The active lecture was ended.",
            });
          }

          consecutiveFetchFailuresRef.current = 0;
        }

        wasLectureActiveRef.current = hasActiveLecture;
      } catch {
        consecutiveFetchFailuresRef.current += 1;
        if (consecutiveFetchFailuresRef.current >= 2) {
          setInlineNotice({
            type: "error",
            message: "Failed to load active lecture.",
          });
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchSubjects();
    const interval = setInterval(fetchSubjects, 3000);

    return () => clearInterval(interval);
  }, [role, token]);

  useEffect(() => {
    if (!selectedSubjectId || isStudent) {
      setStudents([]);
      return;
    }
    const fetchStudents = async () => {
      try {
        const res = await api.get(`/students/by-subject/${selectedSubjectId}`, authHeaders(token));
        setStudents(res.data || []);
      } catch {
        setStudents([]);
      }
    };
    fetchStudents();
  }, [selectedSubjectId, isStudent, role, token]);

  // Scanner Logic
  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanLock || !selectedSubjectId) return;
    setScanLock(true); 

    try {
      const parsedData = JSON.parse(data);
      const qrDoctorId = Number(parsedData?.doctorId);
      const qrTs = Number(parsedData?.ts);
      const qrSubjectId = Number(parsedData?.subjectId);
      const selectedId = Number(selectedSubjectId);

      if (!Number.isInteger(qrDoctorId) || !Number.isInteger(qrTs) || !Number.isInteger(qrSubjectId)) {
        throw new Error("Invalid QR");
      }

      if (qrSubjectId !== selectedId) {
        setInlineNotice({
          type: "error",
          message: "This QR code is for a different subject.",
        });
        setTimeout(() => setScanLock(false), 2000);
        return;
      }

      // Keep in sync with backend validity window to avoid false client-side rejects.
      if (Math.abs(Date.now() - qrTs) > 60000) {
        setInlineNotice({
          type: "error",
          message: "This QR code has expired. Please scan a new one.",
        });
        setTimeout(() => setScanLock(false), 2000);
        return;
      }

      // Enhance with anti-cheat fingerprinting
      const deviceFingerprint = await getDeviceFingerprint();
      const deviceInfo = {
        userAgent: `AttendQR Mobile / ${Platform.OS} ${Platform.Version || "Unknown"}`,
        screenWidth: width,
        screenHeight: Dimensions.get("window").height,
        platform: Platform.OS,
        language: "en",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      // Hit an endpoint for student check-in
      const endpoint = "/attendance/scan"; 
      await api.post(endpoint, {
        subjectId: qrSubjectId,
        doctorId: qrDoctorId,
        ts: qrTs,
        deviceFingerprint,
        deviceInfo,
      }, authHeaders(token));

      setInlineNotice({
        type: "info",
        message: "Scan completed.",
      });
      setShowSuccessPopup(true);
      setIsScanning(false);
      
      // Haptic feedback could be added here
      setTimeout(() => setScanLock(false), 1200);
    } catch (error: any) {
      let serverMessage =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "Failed to record attendance.";

      if (
        typeof serverMessage === "string" &&
        /access denied|insufficient permissions/i.test(serverMessage)
      ) {
        const base = String(api.defaults.baseURL || "").replace(/\/api\/?$/, "");
        serverMessage = `Access denied from server: ${base}`;
      }

      setInlineNotice({
        type: "error",
        message: serverMessage,
      });
      setTimeout(() => setScanLock(false), 2000);
    }
  };

  const startScanner = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        setInlineNotice({
          type: "error",
          message: "Camera permission is required to scan QR.",
        });
        return;
      }
    }
    setCameraZoom(0.08);
    setIsScanning(true);
  };

  const changeZoom = (delta: number) => {
    setCameraZoom((prev) => {
      const next = prev + delta;
      if (next < 0) return 0;
      if (next > 0.6) return 0.6;
      return Number(next.toFixed(2));
    });
  };

  // --- Render Components ---
  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={BRAND.primary} />
        <Text style={styles.loadingText}>Preparing system...</Text>
      </View>
    );
  }

  const ListHeader = () => (
    <View style={styles.headerContainer}>
      {inlineNotice && (
        <View
          style={[
            styles.noticeBar,
            inlineNotice.type === "success"
              ? styles.noticeSuccess
              : inlineNotice.type === "error"
                ? styles.noticeError
                : styles.noticeInfo,
          ]}
        >
          <Text style={styles.noticeText}>{inlineNotice.message}</Text>
        </View>
      )}

      {/* Tabs */}
      {subjects.length > 0 && (
        <View style={styles.tabsWrapper}>
          <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
            {subjects.map((sub) => {
              const isSelected = sub.id === selectedSubjectId;
              return (
                <Pressable key={sub.id} style={[styles.tabBtn, isSelected && styles.tabBtnActive]} onPress={() => setSelectedSubjectId(sub.id)}>
                  <Text style={[styles.tabText, isSelected && styles.tabTextActive]}>{sub.name}</Text>
                </Pressable>
              );
            })}
          </Animated.ScrollView>
        </View>
      )}

      {!selectedSubjectId && (canGenerate || canScan) && (
        <View style={styles.noLectureCard}>
          {Platform.OS !== "web" ? (
            <LottieView
              source={{ uri: NO_ACTIVE_LECTURE_LOTTIE_URL }}
              autoPlay
              loop
              style={styles.noLectureLottie}
            />
          ) : (
            <ActivityIndicator size="large" color={BRAND.primary} />
          )}
          <Text style={styles.noLectureTitle}>QR needs an active lecture</Text>
          <Text style={styles.noLectureSubtitle}>
            Start the lecture first, and this page will update automatically.
          </Text>
        </View>
      )}

      {/* Doctor QR */}
      {canGenerate && (
        !selectedSubjectId ? (
          <View />
        ) : (
          <View style={styles.qrHeroSection}>
            <Animated.View style={[styles.qrWrapper, styles.cardShadow, { transform: [{ scale: pulseAnim }] }]}>
              <QRCode
                value={JSON.stringify({ doctorId: user.id, subjectId: selectedSubjectId, ts: qrTs })}
                size={width * 0.55}
                color={BRAND.text}
                backgroundColor={BRAND.surface}
              />
            </Animated.View>
            <Text style={styles.qrTitle}>Attendance QR</Text>
            <View style={styles.refreshIndicator}>
              <ActivityIndicator size="small" color={BRAND.primary} />
              <Text style={styles.qrSubtitle}>Refreshing every 5 seconds</Text>
            </View>
          </View>
        )
      )}

      {/* Scanner Section */}
      {canScan && selectedSubjectId && (
        <View style={styles.sectionContainer}>
          {!isScanning ? (
            <View style={[styles.listGroup, styles.cardShadow]}>
              <Pressable style={styles.listRow} onPress={startScanner}>
                <View style={[styles.iconBox, { backgroundColor: `${BRAND.primary}15` }]}>
                  <ScanLine color={BRAND.primary} size={28} />
                </View>
                <View style={styles.listRowContent}>
                  <Text style={styles.listTitle}>Open Scanner</Text>
                  <Text style={styles.listSubtitle}>Tap to scan the instructor's QR</Text>
                </View>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.scannerWrapper, styles.cardShadow]}>
              <View style={styles.scannerHeader}>
                <Text style={styles.scannerTitle}>Point camera at the instructor's QR code</Text>
                <Pressable onPress={() => setIsScanning(false)} style={styles.closeScannerBtn}>
                  <X color={BRAND.text} size={20} />
                </Pressable>
              </View>
              <View style={styles.cameraBox}>
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  facing="back"
                  zoom={cameraZoom}
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={scanLock ? undefined : handleBarcodeScanned}
                />
                <ScannerOverlay />

                <View style={styles.zoomControls}>
                  <Pressable onPress={() => changeZoom(-0.05)} style={styles.zoomBtn}>
                    <Text style={styles.zoomBtnText}>-</Text>
                  </Pressable>
                  <Text style={styles.zoomValueText}>{Math.round((1 + cameraZoom * 3) * 10) / 10}x</Text>
                  <Pressable onPress={() => changeZoom(0.05)} style={styles.zoomBtn}>
                    <Text style={styles.zoomBtnText}>+</Text>
                  </Pressable>
                </View>

                {scanLock && (
                  <View style={styles.scanLockOverlay}>
                    <ActivityIndicator size="large" color="#fff" />
                    <Text style={styles.scanLockText}>Verifying...</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Scan Log - Optionally kept for doctors but currently disabled since student scans */}
        </View>
      )}

      {/* List Title for Students */}
      {(isAdmin || canGenerate) && students.length > 0 && (
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
          Enrolled Students ({students.length})
        </Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {showSuccessPopup && (
        <View style={[styles.successPopupWrap, { top: HEADER_MAX_HEIGHT + 10 }]}> 
          <View style={styles.successPopupCard}>
            <View style={styles.successIconWrap}>
              <CheckCircle2 color={BRAND.success} size={22} />
            </View>
            <Text style={styles.successPopupTitle}>Attendance Recorded Successfully</Text>
          </View>
        </View>
      )}
      
      {/* Animated Header */}
      <Animated.View style={[styles.header, { height: headerHeight, paddingTop: insets.top }]}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconBg}>
             <QrCode color={BRAND.primary} size={24} strokeWidth={2.5} />
          </View>
          <Animated.View style={{ marginLeft: 12, opacity: titleOpacity }}>
            <Text style={styles.headerTitle}>Attendance System</Text>
            <Text style={styles.headerSubtitle}>Unified QR Code</Text>
          </Animated.View>
        </View>
      </Animated.View>

      {(isAdmin || canGenerate) ? (
        <Animated.FlatList
          data={students}
          keyExtractor={(item, index) => item.id?.toString() || index.toString()}
          contentContainerStyle={[styles.scrollContent, { paddingTop: HEADER_MAX_HEIGHT }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={ListHeader}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
          renderItem={({ item, index }) => {
            const isLast = index === students.length - 1;
            return (
              <View style={[styles.listGroup, styles.cardShadow, { marginBottom: isLast ? 0 : 8 }]}> 
                <View style={[styles.listRow, styles.noBorder]}>
                  <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.name) }]}> 
                    <Text style={styles.avatarText}>{item.name?.charAt(0).toUpperCase() || "S"}</Text>
                  </View>
                  <View style={styles.listRowContent}>
                    <Text style={styles.listTitle} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.listSubtitle}>{item.academic_code} • {item.level_name}</Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      ) : (
        <Animated.ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: HEADER_MAX_HEIGHT }]}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
        >
          <ListHeader />
        </Animated.ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.background },
  loadingScreen: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: BRAND.background },
  loadingText: { fontSize: 16, color: BRAND.textMuted, marginTop: 12, fontWeight: "600" },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },
  headerContainer: { paddingBottom: 16 },
  
  cardShadow: {
    backgroundColor: BRAND.surface, borderRadius: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 },
      android: { elevation: 2 },
    }),
  },

  header: { 
    position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 20, backgroundColor: BRAND.surface, zIndex: 10,
    ...Platform.select({
      android: { elevation: 3 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
    }),
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  headerIconBg: { backgroundColor: `${BRAND.primary}15`, padding: 10, borderRadius: 14 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: BRAND.text },
  headerSubtitle: { fontSize: 13, color: BRAND.textMuted, fontWeight: "500" },

  tabsWrapper: { paddingVertical: 12 },
  tabsScroll: { gap: 10, paddingRight: 16 },
    noticeBar: {
      marginTop: 8,
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
    },
    noticeSuccess: {
      backgroundColor: "#e8f8ef",
      borderColor: "#b8e8c8",
    },
    noticeError: {
      backgroundColor: "#feecec",
      borderColor: "#f8c1c1",
    },
    noticeInfo: {
      backgroundColor: "#eef5ff",
      borderColor: "#c8ddff",
    },
    noticeText: {
      fontSize: 13,
      fontWeight: "700",
      color: BRAND.text,
      textAlign: "center",
    },

  tabBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 24, backgroundColor: BRAND.border, borderWidth: 1, borderColor: BRAND.border },
  tabBtnActive: { backgroundColor: BRAND.primary, borderColor: BRAND.primaryDark },
  tabText: { fontSize: 15, fontWeight: "600", color: BRAND.textMuted },
  tabTextActive: { color: "#FFF" },

  noLectureCard: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  noLectureLottie: { width: 170, height: 170 },
  noLectureTitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: "800",
    color: BRAND.text,
    textAlign: "center",
  },
  noLectureSubtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: BRAND.textMuted,
    textAlign: "center",
    maxWidth: 320,
  },

  qrHeroSection: { alignItems: "center", justifyContent: "center", paddingVertical: 32 },
  qrWrapper: { padding: 24, marginBottom: 24, borderRadius: 24, backgroundColor: "#fff" },
  qrTitle: { fontSize: 22, fontWeight: "800", color: BRAND.text, marginBottom: 12 },
  refreshIndicator: { flexDirection: "row", alignItems: "center", backgroundColor: `${BRAND.primary}10`, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, gap: 8 },
  qrSubtitle: { fontSize: 14, color: BRAND.primaryDark, fontWeight: "600" },

  sectionContainer: { marginTop: 16 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: BRAND.textMuted, marginBottom: 12, marginLeft: 4, textTransform: "uppercase" },
  listGroup: { overflow: "hidden" },
  listRow: { flexDirection: "row", alignItems: "center", paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.border },
  noBorder: { borderBottomWidth: 0 },
  iconBox: { width: 48, height: 48, borderRadius: 14, justifyContent: "center", alignItems: "center", marginRight: 16 },
  listRowContent: { flex: 1, justifyContent: "center", gap: 2 },
  listTitle: { fontSize: 16, fontWeight: "700", color: BRAND.text },
  listSubtitle: { fontSize: 14, color: BRAND.textMuted },
  
  avatar: { width: 46, height: 46, borderRadius: 14, justifyContent: "center", alignItems: "center", marginRight: 16 },
  avatarText: { color: "white", fontSize: 18, fontWeight: "800" },

  scannerWrapper: { overflow: "hidden", borderRadius: 16 },
  scannerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.border, backgroundColor: BRAND.surface },
  scannerTitle: { fontSize: 16, fontWeight: "700", color: BRAND.text },
  closeScannerBtn: { padding: 6, backgroundColor: BRAND.background, borderRadius: 20 },
  cameraBox: { width: "100%", height: width * 1.1, position: "relative", backgroundColor: "#000" },
  zoomControls: {
    position: "absolute",
    right: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  zoomBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  zoomBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 20,
  },
  zoomValueText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    minWidth: 34,
    textAlign: "center",
  },

  successPopupWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 30,
  },
  successPopupCard: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ecf9f0",
    borderWidth: 1,
    borderColor: "#bfe9cb",
  },
  successIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d8f3e2",
  },
  successPopupTitle: {
    flex: 1,
    color: "#1f7a40",
    fontSize: 14,
    fontWeight: "800",
  },
  
  // Scanner Overlay Styles
  scannerOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  focusFrame: { width: 220, height: 220, position: "relative" },
  corner: { position: "absolute", width: 40, height: 40, borderColor: BRAND.primary, borderWidth: 4 },
  topLeft: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 16 },
  topRight: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 16 },
  bottomLeft: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 16 },
  bottomRight: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 16 },
  scanLine: { position: "absolute", width: "100%", height: 2, backgroundColor: BRAND.success, top: "50%", opacity: 0.6 },

  scanLockOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", alignItems: "center", zIndex: 10 },
  scanLockText: { color: "white", fontSize: 18, fontWeight: "700", marginTop: 16 },
});