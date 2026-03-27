import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";

const BRAND = {
  primary: "#03468F",
  primaryDark: "#023266",
  primaryDimmed: "#E7EEF7",
  secondary: "#FFE288",
  background: "#F4F7FA", // لون أهدى للعين من الرمادي القديم
  surface: "#FFFFFF",
  text: "#0F172A",
  textMuted: "#64748B",
  border: "#E2E8F0",
  success: "#10B981",
  danger: "#EF4444",
};

const ALERT_DURATION = 4000;

function parseQrLoginPayload(raw: string) {
  try {
    const parsed = JSON.parse(String(raw || ""));
    const username = String(parsed?.username || "").trim();
    const password = String(parsed?.password || "").trim();

    if (!username || !password) return null;
    return { username, password };
  } catch {
    return null;
  }
}

function QrLoginScannerModal({
  visible,
  onClose,
  onScanned,
}: {
  visible: boolean;
  onClose: () => void;
  onScanned: (username: string, password: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!visible) {
      setError(null);
      setIsProcessing(false);
    }
  }, [visible]);

  const handleScan = useCallback(
    ({ data }: { data: string }) => {
      if (isProcessing) return;

      setIsProcessing(true);
      const payload = parseQrLoginPayload(data);

      if (!payload) {
        setError("Invalid QR code. Please scan valid login credentials.");
        setTimeout(() => setIsProcessing(false), 1500);
        return;
      }

      onScanned(payload.username, payload.password);
      onClose();
      setTimeout(() => setIsProcessing(false), 250);
    },
    [isProcessing, onClose, onScanned]
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>Scan QR Code</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
              <Ionicons name="close" size={20} color={BRAND.text} />
            </TouchableOpacity>
          </View>

          {!permission ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color={BRAND.primary} />
            </View>
          ) : null}

          {permission && !permission.granted ? (
            <View style={styles.centerContent}>
              <Feather name="camera-off" size={48} color={BRAND.textMuted} />
              <Text style={styles.pageSubtitle}>Camera access is needed to scan QR.</Text>
              <TouchableOpacity onPress={requestPermission} style={styles.refreshBtn}>
                <Text style={styles.refreshBtnText}>Allow Camera Access</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {permission?.granted ? (
            <View style={styles.scannerCard}>
              <CameraView
                style={styles.cameraView}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={handleScan}
              />
              <View style={styles.scannerOverlay}>
                <View style={styles.scannerTarget} />
              </View>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="warning" size={16} color={BRAND.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

export default function LoginNativeScreen({
  onLogin,
  loading,
}: {
  onLogin: (username: string, password: string) => Promise<void>;
  loading: boolean;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [alert, setAlert] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(null);
  const [progress, setProgress] = useState(100);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!alert) {
      setProgress(100);
      return;
    }

    setProgress(100);
    const step = 100 / Math.max(1, Math.floor(ALERT_DURATION / 80));

    intervalRef.current = setInterval(() => {
      setProgress((prev) => Math.max(0, prev - step));
    }, 80);

    timeoutRef.current = setTimeout(() => {
      setAlert(null);
      setProgress(100);
    }, ALERT_DURATION);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [alert]);

  const handleSubmit = useCallback(async () => {
    setAlert(null);

    if (!username.trim() || !password.trim()) {
      setAlert({
        type: "error",
        message: "Please enter both username and password.",
      });
      return;
    }

    try {
      await onLogin(username.trim(), password.trim());
      setAlert({ type: "success", message: "Login successful!" });
    } catch (error: any) {
      setAlert({
        type: "error",
        message: error?.message || "Login failed. Please try again.",
      });
    }
  }, [onLogin, password, username]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      
      <QrLoginScannerModal
        visible={showQrScanner}
        onClose={() => setShowQrScanner(false)}
        onScanned={(nextUsername, nextPassword) => {
          setUsername(nextUsername);
          setPassword(nextPassword);
          setAlert({ type: "success", message: "QR credentials captured successfully." });
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Banner */}
          <View style={styles.headerBanner}>
            <View style={styles.blobRight} />
            <View style={styles.blobLeft} />
            <Image
              source={require("../../assets/icon.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          {/* Main Login Card */}
          <View style={styles.loginCard}>
            
            <View style={styles.cardHeader}>
              <Text style={styles.welcomeTitle}>Welcome Back!</Text>
              <Text style={styles.welcomeSubtitle}>Sign in to your account</Text>
            </View>

            {!!alert && (
              <View
                style={[
                  styles.alertBox,
                  alert.type === "error" ? styles.alertError : styles.alertSuccess,
                ]}
              >
                <View style={styles.alertRow}>
                  <Ionicons
                    name={alert.type === "error" ? "alert-circle" : "checkmark-circle"}
                    size={20}
                    color="#fff"
                  />
                  <Text style={styles.alertText}>{alert.message}</Text>
                  <Pressable
                    onPress={() => {
                      if (timeoutRef.current) clearTimeout(timeoutRef.current);
                      if (intervalRef.current) clearInterval(intervalRef.current);
                      setAlert(null);
                      setProgress(100);
                    }}
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
                  </Pressable>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
              </View>
            )}

            {/* Inputs */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Username</Text>
              <View style={styles.inputContainer}>
                <Feather name="user" size={18} color={BRAND.textMuted} style={styles.inputIcon} />
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  placeholder="Enter your username"
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                  editable={!loading}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.inputContainer}>
                <Feather name="lock" size={18} color={BRAND.textMuted} style={styles.inputIcon} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={!showPassword}
                  style={styles.input}
                  editable={!loading}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((prev) => !prev)}
                  style={styles.passwordToggle}
                >
                  <Feather
                    name={showPassword ? "eye-off" : "eye"}
                    size={18}
                    color={BRAND.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Primary Action */}
            <TouchableOpacity
              onPress={handleSubmit}
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Login</Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Secondary Action */}
            <TouchableOpacity
              onPress={() => setShowQrScanner(true)}
              style={styles.secondaryButton}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="qrcode-scan" size={20} color={BRAND.primary} />
              <Text style={styles.secondaryButtonText}>Login with QR Code</Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Designed & Developed by</Text>
            <Text style={styles.companyText}>
              Fulk Company <Text style={styles.footerMuted}>•</Text> Mohamad Rashad & Abdel-Hameed
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BRAND.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  headerBanner: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.primary,
    paddingTop: 40,
    paddingBottom: 60,
    position: "relative",
    overflow: "hidden",
  },
  blobRight: {
    position: "absolute",
    right: -40,
    top: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  blobLeft: {
    position: "absolute",
    left: -30,
    bottom: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 10,
  },
  loginCard: {
    backgroundColor: BRAND.surface,
    borderRadius: 24,
    marginHorizontal: 16,
    marginTop: -30,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 4,
  },
  cardHeader: {
    marginBottom: 24,
    alignItems: "center",
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: BRAND.text,
    marginBottom: 6,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: BRAND.textMuted,
  },
  alertBox: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 20,
  },
  alertError: {
    backgroundColor: BRAND.danger,
  },
  alertSuccess: {
    backgroundColor: BRAND.success,
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
  },
  alertText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  progressTrack: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#fff",
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: BRAND.text,
    marginBottom: 8,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: BRAND.text,
    height: "100%",
  },
  passwordToggle: {
    padding: 8,
  },
  primaryButton: {
    backgroundColor: BRAND.primary,
    borderRadius: 14,
    height: 54,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    shadowColor: BRAND.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: BRAND.border,
  },
  dividerText: {
    marginHorizontal: 12,
    color: BRAND.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  secondaryButton: {
    flexDirection: "row",
    backgroundColor: BRAND.primaryDimmed,
    borderRadius: 14,
    height: 54,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  secondaryButtonText: {
    color: BRAND.primary,
    fontSize: 15,
    fontWeight: "700",
  },
  footer: {
    marginTop: "auto",
    paddingTop: 30,
    alignItems: "center",
  },
  footerText: {
    fontSize: 12,
    color: BRAND.textMuted,
    marginBottom: 4,
  },
  companyText: {
    fontSize: 13,
    fontWeight: "700",
    color: BRAND.text,
  },
  footerMuted: {
    color: BRAND.textMuted,
    fontWeight: "400",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.7)", // لون أغمق شوية للفوكس
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: BRAND.surface,
    borderRadius: 24,
    width: "100%",
    maxWidth: 380,
    overflow: "hidden",
    paddingBottom: 20,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: BRAND.text,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BRAND.background,
    alignItems: "center",
    justifyContent: "center",
  },
  centerContent: {
    padding: 40,
    alignItems: "center",
  },
  scannerCard: {
    height: 300,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000",
    position: "relative",
  },
  cameraView: {
    flex: 1,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  scannerTarget: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: BRAND.success,
    borderRadius: 12,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  pageSubtitle: {
    fontSize: 14,
    color: BRAND.textMuted,
    marginTop: 12,
    textAlign: "center",
  },
  refreshBtn: {
    backgroundColor: BRAND.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 20,
  },
  refreshBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    marginHorizontal: 20,
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    color: BRAND.danger,
    fontSize: 13,
    fontWeight: "500",
  },
});