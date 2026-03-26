import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  Platform,
  useWindowDimensions,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { api } from "../lib/api";
import { User, UserRole } from "../types/auth";
import {
  BookMarked,
  TrendingUp,
  CheckCircle,
  QrCode,
  ClipboardList,
  User as UserIcon,
  BookOpen,
  Users,
  ChevronRight,
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
  success: "#34c759", // iOS/Telegram green
  warning: "#f59e0b",
  danger: "#ff3b30",
};

const roleLabels: Record<UserRole, string> = {
  super_admin: "Super Admin",
  university_admin: "University Admin",
  college_admin: "College Admin",
  doctor: "Doctor",
  student: "Student",
  employee: "Employee",
  assistant: "Assistant",
};

// Helper to generate consistent colors for lists
const getAvatarColor = (name: string) => {
  const colors = ['#e17076', '#faa774', '#a695e7', '#7bc862', '#6ec9cb', '#65aadd', '#ee7aae'];
  const charCode = (name || "X").charCodeAt(0) || 0;
  return colors[charCode % colors.length];
};

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// ==========================================
// 1. Student Dashboard Component
// ==========================================
function StudentDashboard({
  token,
  onOpenScreen,
}: {
  token: string;
  onOpenScreen: (screen: string, params?: Record<string, any>) => void;
}) {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAttendance = async () => {
      try {
        const res = await api.get("/attendance/my-attendance", authHeaders(token));
        setSubjects(res.data || []);
      } catch (err) {
        console.error("Failed to load attendance", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAttendance();
  }, [token]);

  if (loading) return <ActivityIndicator color={BRAND.primary} style={{ marginTop: 20 }} />;

  const totalSubjects = subjects.length;
  const avgAttendance = totalSubjects > 0
    ? Math.round(subjects.reduce((a, s) => a + s.attendance_percentage, 0) / totalSubjects)
    : 0;
  const goodStanding = subjects.filter((s) => s.attendance_percentage >= 75).length;

  return (
    <View style={styles.sectionContainer}>
      
      {/* Telegram-style Quick Actions */}
      <View style={styles.actionRow}>
        <Pressable style={styles.actionItem} onPress={() => onOpenScreen("QR")}>
          <View style={styles.actionIconBtn}>
            <QrCode color={BRAND.primary} size={24} />
          </View>
          <Text style={styles.actionLabel}>QR</Text>
        </Pressable>
        <Pressable style={styles.actionItem} onPress={() => onOpenScreen("Materials")}>
          <View style={styles.actionIconBtn}>
            <BookOpen color={BRAND.primary} size={24} />
          </View>
          <Text style={styles.actionLabel}>Materials</Text>
        </Pressable>
        <Pressable style={styles.actionItem} onPress={() => onOpenScreen("Tasks")}>
          <View style={styles.actionIconBtn}>
            <ClipboardList color={BRAND.primary} size={24} />
          </View>
          <Text style={styles.actionLabel}>Tasks</Text>
        </Pressable>
        <Pressable style={styles.actionItem} onPress={() => onOpenScreen("Workspaces")}>
          <View style={styles.actionIconBtn}>
            <Users color={BRAND.primary} size={24} />
          </View>
          <Text style={styles.actionLabel}>Chats</Text>
        </Pressable>
        <Pressable style={styles.actionItem} onPress={() => onOpenScreen("Account")}>
          <View style={styles.actionIconBtn}>
            <UserIcon color={BRAND.primary} size={24} />
          </View>
          <Text style={styles.actionLabel}>Account</Text>
        </Pressable>
      </View>

      {/* Stats Group */}
      <View style={styles.listGroup}>
        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <BookMarked color={BRAND.primary} size={20} />
            <Text style={styles.statValue}>{totalSubjects}</Text>
            <Text style={styles.statLabel}>Enrolled</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <TrendingUp color={BRAND.primary} size={20} />
            <Text style={styles.statValue}>{avgAttendance}%</Text>
            <Text style={styles.statLabel}>Avg Attend</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <CheckCircle color={BRAND.success} size={20} />
            <Text style={styles.statValue}>{goodStanding}</Text>
            <Text style={styles.statLabel}>Good Standing</Text>
          </View>
        </View>
      </View>

      {/* Subject Attendance List */}
      <Text style={styles.sectionTitle}>Subject Attendance</Text>
      
      {subjects.length === 0 ? (
        <Text style={styles.emptyText}>No enrolled subjects.</Text>
      ) : (
        <View style={styles.listGroup}>
          {subjects.map((s, index) => {
            const pct = s.attendance_percentage;
            const barColor = pct >= 75 ? BRAND.success : pct >= 50 ? BRAND.warning : BRAND.danger;
            const isLast = index === subjects.length - 1;

            return (
              <View key={s.id} style={[styles.listRow, isLast && styles.noBorder]}>
                <View style={[styles.avatar, { backgroundColor: getAvatarColor(s.name) }]}>
                  <Text style={styles.avatarText}>{s.name.charAt(0).toUpperCase()}</Text>
                </View>
                
                <View style={styles.listRowContent}>
                  <View style={styles.subjectHeader}>
                    <Text style={styles.listTitle} numberOfLines={1}>{s.name}</Text>
                    <Text style={[styles.pctText, { color: barColor }]}>{pct}%</Text>
                  </View>
                  
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${pct}%`, backgroundColor: barColor }]} />
                  </View>
                  
                  <Text style={styles.listSubtitle}>
                    Dr. {s.doctor_name} • {s.attended_lectures}/{s.total_lectures} Lectures
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ==========================================
// 2. Doctor Dashboard Component
// ==========================================
function DoctorDashboard({
  token,
  onOpenScreen,
}: {
  token: string;
  onOpenScreen: (screen: string, params?: Record<string, any>) => void;
}) {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const res = await api.get("/subjects", authHeaders(token));
        setSubjects(res.data || []);
      } catch (err) {
        console.error("Failed to load subjects", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSubjects();
  }, [token]);

  if (loading) return <ActivityIndicator color={BRAND.primary} style={{ marginTop: 20 }} />;

  const uniqueLevels = new Set(subjects.map((s) => s.level_name)).size;

  return (
    <View style={styles.sectionContainer}>
      
      {/* Telegram-style Quick Actions */}
      <View style={styles.actionRow}>
        <Pressable style={styles.actionItem} onPress={() => onOpenScreen("QR")}>
          <View style={styles.actionIconBtn}>
            <QrCode color={BRAND.primary} size={24} />
          </View>
          <Text style={styles.actionLabel}>QR</Text>
        </Pressable>
        <Pressable style={styles.actionItem} onPress={() => onOpenScreen("Materials")}>
          <View style={styles.actionIconBtn}>
            <BookOpen color={BRAND.primary} size={24} />
          </View>
          <Text style={styles.actionLabel}>Materials</Text>
        </Pressable>
        <Pressable style={styles.actionItem} onPress={() => onOpenScreen("Tasks")}>
          <View style={styles.actionIconBtn}>
            <ClipboardList color={BRAND.primary} size={24} />
          </View>
          <Text style={styles.actionLabel}>Tasks</Text>
        </Pressable>
        <Pressable style={styles.actionItem} onPress={() => onOpenScreen("Workspaces")}>
          <View style={styles.actionIconBtn}>
            <Users color={BRAND.primary} size={24} />
          </View>
          <Text style={styles.actionLabel}>Chats</Text>
        </Pressable>
        <Pressable style={styles.actionItem} onPress={() => onOpenScreen("Account")}>
          <View style={styles.actionIconBtn}>
            <UserIcon color={BRAND.primary} size={24} />
          </View>
          <Text style={styles.actionLabel}>Account</Text>
        </Pressable>
      </View>

      {/* Stats Group */}
      <View style={styles.listGroup}>
        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <BookMarked color={BRAND.primary} size={20} />
            <Text style={styles.statValue}>{subjects.length}</Text>
            <Text style={styles.statLabel}>Subjects</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <BookOpen color={BRAND.primary} size={20} />
            <Text style={styles.statValue}>{uniqueLevels || "0"}</Text>
            <Text style={styles.statLabel}>Levels</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <ClipboardList color={BRAND.primary} size={20} />
            <Text style={styles.statValue}>—</Text>
            <Text style={styles.statLabel}>Attendance</Text>
          </View>
        </View>
      </View>

      {/* Subjects List */}
      <Text style={styles.sectionTitle}>Your Subjects</Text>
      
      {subjects.length === 0 ? (
        <Text style={styles.emptyText}>No subjects assigned yet.</Text>
      ) : (
        <View style={styles.listGroup}>
          {subjects.map((s, index) => {
            const isLast = index === subjects.length - 1;
            return (
              <Pressable key={s.id} style={({ pressed }) => [styles.listRow, isLast && styles.noBorder, pressed && { backgroundColor: BRAND.border + "50" }]}>
                <View style={[styles.avatar, { backgroundColor: getAvatarColor(s.name) }]}>
                  <Text style={styles.avatarText}>{s.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.listRowContent}>
                  <Text style={styles.listTitle} numberOfLines={1}>{s.name}</Text>
                  <Text style={styles.listSubtitle}>{s.level_name}</Text>
                </View>
                <ChevronRight color={BRAND.textMuted} size={20} style={{ marginLeft: 10 }} />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ==========================================
// 3. Admin Dashboard Component
// ==========================================
function AdminDashboard({
  stats,
}: {
  stats: Record<string, any>;
}) {
  const entries = Object.entries(stats).filter(([, v]) => typeof v === 'number');

  return (
    <View style={styles.sectionContainer}>
      <Text style={styles.sectionTitle}>System Overview</Text>
      <View style={styles.listGroup}>
        {entries.map(([key, value], index) => {
          const isLast = index === entries.length - 1;
          return (
            <View key={key} style={[styles.listRow, isLast && styles.noBorder, { paddingVertical: 16 }]}>
              <View style={styles.listRowContent}>
                <Text style={styles.listTitle}>{key.replace(/_/g, " ").toUpperCase()}</Text>
              </View>
              <Text style={[styles.listTitle, { color: BRAND.primary }]}>{value as number}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ==========================================
// Main Dashboard Screen
// ==========================================
export default function DashboardNativeScreen({
  token,
  user,
}: {
  token: string;
  user: User;
}) {
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState<Record<string, any>>({});
  const [profileData, setProfileData] = useState<any>({});
  
  const isStudent = user.role === "student";
  const isDoctor = user.role === "doctor";
  const isAdmin = !isStudent && !isDoctor && user.role !== "employee" && user.role !== "assistant";

  useEffect(() => {
    api.get("/auth/me", authHeaders(token))
       .then(res => setProfileData(res.data))
       .catch(() => {});

    if (isAdmin) {
      api.get("/stats", authHeaders(token))
         .then(res => setStats(res.data || {}))
         .catch(() => {});
    }
  }, [token, isAdmin]);

  const displayName = useMemo(() => {
    const parts = (user.name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "User";
    return parts.slice(0, 2).join(" ");
  }, [user.name]);

  const instName = profileData.college_name || profileData.university_name || "";

  const openScreen = (screen: string, params?: Record<string, any>) => {
    navigation.navigate(screen as never, params as never);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Telegram-style Flat Hero Header */}
        <View style={styles.heroCard}>
          <View style={styles.heroHeaderRow}>
            <View style={styles.heroNameBlock}>
              <Text style={styles.heroTitle} numberOfLines={1}>{displayName}</Text>
              <Text style={styles.heroSubtitle}>
                {roleLabels[user.role]} {instName ? `• ${instName}` : ""}
              </Text>
            </View>
            <View style={[styles.heroAvatar, { backgroundColor: getAvatarColor(user.name || "") }]}>
               <Text style={styles.heroAvatarText}>{displayName.charAt(0).toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* Dynamic Content Based on Role */}
        {isStudent && <StudentDashboard token={token} onOpenScreen={openScreen} />}
        {isDoctor && <DoctorDashboard token={token} onOpenScreen={openScreen} />}
        {isAdmin && <AdminDashboard stats={stats} />}

      </ScrollView>
    </SafeAreaView>
  );
}

// ==========================================
// Styles
// ==========================================
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BRAND.background,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) : 0,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  
  // Hero Header (Flat & Clean)
  heroCard: {
    backgroundColor: BRAND.surface,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
    marginBottom: 16,
  },
  heroHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroNameBlock: {
    flex: 1,
    marginRight: 16,
  },
  heroTitle: {
    color: BRAND.text,
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  heroSubtitle: {
    color: BRAND.textMuted,
    fontSize: 14,
    fontWeight: "500",
  },
  heroAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  heroAvatarText: {
    color: "white",
    fontSize: 22,
    fontWeight: "700",
  },

  // Telegram Style Quick Actions
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  actionItem: {
    alignItems: "center",
    width: "17%",
    gap: 8,
  },
  actionIconBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: BRAND.surface,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BRAND.border,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: BRAND.primaryDark,
  },

  // Shared Layouts
  sectionContainer: {
    gap: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: BRAND.textMuted,
    marginLeft: 8,
    marginTop: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emptyText: {
    color: BRAND.textMuted,
    textAlign: "center",
    marginTop: 20,
    fontSize: 14,
  },

  // Grouped Lists
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
    backgroundColor: BRAND.surface,
  },
  noBorder: {
    borderBottomWidth: 0,
  },
  listRowContent: {
    flex: 1,
    justifyContent: "center",
  },
  listTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: BRAND.text,
    marginBottom: 2,
  },
  listSubtitle: {
    fontSize: 13,
    color: BRAND.textMuted,
    marginTop: 4,
  },

  // Shared Avatar for Lists
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },

  // Unified Stats Row
  statRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: "60%",
    backgroundColor: BRAND.border,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: BRAND.text,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    color: BRAND.textMuted,
    fontWeight: "500",
    marginTop: 2,
  },

  // Specific to Subject Attendance (Student)
  subjectHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  pctText: {
    fontSize: 14,
    fontWeight: "700",
  },
  progressBarBg: {
    height: 4,
    backgroundColor: BRAND.background,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
});