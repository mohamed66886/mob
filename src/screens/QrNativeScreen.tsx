import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Dimensions,
  StatusBar,
  Platform,
  Animated,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { usePreventScreenCapture } from "expo-screen-capture";
import QRCode from "react-native-qrcode-svg";
import LottieView from "lottie-react-native";

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

const getAvatarColor = (name: string) => {
  const colors = ['#e17076', '#faa774', '#a695e7', '#7bc862', '#6ec9cb', '#65aadd', '#ee7aae'];
  const charCode = (name || "X").charCodeAt(0) || 0;
  return colors[charCode % colors.length];
};

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
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

  const role = user?.role;
  const isStudent = role === "student";
  const canScan = role === "doctor" || role === "assistant";
  const isAdmin = ["super_admin", "college_admin", "university_admin"].includes(role);

  const [isLoading, setIsLoading] = useState(true);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  
  const [qrTs, setQrTs] = useState(Date.now());
  const [isScanning, setIsScanning] = useState(false);
  const [scanLock, setScanLock] = useState(false);
  const [scanLog, setScanLog] = useState<any[]>([]);
  
  const [permission, requestPermission] = useCameraPermissions();

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

  // QR Pulse Effect
  useEffect(() => {
    if (isStudent) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [isStudent]);

  // Data Fetching & Timers
  useEffect(() => {
    const interval = setInterval(() => setQrTs(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const endpoint = isStudent ? "/subjects/my-subjects" : "/subjects";
        const res = await api.get(endpoint, authHeaders(token));
        setSubjects(res.data || []);
        if (res.data?.length > 0) setSelectedSubjectId(res.data[0].id);
      } catch (err) {
        Alert.alert("Error", "Failed to load subjects");
      } finally {
        setIsLoading(false);
      }
    };
    fetchSubjects();
  }, [isStudent, token]);

  useEffect(() => {
    if (!selectedSubjectId || isStudent || role === "assistant") {
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
      if (!parsedData.studentId || !parsedData.ts) throw new Error("Invalid QR");

      if (Math.abs(Date.now() - parsedData.ts) > 35000) {
        Alert.alert("Expired", "This QR code has expired. Ask the student to refresh it.");
        setTimeout(() => setScanLock(false), 2000);
        return;
      }

      const endpoint = role === "assistant" ? "/assistants/scan" : "/attendance/scan";
      const res = await api.post(endpoint, {
        studentId: parsedData.studentId,
        subjectId: selectedSubjectId,
        ts: parsedData.ts,
      }, authHeaders(token));

      setScanLog((prev) => [
        {
          id: `${Date.now()}-${parsedData.studentId}`,
          student: res.data.student,
          code: res.data.academic_code,
          status: res.data.status,
        },
        ...prev,
      ]);
      
      // Haptic feedback could be added here
      setTimeout(() => setScanLock(false), 1200);
    } catch (error) {
      Alert.alert("Error", "Invalid QR code or student already recorded.");
      setTimeout(() => setScanLock(false), 2000);
    }
  };

  const startScanner = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) return Alert.alert("Permission Required", "Camera access is needed to scan QR codes");
    }
    setIsScanning(true);
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
      {/* Tabs */}
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

      {/* Student QR */}
      {isStudent && (
        !selectedSubjectId ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No available subjects to generate a QR</Text>
          </View>
        ) : (
          <View style={styles.qrHeroSection}>
            <Animated.View style={[styles.qrWrapper, styles.cardShadow, { transform: [{ scale: pulseAnim }] }]}>
              <QRCode
                value={JSON.stringify({ studentId: user.id, subjectId: selectedSubjectId, ts: qrTs })}
                size={width * 0.55}
                color={BRAND.text}
                backgroundColor={BRAND.surface}
              />
            </Animated.View>
            <Text style={styles.qrTitle}>Attendance Pass</Text>
            <View style={styles.refreshIndicator}>
              <ActivityIndicator size="small" color={BRAND.primary} />
              <Text style={styles.qrSubtitle}>Auto-refreshing for your security</Text>
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
                  <Text style={styles.listSubtitle}>Tap to start attendance scanning</Text>
                </View>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.scannerWrapper, styles.cardShadow]}>
              <View style={styles.scannerHeader}>
                <Text style={styles.scannerTitle}>Point the camera at the student's QR code</Text>
                <Pressable onPress={() => setIsScanning(false)} style={styles.closeScannerBtn}>
                  <X color={BRAND.text} size={20} />
                </Pressable>
              </View>
              <View style={styles.cameraBox}>
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={scanLock ? undefined : handleBarcodeScanned}
                />
                <ScannerOverlay />
                {scanLock && (
                  <View style={styles.scanLockOverlay}>
                    <ActivityIndicator size="large" color="#fff" />
                    <Text style={styles.scanLockText}>Verifying...</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Scan Log (Recent Scans) */}
          {scanLog.length > 0 && (
            <View style={{ marginTop: 20 }}>
              <Text style={styles.sectionTitle}>Recent Scans</Text>
              <View style={[styles.listGroup, styles.cardShadow]}>
                {scanLog.slice(0, 3).map((log, index) => (
                  <View key={log.id} style={[styles.listRow, index === 2 && styles.noBorder]}>
                    <View style={[styles.avatar, { backgroundColor: getAvatarColor(log.student) }]}>
                      <Text style={styles.avatarText}>{log.student?.charAt(0).toUpperCase() || "S"}</Text>
                    </View>
                    <View style={styles.listRowContent}>
                      <Text style={styles.listTitle} numberOfLines={1}>{log.student}</Text>
                      <Text style={styles.listSubtitle}>{log.code}</Text>
                    </View>
                    <CheckCircle2 color={BRAND.success} size={24} />
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {/* List Title for Students */}
      {(isAdmin || canScan) && students.length > 0 && (
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
          Enrolled Students ({students.length})
        </Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      
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

      {/* High Performance FlatList */}
      <Animated.FlatList
        data={(isAdmin || canScan) ? students : []}
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
  tabBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 24, backgroundColor: BRAND.border, borderWidth: 1, borderColor: BRAND.border },
  tabBtnActive: { backgroundColor: BRAND.primary, borderColor: BRAND.primaryDark },
  tabText: { fontSize: 15, fontWeight: "600", color: BRAND.textMuted },
  tabTextActive: { color: "#FFF" },

  emptyContainer: { alignItems: "center", marginTop: 40, padding: 20 },
  emptyText: { fontSize: 16, color: BRAND.textMuted, fontWeight: "500" },

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