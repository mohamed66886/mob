import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeIn, useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { User } from "../types/auth";
import { api } from "../lib/api";
import {
  Eye,
  EyeOff,
  KeyRound,
  GraduationCap,
  BookOpen,
  Building2,
  University as UniversityIcon,
  LogOut,
  ChevronDown,
  ChevronUp,
  Fingerprint,
} from "lucide-react-native";

// Premium Telegram/iOS Palette
const BRAND = {
  primary: "#3390ec",
  primaryDark: "#2b7cb9",
  surface: "#FFFFFF",
  background: "#f1f2f6", // iOS system gray background
  text: "#1c1c1e",
  textMuted: "#8e8e93",
  border: "#E5E5EA",
  danger: "#FF3B30",
  success: "#34C759",
};

const roleLabels: Record<string, string> = {
  super_admin: "مدير النظام",
  university_admin: "مدير جامعة",
  college_admin: "مدير كلية",
  doctor: "دكتور جامعة",
  student: "طالب",
};

const getAvatarGradients = (name: string) => {
  const gradients = [
    ['#ff9a9e', '#fecfef'],
    ['#a18cd1', '#fbc2eb'],
    ['#84fab0', '#8fd3f4'],
    ['#fccb90', '#d57eeb'],
    ['#e0c3fc', '#8ec5fc'],
    ['#4facfe', '#00f2fe'],
    ['#43e97b', '#38f9d7']
  ] as const;
  const charCode = name.charCodeAt(0) || 0;
  return gradients[charCode % gradients.length];
};

interface InfoItemProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value?: string;
  hideBorder?: boolean;
}

// --- Animated Pressable for Buttons ---
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// --- Modern iOS Grouped Row ---
function InfoItem({ icon, iconBg, label, value, hideBorder }: InfoItemProps) {
  return (
    <View style={styles.settingsRowWrapper}>
      <View style={styles.settingsRow}>
        <View style={[styles.iconBox, { backgroundColor: iconBg }]}>{icon}</View>
        <View style={[styles.rowContent, hideBorder && styles.noBorder]}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue} numberOfLines={1}>{value || "—"}</Text>
        </View>
      </View>
    </View>
  );
}

export default function AccountNativeScreen({ user, onLogout }: { user: User; onLogout: () => Promise<void>; }) {
  const insets = useSafeAreaInsets();
  const initials = `${user.name?.charAt(0).toUpperCase() || ""}`;
  const avatarGradients = getAvatarGradients(user.name || "U");

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);

  const student = (user as any)?.student;
  const doctor = (user as any)?.doctor;

  const universityName = student?.university_name || doctor?.university_name;
  const collegeName = student?.college_name || doctor?.college_name;

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) return Alert.alert("تنبيه", "يرجى ملء جميع الحقول");
    if (newPassword.length < 6) return Alert.alert("تنبيه", "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل");

    setLoadingPassword(true);
    try {
      await api.put("/auth/change-password", { currentPassword, newPassword });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("نجاح", "تم تغيير كلمة المرور بنجاح");
      setShowPasswordForm(false);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("خطأ", err.response?.data?.error || "فشل تغيير كلمة المرور");
    } finally {
      setLoadingPassword(false);
    }
  };

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("تسجيل الخروج", "هل أنت متأكد أنك تريد تسجيل الخروج؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "تسجيل الخروج", style: "destructive", onPress: onLogout }
    ]);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }}
      >
        
        {/* Profile Hero Section */}
        <Animated.View entering={FadeInDown.springify()} style={styles.headerSection}>
          <LinearGradient colors={avatarGradients} style={styles.largeAvatar}>
            <Text style={styles.largeAvatarText}>{initials}</Text>
          </LinearGradient>
          <Text style={styles.profileName}>{user.name}</Text>
          {student?.academic_code && (
            <View style={styles.badgeContainer}>
              <Fingerprint size={14} color={BRAND.primary} style={{ marginRight: 4 }} />
              <Text style={styles.academicCode}>{student.academic_code}</Text>
            </View>
          )}
          <Text style={styles.roleText}>{roleLabels[user.role] || user.role}</Text>
        </Animated.View>

        <Animated.Text entering={FadeIn.delay(100)} style={styles.sectionHeader}>البيانات الشخصية</Animated.Text>
        
        {/* Personal Data Section */}
        <Animated.View entering={FadeInDown.delay(150).springify()} style={styles.section}>
          <InfoItem icon={<BookOpen size={18} color="#fff" />} iconBg="#65aadd" label="اسم المستخدم" value={user.username} hideBorder={!student} />
          {student && (
            <>
              <InfoItem icon={<BookOpen size={18} color="#fff" />} iconBg="#a695e7" label="الرقم القومي" value={student.national_id} />
              <InfoItem icon={<GraduationCap size={18} color="#fff" />} iconBg="#faa774" label="المستوى" value={student.level_name} />
              <InfoItem icon={<BookOpen size={18} color="#fff" />} iconBg="#7bc862" label="القسم" value={student.department_name} hideBorder />
            </>
          )}
        </Animated.View>

        {/* Institution Section */}
        {(universityName || collegeName) && (
          <>
            <Text style={styles.sectionHeader}>البيانات الأكاديمية</Text>
            <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.section}>
              {universityName && (
                <InfoItem icon={<UniversityIcon size={18} color="#fff" />} iconBg="#e17076" label="الجامعة" value={universityName} hideBorder={!collegeName} />
              )}
              {collegeName && (
                <InfoItem icon={<Building2 size={18} color="#fff" />} iconBg="#6ec9cb" label="الكلية" value={collegeName} hideBorder />
              )}
            </Animated.View>
          </>
        )}

        {/* Security Section */}
        <Text style={styles.sectionHeader}>الأمان والحساب</Text>
        <Animated.View entering={FadeInDown.delay(250).springify()} style={styles.section}>
          <Pressable
            style={({ pressed }) => [styles.settingsRowWrapper, pressed && { backgroundColor: BRAND.background }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowPasswordForm(!showPasswordForm);
              setCurrentPassword(""); setNewPassword("");
            }}
          >
            <View style={styles.settingsRow}>
              <View style={[styles.iconBox, { backgroundColor: "#a695e7" }]}>
                <KeyRound size={18} color="#fff" />
              </View>
              <View style={[styles.rowContent, showPasswordForm && styles.noBorder]}>
                <Text style={[styles.rowLabel, { flex: 1 }]}>تغيير كلمة المرور</Text>
                {showPasswordForm ? <ChevronUp size={20} color={BRAND.textMuted} /> : <ChevronDown size={20} color={BRAND.textMuted} />}
              </View>
            </View>
          </Pressable>

          {/* Animated Password Form */}
          {showPasswordForm && (
            <Animated.View entering={FadeInDown.duration(200)} style={styles.passwordForm}>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  secureTextEntry={!showCurrent}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="كلمة المرور الحالية"
                  placeholderTextColor={BRAND.textMuted}
                />
                <Pressable onPress={() => { Haptics.selectionAsync(); setShowCurrent(!showCurrent); }} style={styles.eyeButton}>
                  {showCurrent ? <Eye size={20} color={BRAND.primary} /> : <EyeOff size={20} color={BRAND.textMuted} />}
                </Pressable>
              </View>

              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  secureTextEntry={!showNew}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="كلمة المرور الجديدة"
                  placeholderTextColor={BRAND.textMuted}
                />
                <Pressable onPress={() => { Haptics.selectionAsync(); setShowNew(!showNew); }} style={styles.eyeButton}>
                  {showNew ? <Eye size={20} color={BRAND.primary} /> : <EyeOff size={20} color={BRAND.textMuted} />}
                </Pressable>
              </View>

              <Pressable
                onPress={handleChangePassword}
                disabled={loadingPassword}
                style={({ pressed }) => [styles.updateButton, (loadingPassword || pressed) && { opacity: 0.8 }]}
              >
                {loadingPassword ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.updateButtonText}>تحديث كلمة المرور</Text>}
              </Pressable>
            </Animated.View>
          )}
        </Animated.View>

        {/* Logout Section */}
        <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.section}>
          <Pressable 
            style={({ pressed }) => [styles.settingsRowWrapper, pressed && { backgroundColor: BRAND.danger + "10" }]} 
            onPress={handleLogout}
          >
            <View style={styles.settingsRow}>
              <View style={[styles.iconBox, { backgroundColor: BRAND.danger }]}>
                <LogOut size={18} color="#fff" />
              </View>
              <View style={[styles.rowContent, styles.noBorder]}>
                <Text style={styles.logoutText}>تسجيل الخروج</Text>
              </View>
            </View>
          </Pressable>
        </Animated.View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.background },
  scrollView: { flex: 1 },

  headerSection: { alignItems: "center", paddingBottom: 24 },
  largeAvatar: { 
    width: 96, height: 96, borderRadius: 48, justifyContent: "center", alignItems: "center", marginBottom: 16,
    shadowColor: BRAND.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6
  },
  largeAvatarText: { fontSize: 38, fontWeight: "700", color: "#fff" },
  profileName: { fontSize: 24, fontWeight: "800", color: BRAND.text, marginBottom: 6, letterSpacing: -0.5 },
  
  badgeContainer: { flexDirection: "row", alignItems: "center", backgroundColor: BRAND.primary + "15", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginBottom: 8 },
  academicCode: { fontSize: 14, color: BRAND.primary, fontWeight: "700", fontFamily: Platform.OS === 'ios' ? "Courier" : "monospace" },
  roleText: { fontSize: 15, color: BRAND.textMuted, fontWeight: "500" },

  sectionHeader: { fontSize: 13, fontWeight: "700", color: BRAND.textMuted, textTransform: "uppercase", paddingHorizontal: 32, paddingBottom: 8, paddingTop: 16 },
  
  section: {
    backgroundColor: BRAND.surface,
    borderRadius: 16,
    marginHorizontal: 16,
    overflow: "hidden",
    marginBottom: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1
  },

  settingsRowWrapper: { backgroundColor: BRAND.surface },
  settingsRow: { flexDirection: "row", alignItems: "center", paddingLeft: 16 },
  iconBox: { width: 30, height: 30, borderRadius: 8, justifyContent: "center", alignItems: "center", marginRight: 16 },
  rowContent: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingRight: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.border },
  noBorder: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 16, color: BRAND.text, fontWeight: "500" },
  rowValue: { fontSize: 15, color: BRAND.textMuted, maxWidth: "50%", textAlign: "right" },

  passwordForm: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4, backgroundColor: BRAND.surface },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: BRAND.background, borderRadius: 12, marginBottom: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: BRAND.border },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: BRAND.text, textAlign: "right" },
  eyeButton: { padding: 8, marginLeft: 4 },
  
  updateButton: { backgroundColor: BRAND.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  updateButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  logoutText: { fontSize: 16, color: BRAND.danger, fontWeight: "600" },
});