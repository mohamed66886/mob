import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  Platform,
  Dimensions,
  View,
  Image,
  RefreshControl,
  ScrollView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { LineChart } from "react-native-chart-kit";
import BottomSheet from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  FadeInDown,
  FadeIn,
} from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";

import { api, getMe, resolveMediaUrl } from "../lib/api";
import { User, UserRole } from "../types/auth";
import LottieView from "../components/AppLottieView.native";
import {
  BookMarked,
  TrendingUp,
  CheckCircle,
  QrCode,
  ClipboardList,
  User as UserIcon,
  BookOpen,
  Users,
  Smile,
  ClipboardCheck,
} from "lucide-react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const BRAND = {
  primary: "#3390ec",
  primaryDark: "#2b7cb9",
  background: "#f4f6f9",
  surface: "#FFFFFF",
  text: "#1c1c1e",
  textMuted: "#8e8e93",
  border: "#E5E5EA",
  success: "#34c759",
  warning: "#ffcc00",
  danger: "#ff3b30",
};

const getAvatarColor = (name: string) => {
  const colors = ['#e17076', '#faa774', '#a695e7', '#7bc862', '#6ec9cb', '#65aadd', '#ee7aae'];
  const charCode = (name || "X").charCodeAt(0) || 0;
  return colors[charCode % colors.length];
};

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

type StudentAttendanceRow = {
  id: number;
  name: string;
  doctor_name: string;
  attended_lectures: number;
  total_lectures: number;
  attendance_percentage: number;
};

// ==========================================
// 1. Animated Progress Bar (List items)
// ==========================================
function AnimatedProgressBar({ percentage, color }: { percentage: number; color: string }) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(percentage, { duration: 1000 });
  }, [percentage]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  return (
    <View style={styles.progressBarBg}>
      <Animated.View style={[styles.progressBarFill, { backgroundColor: color }, animatedStyle]} />
    </View>
  );
}

// ==========================================
// 2. Flowing Wave Line Chart
// ==========================================
function AttendanceBarChart({ data }: { data: StudentAttendanceRow[] }) {
  if (!data || data.length === 0) return null;

  const labels = data.map((item) => item.name.split(" ")[0].substring(0, 10));
  const percentages = data.map((item) => item.attendance_percentage);

  return (
    <Animated.View entering={FadeInDown.delay(250).springify()} style={[styles.cardShadow, styles.chartWrapper]}>
      <Text style={styles.chartTitle}>Attendance Overview</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
        <LineChart
          data={{
            labels: labels.length > 0 ? labels : ["No data"],
            datasets: [
              {
                data: percentages.length > 0 ? percentages : [0],
                strokeWidth: 3,
              },
            ],
          }}
          width={Math.max(SCREEN_WIDTH - 80, labels.length * 70)}
          height={200}
          yAxisLabel=""
          yAxisSuffix="%"
          withInnerLines={false}
          withOuterLines={false}
          fromZero
          chartConfig={{
            backgroundColor: BRAND.surface,
            backgroundGradientFrom: BRAND.surface,
            backgroundGradientTo: BRAND.surface,
            decimalPlaces: 0,
            fillShadowGradientFrom: BRAND.primary,
            fillShadowGradientFromOpacity: 0.3,
            fillShadowGradientTo: BRAND.primary,
            fillShadowGradientToOpacity: 0,
            color: (opacity = 1) => `rgba(51, 144, 236, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(142, 142, 147, ${opacity})`,
            style: {
              borderRadius: 16,
            },
            propsForDots: {
              r: "5",
              strokeWidth: "2",
              stroke: BRAND.surface,
            },
          }}
          bezier
          style={{
            marginVertical: 4,
            borderRadius: 16,
          }}
        />
      </ScrollView>
    </Animated.View>
  );
}


// ==========================================
// 3. Hero Banner (Static Image)
// ==========================================
const HERO_BANNER = {
  image: require("../../assets/dash.jpg"),
  title: "Welcome to AttendQR",
};

function HeroSlider() {
  return (
    <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.sliderContainer}>
      <View style={styles.slideItem}>
        <Image source={HERO_BANNER.image} style={styles.slideImage} />
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.8)"]} style={styles.slideOverlay}>
          <Text style={styles.slideTitle}>{HERO_BANNER.title}</Text>
        </LinearGradient>
      </View>
    </Animated.View>
  );
}

// ==========================================
// 4. Action Card Component
// ==========================================
function ActionCard({ item, onOpenScreen }: any) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable 
      style={[styles.actionCard, animatedStyle]}
      onPressIn={() => (scale.value = withSpring(0.94))}
      onPressOut={() => (scale.value = withSpring(1))}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onOpenScreen(item.id);
      }}
    >
      <View style={styles.actionCardHead}>
        <View style={[styles.actionIconContainer, { backgroundColor: `${item.color}16` }]}>
          <item.icon color={item.color} size={24} strokeWidth={2.4} />
        </View>
        <View style={[styles.actionAccent, { backgroundColor: item.color }]} />
      </View>

      <View style={styles.actionTextWrap}>
        <Text style={styles.actionLabel}>{item.label}</Text>
        <Text style={styles.actionHint}>{item.hint}</Text>
      </View>
    </AnimatedPressable>
  );
}

// ==========================================
// 5. Student Dashboard Component
// ==========================================
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function StudentDashboard({ subjects, loading, onOpenScreen }: { subjects: StudentAttendanceRow[]; loading: boolean; onOpenScreen: (screen: string, params?: Record<string, any>) => void }) {

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        {Platform.OS !== "web" ? (
          <LottieView source={{ uri: "https://lottie.host/1ad3af53-f54a-486a-bcf7-9aea0a0f697c/yF4Hsho8pN.json" }} autoPlay loop style={{ width: 140, height: 140 }} />
        ) : (
          <ActivityIndicator size="large" color={BRAND.primary} />
        )}
        <Text style={styles.loadingText}>Loading data...</Text>
      </View>
    );
  }

  const totalSubjects = subjects.length;
  const avgAttendance = totalSubjects > 0 ? Math.round(subjects.reduce((a: number, s: StudentAttendanceRow) => a + s.attendance_percentage, 0) / totalSubjects) : 0;
  const goodStanding = subjects.filter((s: StudentAttendanceRow) => s.attendance_percentage >= 75).length;

  return (
    <View style={styles.sectionContainer}>
      
      {/* Quick Actions (Modern Grid Tile Layout) */}
      <Animated.View entering={FadeInDown.delay(150).springify()} style={styles.actionCardsRow}>
        {[
          { id: 'QR', icon: QrCode, label: 'Scan QR', hint: 'Attendance now', color: '#ff6b6b' },
          { id: 'Materials', icon: BookOpen, label: 'Materials', hint: 'Lecture files', color: '#5f27cd' },
          { id: 'Tasks', icon: ClipboardList, label: 'Tasks', hint: 'Due items', color: '#1dd1a1' },
          { id: 'Quizzes', icon: ClipboardCheck, label: 'Exams', hint: 'Start quiz', color: '#ff9f43' },
          { id: 'Workspaces', icon: Users, label: 'Chats', hint: 'Class spaces', color: '#0abde3' },
          { id: 'Account', icon: UserIcon, label: 'Account', hint: 'Profile settings', color: BRAND.primary },
        ].map((item) => (
          <ActionCard key={item.id} item={item} onOpenScreen={onOpenScreen} />
        ))}
      </Animated.View>

      {/* Stats Group */}
      <Animated.View entering={FadeInDown.delay(200).springify()} style={[styles.cardShadow, styles.statsWrapper]}>
        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <BookMarked color={BRAND.primary} size={26} strokeWidth={2} />
            <Text style={styles.statValue}>{totalSubjects}</Text>
            <Text style={styles.statLabel}>Enrolled</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <TrendingUp color={avgAttendance > 70 ? BRAND.success : BRAND.warning} size={26} strokeWidth={2} />
            <Text style={styles.statValue}>{avgAttendance}%</Text>
            <Text style={styles.statLabel}>Avg Attend</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <CheckCircle color={BRAND.success} size={26} strokeWidth={2} />
            <Text style={styles.statValue}>{goodStanding}</Text>
            <Text style={styles.statLabel}>Good Standing</Text>
          </View>
        </View>
      </Animated.View>

      {/* Embedded Bar Chart */}
      <AttendanceBarChart data={subjects} />

      <Animated.Text entering={FadeIn.delay(300)} style={styles.sectionTitle}>Detailed Breakdown</Animated.Text>
      
      {subjects.length === 0 ? (
        <Animated.View entering={FadeIn.delay(400)} style={styles.emptyContainer}>
          {Platform.OS !== "web" ? (
            <LottieView source={{ uri: "https://lottie.host/1ad3af53-f54a-486a-bcf7-9aea0a0f697c/yF4Hsho8pN.json" }} autoPlay loop style={{ width: 180, height: 180 }} />
          ) : (
            <ActivityIndicator size="large" color={BRAND.primary} />
          )}
          <Text style={styles.emptyText}>No enrolled subjects yet.</Text>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInDown.delay(400).springify()} style={[styles.cardShadow, styles.listGroup]}>
          {subjects.map((s: StudentAttendanceRow, index: number) => {
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
                  
                  <AnimatedProgressBar percentage={pct} color={barColor} />
                  
                  <Text style={styles.listSubtitle}>
                    Dr. {s.doctor_name} • {s.attended_lectures}/{s.total_lectures} Lectures
                  </Text>
                </View>
              </View>
            );
          })}
        </Animated.View>
      )}
    </View>
  );
}

// ==========================================
// Main Dashboard Screen
// ==========================================
export default function DashboardNativeScreen({ token, user }: { token: string; user: User }) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [refreshing, setRefreshing] = useState(false);
  const [studentSubjects, setStudentSubjects] = useState<any[]>([]);
  const [studentLoading, setStudentLoading] = useState(true);
  const [profileUser, setProfileUser] = useState<User>(user);
  const [collegeLogoFailed, setCollegeLogoFailed] = useState(false);
  const [universityLogoFailed, setUniversityLogoFailed] = useState(false);
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["25%", "50%"], []);
  const isStudent = user?.role === "student";

  const fetchStudentAttendance = useCallback(async () => {
    if (!isStudent) return;

    try {
      const res = await api.get("/attendance/my-attendance", authHeaders(token));
      setStudentSubjects(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load attendance", err);
      setStudentSubjects([]);
    } finally {
      setStudentLoading(false);
    }
  }, [isStudent, token]);

  useEffect(() => {
    if (!isStudent) {
      setStudentLoading(false);
      setStudentSubjects([]);
      return;
    }

    setStudentLoading(true);
    fetchStudentAttendance();
  }, [isStudent, fetchStudentAttendance]);

  useEffect(() => {
    setProfileUser(user);
    setCollegeLogoFailed(false);
    setUniversityLogoFailed(false);
  }, [user]);

  useEffect(() => {
    let active = true;

    const refreshProfile = async () => {
      try {
        const freshUser = await getMe(token);
        if (active && freshUser?.id) {
          setProfileUser(freshUser);
          setCollegeLogoFailed(false);
          setUniversityLogoFailed(false);
        }
      } catch {
        // Keep the current user object if the refresh fails.
      }
    };

    void refreshProfile();

    return () => {
      active = false;
    };
  }, [token]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchStudentAttendance();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setRefreshing(false);
    }
  }, [fetchStudentAttendance]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => { scrollY.value = event.contentOffset.y; },
  });

  const headerStyle = useAnimatedStyle(() => ({
    paddingTop: insets.top + 10,
    paddingBottom: interpolate(scrollY.value, [0, 60], [14, 10], Extrapolation.CLAMP),
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 60], [1, 0.4], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(scrollY.value, [0, 60], [1, 0.95], Extrapolation.CLAMP) },
      { translateX: interpolate(scrollY.value, [0, 60], [0, -10], Extrapolation.CLAMP) }
    ]
  }));

  const logoStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(scrollY.value, [0, 60], [1, 0.85], Extrapolation.CLAMP) },
      { translateY: interpolate(scrollY.value, [0, 60], [0, 4], Extrapolation.CLAMP) }
    ]
  }));

  const displayName = useMemo(() => {
    const fullName = (profileUser?.name || "User").trim();
    const parts = fullName.split(/\s+/).filter(Boolean);
    return parts.slice(0, 3).join(" ") || "User";
  }, [profileUser?.name]);

  const universityLogoUri = useMemo(() => resolveMediaUrl(profileUser?.university_logo), [profileUser?.university_logo]);
  const collegeLogoUri = useMemo(() => resolveMediaUrl(profileUser?.college_logo), [profileUser?.college_logo]);

  const openScreen = (screen: string, params?: Record<string, any>) => {
    navigation.navigate(screen as never, params as never);
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      
      {/* Animated Header with Safe Area */}
      <Animated.View style={[styles.heroHeader, headerStyle]}>
        <BlurView intensity={Platform.OS === 'ios' ? 70 : 100} tint="light" style={StyleSheet.absoluteFill} />
        
        <Animated.View style={[styles.heroNameBlock, titleStyle]}>
          <Text style={styles.heroTitle} numberOfLines={1}>
            Hello, {displayName} 👋
          </Text>
          <Text style={styles.collegeText} numberOfLines={1}>
            {user?.college_name || "AttendQR System"}
          </Text>
        </Animated.View>

        <Animated.View style={[styles.logoContainer, logoStyle]}>
          <View style={styles.logosStack}>
            {collegeLogoUri && !collegeLogoFailed ? (
              <Image
                source={{ uri: collegeLogoUri }}
                style={styles.institutionLogo}
                resizeMode="contain"
                onError={() => setCollegeLogoFailed(true)}
              />
            ) : null}
            {universityLogoUri && !universityLogoFailed ? (
              <Image
                source={{ uri: universityLogoUri }}
                style={styles.institutionLogo}
                resizeMode="contain"
                onError={() => setUniversityLogoFailed(true)}
              />
            ) : null}
            {!collegeLogoUri && !universityLogoUri ? (
              <View style={[styles.institutionLogo, { backgroundColor: getAvatarColor(profileUser?.name || "") }]}>
                <Text style={styles.heroAvatarText}>{(profileUser?.name || "U").charAt(0).toUpperCase()}</Text>
              </View>
            ) : null}
          </View>
        </Animated.View>
      </Animated.View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: insets.top + 110, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND.primary} />}
      >
        <HeroSlider />

        {isStudent && <StudentDashboard subjects={studentSubjects} loading={studentLoading} onOpenScreen={openScreen} />}
      </Animated.ScrollView>

      <BottomSheet ref={sheetRef} index={-1} snapPoints={snapPoints}>
        <View style={styles.sheetContent}>
          <Text style={styles.sheetText}>More details here</Text>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.background },
  
  heroHeader: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 100,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.05)",
  },
  greetingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  greetingText: { fontSize: 13, color: BRAND.textMuted, fontWeight: "600" },
  heroNameBlock: { flex: 1, marginRight: 16, justifyContent: "center" },
  heroTitle: { color: BRAND.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  collegeText: { fontSize: 13, color: BRAND.textMuted, marginTop: 2, fontWeight: "500" },
  
  logoContainer: { alignItems: "center", justifyContent: "center" },
  logosStack: { flexDirection: "row", alignItems: "center", gap: 8 },
  institutionLogo: {
    width: 50, height: 50, borderRadius: 14, justifyContent: "center", alignItems: "center",
    backgroundColor: BRAND.surface, overflow: "hidden", resizeMode: "contain",
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  heroAvatarText: { color: "white", fontSize: 20, fontWeight: "800" },

  sliderContainer: { marginTop: 10, marginBottom: 24 },
  slideItem: {
    width: SCREEN_WIDTH - 40, height: 180, marginHorizontal: 20, borderRadius: 20, overflow: "hidden",
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  slideImage: { width: "100%", height: "100%", resizeMode: "cover" },
  slideOverlay: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: "60%",
    justifyContent: "flex-end", padding: 16,
  },
  slideTitle: { color: "#fff", fontSize: 18, fontWeight: "800", textShadowColor: 'rgba(0, 0, 0, 0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  
  paginationDots: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 14, gap: 6 },
  dot: { height: 8, borderRadius: 4 },

  sheetContent: { flex: 1, padding: 24 },
  sheetText: { fontSize: 18, color: BRAND.text, fontWeight: "800" },

  loadingContainer: { alignItems: "center", justifyContent: "center", marginTop: 60 },
  loadingText: { marginTop: -10, fontSize: 16, color: BRAND.textMuted, fontWeight: "700" },
  emptyContainer: { alignItems: "center", marginTop: 20 },
  emptyText: { marginTop: -10, fontSize: 16, color: BRAND.textMuted, fontWeight: "600" },

  actionCardsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 20,
    rowGap: 12,
  },
  actionCard: {
    width: "48.5%",
    minHeight: 126,
    backgroundColor: BRAND.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)'
  },
  actionCardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  actionIconContainer: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  actionAccent: {
    width: 18,
    height: 6,
    borderRadius: 999,
  },
  actionTextWrap: {
    gap: 4,
  },
  actionLabel: { fontSize: 15, fontWeight: "800", color: BRAND.text },
  actionHint: { fontSize: 12, fontWeight: "600", color: BRAND.textMuted },

  cardShadow: {
    backgroundColor: BRAND.surface, borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },

  sectionContainer: { paddingHorizontal: 20, gap: 16 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: BRAND.text, marginTop: 16, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  
  statsWrapper: { overflow: "hidden", marginBottom: 16, borderWidth: 1, borderColor: BRAND.border },
  statRow: { flexDirection: "row", alignItems: "center", paddingVertical: 18 },
  statBox: { flex: 1, alignItems: "center" },
  statDivider: { width: 1, height: 40, backgroundColor: BRAND.border },
  statValue: { fontSize: 22, fontWeight: "800", color: BRAND.text, marginTop: 8 },
  statLabel: { fontSize: 12, color: BRAND.textMuted, marginTop: 4, fontWeight: "600" },

  /* Chart Styles */
  chartWrapper: {
    padding: 20,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)'
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: BRAND.text,
    marginBottom: 16,
  },
  chartScrollArea: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingBottom: 10,
    gap: 16,
  },
  chartColumn: {
    alignItems: "center",
    width: 60,
  },
  chartBarBackground: {
    width: 24,
    height: 140,
    backgroundColor: BRAND.background,
    borderRadius: 12,
    justifyContent: "flex-end",
    overflow: "hidden",
    marginVertical: 10,
  },
  chartBarFill: {
    width: "100%",
    borderRadius: 12,
  },
  chartPctLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: BRAND.text,
  },
  chartSubLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: BRAND.textMuted,
    textAlign: "center",
    maxWidth: 60,
  },

  listGroup: { overflow: "hidden", padding: 6, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.03)' },
  listRow: { flexDirection: "row", alignItems: "center", padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.border },
  noBorder: { borderBottomWidth: 0 },
  listRowContent: { flex: 1, justifyContent: "center" },
  listTitle: { fontSize: 16, fontWeight: "700", color: BRAND.text, marginBottom: 6, letterSpacing: -0.3 },
  listSubtitle: { fontSize: 13, color: BRAND.textMuted, marginTop: 8, fontWeight: "500" },

  avatar: { width: 50, height: 50, borderRadius: 16, justifyContent: "center", alignItems: "center", marginRight: 16 },
  avatarText: { color: "white", fontSize: 20, fontWeight: "800" },

  subjectHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  pctText: { fontSize: 15, fontWeight: "800" },
  progressBarBg: { height: 6, backgroundColor: BRAND.background, borderRadius: 3, overflow: "hidden" },
  progressBarFill: { height: "100%", borderRadius: 3 },
});