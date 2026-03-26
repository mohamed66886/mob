import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Dimensions,
  StatusBar,
  Platform,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { usePreventScreenCapture } from "expo-screen-capture";
import QRCode from "react-native-qrcode-svg";
import { api } from "../lib/api";
import { User } from "../types/auth";
import {
  QrCode,
  ScanLine,
  CheckCircle2,
  X,
  Users,
  Camera,
} from "lucide-react-native";

// Telegram-like color palette
const BRAND = {
  primary: "#3390ec", // Telegram Blue
  primaryDark: "#2b7cb9",
  background: "#f1f2f6", // Telegram background
  surface: "#FFFFFF",
  text: "#000000",
  textMuted: "#707579",
  border: "#E1E9F2",
  danger: "#ff3b30",
  success: "#34c759", // iOS/Telegram green
};

const { width } = Dimensions.get("window");

// Helper to generate consistent colors for lists
const getAvatarColor = (name: string) => {
  const colors = ['#e17076', '#faa774', '#a695e7', '#7bc862', '#6ec9cb', '#65aadd', '#ee7aae'];
  const charCode = (name || "X").charCodeAt(0) || 0;
  return colors[charCode % colors.length];
};

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export default function UnifiedQrNativeScreen({
  token,
  user,
}: {
  token: string;
  user: User;
}) {
  usePreventScreenCapture();

  const role = user?.role;
  const isStudent = role === "student";
  const canScan = role === "doctor" || role === "assistant";
  const isAdmin = ["super_admin", "college_admin", "university_admin"].includes(role);

  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  
  // QR & Scanner States
  const [qrTs, setQrTs] = useState(Date.now());
  const [isScanning, setIsScanning] = useState(false);
  const [scanLock, setScanLock] = useState(false);
  const [scanLog, setScanLog] = useState<any[]>([]);
  
  const [permission, requestPermission] = useCameraPermissions();

  // 1. Timer for Dynamic QR
  useEffect(() => {
    const interval = setInterval(() => setQrTs(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  // 2. Fetch Subjects
  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const endpoint = isStudent ? "/subjects/my-subjects" : "/subjects";
        const res = await api.get(endpoint, authHeaders(token));
        setSubjects(res.data || []);
        if (res.data?.length > 0) {
          setSelectedSubjectId(res.data[0].id);
        }
      } catch (err) {
        Alert.alert("Error", "Failed to load subjects");
      }
    };
    fetchSubjects();
  }, [isStudent, token]);

  // 3. Fetch Students (For Admins/Doctors)
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

  // Handle Barcode Scanned
  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanLock || !selectedSubjectId) return;
    setScanLock(true); 

    try {
      const parsedData = JSON.parse(data);
      
      if (!parsedData.studentId || !parsedData.ts) {
        Alert.alert("Invalid QR", "This QR code is not recognized.");
        setTimeout(() => setScanLock(false), 2000);
        return;
      }

      if (Math.abs(Date.now() - parsedData.ts) > 35000) {
        Alert.alert("Expired", "This QR code has expired. Ask the student to refresh.");
        setTimeout(() => setScanLock(false), 2000);
        return;
      }

      const endpoint = role === "assistant" ? "/assistants/scan" : "/attendance/scan";
      const payload = {
        studentId: parsedData.studentId,
        subjectId: selectedSubjectId,
        ts: parsedData.ts,
      };

      const res = await api.post(endpoint, payload, authHeaders(token));

      setScanLog((prev) => [
        {
          id: `${Date.now()}-${parsedData.studentId}`,
          student: res.data.student,
          code: res.data.academic_code,
          status: res.data.status,
        },
        ...prev,
      ]);
      
      setTimeout(() => setScanLock(false), 1000);
    } catch (error) {
      Alert.alert("Error", "Failed to record attendance. Student might be already scanned.");
      setTimeout(() => setScanLock(false), 2000);
    }
  };

  const startScanner = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert("Permission required", "We need camera permission to scan QR codes");
        return;
      }
    }
    setIsScanning(true);
  };

  // --- Render Helpers ---

  const renderSubjectTabs = () => (
    <View style={styles.tabsWrapper}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
        {subjects.map((sub) => {
          const isSelected = sub.id === selectedSubjectId;
          return (
            <Pressable
              key={sub.id}
              style={[styles.tabBtn, isSelected && styles.tabBtnActive]}
              onPress={() => setSelectedSubjectId(sub.id)}
            >
              <Text style={[styles.tabText, isSelected && styles.tabTextActive]}>
                {sub.name}
              </Text>
              {isSelected && <View style={styles.tabIndicator} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderStudentQR = () => {
    if (!selectedSubjectId) return null;
    const qrPayload = JSON.stringify({
      studentId: user.id,
      subjectId: selectedSubjectId,
      ts: qrTs,
    });

    return (
      <View style={styles.qrHeroSection}>
        <View style={styles.qrWrapper}>
          <QRCode
            value={qrPayload}
            size={width * 0.65}
            color={BRAND.primaryDark}
            backgroundColor={BRAND.surface}
          />
        </View>
        <Text style={styles.qrTitle}>Attendance Pass</Text>
        <View style={styles.refreshIndicator}>
          <ActivityIndicator size="small" color={BRAND.primary} style={{ marginRight: 8 }} />
          <Text style={styles.qrSubtitle}>Auto-refreshes every 30s</Text>
        </View>
      </View>
    );
  };

  const renderScanner = () => {
    if (!selectedSubjectId) return null;

    return (
      <View style={styles.sectionContainer}>
        {!isScanning ? (
          <View style={styles.listGroup}>
            <Pressable style={styles.listRow} onPress={startScanner}>
              <View style={[styles.iconBox, { backgroundColor: BRAND.primary }]}>
                <Camera color="white" size={24} />
              </View>
              <View style={styles.listRowContent}>
                <Text style={styles.listTitle}>Open QR Scanner</Text>
                <Text style={styles.listSubtitle}>Scan student attendance passes</Text>
              </View>
            </Pressable>
          </View>
        ) : (
          <View style={styles.scannerWrapper}>
            <View style={styles.scannerHeader}>
              <Text style={styles.scannerTitle}>Align QR inside frame</Text>
              <Pressable onPress={() => setIsScanning(false)} style={styles.closeScannerBtn}>
                <X color={BRAND.textMuted} size={24} />
              </Pressable>
            </View>
            <View style={styles.cameraBox}>
              <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={scanLock ? undefined : handleBarcodeScanned}
              />
              {scanLock && (
                <View style={styles.scanLockOverlay}>
                  <ActivityIndicator size="large" color="white" />
                  <Text style={styles.scanLockText}>Processing...</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Scan Logs (Telegram Grouped List Style) */}
        {scanLog.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Recent Scans</Text>
            <View style={styles.listGroup}>
              {scanLog.slice(0, 5).map((log, index) => {
                const isLast = index === Math.min(scanLog.length, 5) - 1;
                return (
                  <View key={log.id} style={[styles.listRow, isLast && styles.noBorder]}>
                    <View style={[styles.avatar, { backgroundColor: getAvatarColor(log.student) }]}>
                      <Text style={styles.avatarText}>{log.student?.charAt(0).toUpperCase() || "S"}</Text>
                    </View>
                    <View style={styles.listRowContent}>
                      <Text style={styles.listTitle} numberOfLines={1}>{log.student}</Text>
                      <Text style={styles.listSubtitle}>{log.code}</Text>
                    </View>
                    <CheckCircle2 color={BRAND.success} size={24} />
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderStudentList = () => {
    if (!students || students.length === 0) return null;

    return (
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>Enrolled Students ({students.length})</Text>
        <View style={styles.listGroup}>
          {students.map((student, index) => {
            const isLast = index === students.length - 1;
            return (
              <View key={student.id || index} style={[styles.listRow, isLast && styles.noBorder]}>
                <View style={[styles.avatar, { backgroundColor: getAvatarColor(student.name) }]}>
                  <Text style={styles.avatarText}>{student.name?.charAt(0).toUpperCase() || "S"}</Text>
                </View>
                <View style={styles.listRowContent}>
                  <Text style={styles.listTitle} numberOfLines={1}>{student.name}</Text>
                  <Text style={styles.listSubtitle}>{student.academic_code} • {student.level_name}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <QrCode color={BRAND.primaryDark} size={28} />
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Attendance</Text>
            <Text style={styles.headerSubtitle}>Unified QR System</Text>
          </View>
        </View>
      </View>

      {/* Subject Tabs */}
      {renderSubjectTabs()}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isStudent && renderStudentQR()}
        {canScan && renderScanner()}
        {(isAdmin || canScan) && renderStudentList()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BRAND.background,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) : 0,
  },
  scrollContent: { padding: 16, paddingBottom: 40 },
  
  // Header
  header: { 
    flexDirection: "row", 
    alignItems: "center", 
    paddingHorizontal: 16, 
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: BRAND.surface, 
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  headerTitle: { fontSize: 20, fontWeight: "700", color: BRAND.text },
  headerSubtitle: { fontSize: 13, color: BRAND.textMuted },

  // Tabs
  tabsWrapper: {
    backgroundColor: BRAND.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
  },
  tabsScroll: { paddingHorizontal: 8 },
  tabBtn: { paddingVertical: 14, paddingHorizontal: 16, position: "relative" },
  tabBtnActive: {},
  tabText: { fontSize: 15, fontWeight: "600", color: BRAND.textMuted },
  tabTextActive: { color: BRAND.primary },
  tabIndicator: {
    position: "absolute",
    bottom: -1,
    left: 12,
    right: 12,
    height: 3,
    backgroundColor: BRAND.primary,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },

  // Student QR Hero Section
  qrHeroSection: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  qrWrapper: {
    padding: 20,
    backgroundColor: BRAND.surface,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    marginBottom: 24,
  },
  qrTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: BRAND.text,
    marginBottom: 8,
  },
  refreshIndicator: {
    flexDirection: "row",
    alignItems: "center",
  },
  qrSubtitle: {
    fontSize: 14,
    color: BRAND.textMuted,
    fontWeight: "500",
  },

  // Shared Grouped Lists (Telegram Style)
  sectionContainer: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: BRAND.textMuted,
    marginLeft: 16,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  listGroup: {
    backgroundColor: BRAND.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BRAND.border,
    overflow: "hidden",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: BRAND.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
  },
  noBorder: { borderBottomWidth: 0 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  listRowContent: { flex: 1, justifyContent: "center" },
  listTitle: { fontSize: 16, fontWeight: "600", color: BRAND.text, marginBottom: 2 },
  listSubtitle: { fontSize: 13, color: BRAND.textMuted },
  
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  avatarText: { color: "white", fontSize: 18, fontWeight: "600" },

  // Scanner UI
  scannerWrapper: {
    backgroundColor: BRAND.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BRAND.border,
    overflow: "hidden",
    marginBottom: 16,
  },
  scannerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
  },
  scannerTitle: { fontSize: 16, fontWeight: "600", color: BRAND.text },
  closeScannerBtn: { padding: 4, backgroundColor: BRAND.background, borderRadius: 16 },
  cameraBox: {
    width: "100%",
    height: width * 0.9,
    position: "relative",
  },
  scanLockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  scanLockText: { color: "white", fontSize: 16, fontWeight: "600", marginTop: 12 },
});