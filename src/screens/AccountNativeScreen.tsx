import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { User } from "../types/auth";
import { api } from "../lib/api";
import {
  Eye,
  EyeOff,
  ShieldCheck,
  KeyRound,
  GraduationCap,
  BookOpen,
  Building2,
  University as UniversityIcon,
  LogOut,
  ChevronDown,
  ChevronUp,
} from "lucide-react-native";

// Telegram-like color palette
const BRAND = {
  primary: "#3390ec",
  primaryDark: "#2b7cb9",
  surface: "#FFFFFF",
  background: "#f1f2f6", // Telegram settings background
  text: "#000000",
  textMuted: "#707579",
  border: "#E1E9F2",
  danger: "#e11d48",
};

const roleLabels: Record<string, string> = {
  super_admin: "مدير النظام",
  university_admin: "مدير جامعة",
  college_admin: "مدير كلية",
  doctor: "دكتور جامعة",
  student: "طالب",
};

// Helper to generate consistent Telegram-like avatar colors based on name
const getAvatarColor = (name: string) => {
  const colors = ['#e17076', '#faa774', '#a695e7', '#7bc862', '#6ec9cb', '#65aadd', '#ee7aae'];
  const charCode = name.charCodeAt(0) || 0;
  return colors[charCode % colors.length];
};

interface InfoItemProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value?: string;
  hideBorder?: boolean;
}

// Telegram Style Settings Row
function InfoItem({ icon, iconBg, label, value, hideBorder }: InfoItemProps) {
  return (
    <View style={styles.settingsRowWrapper}>
      <View style={styles.settingsRow}>
        <View style={[styles.iconBox, { backgroundColor: iconBg }]}>{icon}</View>
        <View style={[styles.rowContent, hideBorder && styles.noBorder]}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue} numberOfLines={1}>
            {value || "—"}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function AccountNativeScreen({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => Promise<void>;
}) {
  const initials = `${user.name?.charAt(0).toUpperCase() || ""}`;
  const avatarColor = getAvatarColor(user.name || "U");

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
    if (!currentPassword || !newPassword) {
      Alert.alert("خطأ", "يرجى ملء جميع الحقول");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("خطأ", "كلمة المرور الجديدة يجب أن تكون على الأقل 6 أحرف");
      return;
    }

    setLoadingPassword(true);
    try {
      await api.put("/auth/change-password", {
        currentPassword,
        newPassword,
      });
      Alert.alert("نجاح", "تم تغيير كلمة المرور بنجاح");
      setShowPasswordForm(false);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      Alert.alert("خطأ", err.response?.data?.error || "فشل تغيير كلمة المرور");
    } finally {
      setLoadingPassword(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        
        {/* Profile Header (Centered like Telegram) */}
        <View style={styles.headerSection}>
          <View style={[styles.largeAvatar, { backgroundColor: avatarColor }]}>
            <Text style={styles.largeAvatarText}>{initials}</Text>
          </View>
          <Text style={styles.profileName}>{user.name}</Text>
          {student?.academic_code && (
            <Text style={styles.academicCode}>{student.academic_code}</Text>
          )}
          <Text style={styles.roleText}>{roleLabels[user.role] || user.role}</Text>
        </View>

        {/* Personal Data Section */}
        <View style={styles.section}>
          <InfoItem
            icon={<BookOpen size={20} color="#fff" />}
            iconBg="#65aadd"
            label="اسم المستخدم"
            value={user.username}
          />
          {student && (
            <>
              <InfoItem
                icon={<BookOpen size={20} color="#fff" />}
                iconBg="#a695e7"
                label="الرقم القومي"
                value={student.national_id}
              />
              <InfoItem
                icon={<GraduationCap size={20} color="#fff" />}
                iconBg="#faa774"
                label="المستوى"
                value={student.level_name}
              />
              <InfoItem
                icon={<BookOpen size={20} color="#fff" />}
                iconBg="#7bc862"
                label="القسم"
                value={student.department_name}
                hideBorder={!universityName && !collegeName}
              />
            </>
          )}
        </View>

        {/* Institution Section */}
        {(universityName || collegeName) && (
          <View style={styles.section}>
            {universityName && (
              <InfoItem
                icon={<UniversityIcon size={20} color="#fff" />}
                iconBg="#e17076"
                label="الجامعة"
                value={universityName}
                hideBorder={!collegeName}
              />
            )}
            {collegeName && (
              <InfoItem
                icon={<Building2 size={20} color="#fff" />}
                iconBg="#6ec9cb"
                label="الكلية"
                value={collegeName}
                hideBorder={true}
              />
            )}
          </View>
        )}

        {/* Security Section */}
        <View style={styles.section}>
          <Pressable
            style={styles.settingsRowWrapper}
            onPress={() => {
              setShowPasswordForm(!showPasswordForm);
              setCurrentPassword("");
              setNewPassword("");
            }}
          >
            <View style={styles.settingsRow}>
              <View style={[styles.iconBox, { backgroundColor: "#a695e7" }]}>
                <KeyRound size={20} color="#fff" />
              </View>
              <View style={[styles.rowContent, showPasswordForm && styles.noBorder]}>
                <Text style={[styles.rowLabel, { flex: 1 }]}>تغيير كلمة المرور</Text>
                {showPasswordForm ? (
                  <ChevronUp size={20} color={BRAND.textMuted} />
                ) : (
                  <ChevronDown size={20} color={BRAND.textMuted} />
                )}
              </View>
            </View>
          </Pressable>

          {/* Collapsible Password Form */}
          {showPasswordForm && (
            <View style={styles.passwordForm}>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  secureTextEntry={!showCurrent}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="كلمة المرور الحالية"
                  placeholderTextColor={BRAND.textMuted}
                />
                <Pressable onPress={() => setShowCurrent(!showCurrent)} style={styles.eyeButton}>
                  {showCurrent ? <Eye size={20} color={BRAND.textMuted} /> : <EyeOff size={20} color={BRAND.textMuted} />}
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
                <Pressable onPress={() => setShowNew(!showNew)} style={styles.eyeButton}>
                  {showNew ? <Eye size={20} color={BRAND.textMuted} /> : <EyeOff size={20} color={BRAND.textMuted} />}
                </Pressable>
              </View>

              <Pressable
                onPress={handleChangePassword}
                disabled={loadingPassword}
                style={[styles.updateButton, loadingPassword && styles.updateButtonDisabled]}
              >
                {loadingPassword ? (
                  <ActivityIndicator color={BRAND.surface} size="small" />
                ) : (
                  <Text style={styles.updateButtonText}>تحديث كلمة المرور</Text>
                )}
              </Pressable>
            </View>
          )}
        </View>

        {/* Logout Section */}
        <View style={styles.section}>
          <Pressable style={styles.settingsRowWrapper} onPress={onLogout}>
            <View style={styles.settingsRow}>
              <View style={[styles.iconBox, { backgroundColor: BRAND.danger }]}>
                <LogOut size={20} color="#fff" />
              </View>
              <View style={[styles.rowContent, styles.noBorder]}>
                <Text style={styles.logoutText}>تسجيل الخروج</Text>
              </View>
            </View>
          </Pressable>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.background },
  scrollView: { flex: 1 },

  // Header
  headerSection: {
    alignItems: "center",
    paddingVertical: 32,
    backgroundColor: BRAND.background,
  },
  largeAvatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  largeAvatarText: { fontSize: 36, fontWeight: "600", color: "#fff" },
  profileName: { fontSize: 22, fontWeight: "700", color: BRAND.text, marginBottom: 4 },
  academicCode: { fontSize: 14, color: BRAND.primary, fontWeight: "600", marginBottom: 4, fontFamily: "Courier New" },
  roleText: { fontSize: 15, color: BRAND.textMuted },

  // Sections
  section: {
    backgroundColor: BRAND.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: BRAND.border,
    marginBottom: 24,
  },

  // Settings Row
  settingsRowWrapper: {
    backgroundColor: BRAND.surface,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  rowContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingRight: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
  },
  noBorder: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    fontSize: 16,
    color: BRAND.text,
    fontWeight: "500",
  },
  rowValue: {
    fontSize: 16,
    color: BRAND.textMuted,
    maxWidth: "50%",
    textAlign: "right",
  },

  // Password Form inside section
  passwordForm: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BRAND.background,
    borderRadius: 10,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: BRAND.text,
  },
  eyeButton: {
    padding: 8,
  },
  updateButton: {
    backgroundColor: BRAND.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  updateButtonDisabled: {
    opacity: 0.7,
  },
  updateButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  // Logout
  logoutText: {
    fontSize: 16,
    color: BRAND.danger,
    fontWeight: "600",
  },
});