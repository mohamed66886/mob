import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
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
  primary: "#007BFF",
  primaryDimmed: "#E0E7FF",
  background: "rgb(233, 236, 239)",
  surface: "#FFFFFF",
  text: "#333333",
  textMuted: "#666666",
  border: "#D1D5DB",
  success: "#28A745",
  danger: "#FF0000",
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
        setError("Invalid QR code. Please scan valid student ID.");
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>Scan Student ID</Text>
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

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!alert) return;
    timeoutRef.current = setTimeout(() => {
      setAlert(null);
    }, ALERT_DURATION);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [alert]);

  const handleSubmit = useCallback(async () => {
    setAlert(null);

    if (!username.trim() || !password.trim()) {
      setAlert({
        type: "error",
        message: "Please enter both student ID and password.",
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
      <StatusBar style="dark" />
      
      <QrLoginScannerModal
        visible={showQrScanner}
        onClose={() => setShowQrScanner(false)}
        onScanned={(nextUsername, nextPassword) => {
          setUsername(nextUsername);
          setPassword(nextPassword);
          setAlert({ type: "success", message: "Student ID scanned successfully." });
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
          {/* Main Logo / Title outside the card */}
          <Text style={styles.mainLogoText}>attendQr</Text>

          <View style={styles.loginContainer}>
            {/* Header Area */}
            <View style={styles.headerArea}>
              <Text style={styles.welcomeSubtitle}>Enter your credentials</Text>
              
              <TouchableOpacity 
                style={styles.helpLink} 
                activeOpacity={0.7}
                onPress={() => Linking.openURL('https://wa.me/201062097359?text=' + encodeURIComponent('احتاج مساعده بخصوص attendqr'))}
              >
                <Ionicons name="help-circle" size={18} color="#007BFF" />
                <Text style={styles.helpLinkText}>Need Help?</Text>
              </TouchableOpacity>
            </View>

            {/* Alert */}
            {!!alert && (
              <View
                style={[
                  styles.alertBox,
                  alert.type === "error" ? styles.alertError : styles.alertSuccess,
                ]}
              >
                <Ionicons
                  name={alert.type === "error" ? "alert-circle" : "checkmark-circle"}
                  size={18}
                  color={alert.type === "error" ? BRAND.danger : BRAND.success}
                />
                <Text style={[
                  styles.alertText,
                  { color: alert.type === "error" ? BRAND.danger : BRAND.success }
                ]}>
                  {alert.message}
                </Text>
              </View>
            )}

            {/* Form Area */}
            <View style={styles.formArea}>
              <View style={styles.inputContainer}>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  placeholder="Email or username"
                  placeholderTextColor="#9CA3AF"
                  style={styles.input}
                  editable={!loading}
                />
                <Ionicons name="mail" size={20} color="#888888" style={styles.inputIcon} />
              </View>

              <View style={styles.inputContainer}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPassword}
                  style={styles.input}
                  editable={!loading}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((prev) => !prev)}
                  style={styles.passwordToggle}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={showPassword ? "lock-open" : "lock-closed"}
                    size={20}
                    color="#888888"
                    style={styles.inputIcon}
                  />
                </TouchableOpacity>
              </View>


            </View>

            {/* Actions */}
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

            <TouchableOpacity
              onPress={() => setShowQrScanner(true)}
              style={styles.secondaryButton}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryButtonText}>Scan QR Code</Text>
            </TouchableOpacity>

            <View style={styles.supervisionContainer}>
              <View style={styles.creditRow}>
   
                <Text style={styles.supervisionText}>
<Text style={styles.supervisionLabel}>Developed By:</Text> Mohamed Rashad                </Text>
              </View>

            </View>

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
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  mainLogoText: {
    fontSize: 28,
    fontWeight: "800",
    color: "#2C3E50",
    textAlign: "center",
    marginBottom: 20,
    letterSpacing: 1,
  },
  loginContainer: {
    backgroundColor: BRAND.surface,
    paddingVertical: 32,
    paddingHorizontal: 24,
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  headerArea: {
    alignItems: "center",
    marginBottom: 24,
  },
  redNotice: {
    color: BRAND.danger,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 16,
    paddingHorizontal: 10,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: BRAND.textMuted,
    marginBottom: 16,
    fontWeight: "500",
  },
  helpLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  helpLinkText: {
    color: BRAND.primary,
    fontSize: 15,
    fontWeight: "500",
  },
  alertBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  alertError: {
    backgroundColor: "rgba(255, 0, 0, 0.1)",
  },
  alertSuccess: {
    backgroundColor: "rgba(40, 167, 69, 0.1)",
  },
  alertText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
  },
  formArea: {
    gap: 16,
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 4,
    paddingHorizontal: 14,
    height: 48,
  },
  inputIcon: {
    marginLeft: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: BRAND.text,
    height: "100%",
  },
  passwordToggle: {
    justifyContent: "center",
    alignItems: "center",
  },
  recaptchaContainer: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FAFAFA",
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 4,
    padding: 12,
    marginTop: 4,
  },
  recaptchaLeft: {
    alignItems: "center",
    justifyContent: "center",
  },
  recaptchaLabel: {
    fontSize: 9,
    color: "#555",
    marginTop: 4,
  },
  recaptchaRight: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  recaptchaText: {
    fontSize: 14,
    color: BRAND.text,
    fontWeight: "500",
  },
  recaptchaCheckbox: {
    width: 26,
    height: 26,
    borderWidth: 2,
    borderColor: "#C1C1C1",
    backgroundColor: "#FFF",
    borderRadius: 2,
  },
  primaryButton: {
    backgroundColor: BRAND.primary,
    borderRadius: 4,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  secondaryButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BRAND.success,
    borderRadius: 4,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryButtonText: {
    color: BRAND.success,
    fontSize: 16,
    fontWeight: "600",
  },
  supervisionContainer: {
    marginTop: 24,
    alignItems: "center",
  },
  creditRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  creditIcon: {
    marginRight: 6,
  },
  supervisionText: {
    fontSize: 13,
    color: BRAND.textMuted,
    textAlign: "center",
    fontWeight: "400",
  },
  supervisionLabel: {
    color: BRAND.text,
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: BRAND.surface,
    borderRadius: 20,
    width: "100%",
    maxWidth: 360,
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
    fontWeight: "600",
    color: BRAND.text,
  },
  modalCloseButton: {
    padding: 4,
  },
  centerContent: {
    padding: 40,
    alignItems: "center",
  },
  scannerCard: {
    height: 280,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000",
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
    width: 180,
    height: 180,
    borderWidth: 2,
    borderColor: BRAND.success,
    borderRadius: 12,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
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
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  refreshBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
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