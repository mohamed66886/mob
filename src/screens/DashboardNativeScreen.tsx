import React, { useEffect, useMemo, useState, useRef } from "react";
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
  FlatList,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
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
  SharedValue,
} from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";

import { api, resolveMediaUrl } from "../lib/api";
import { User, UserRole } from "../types/auth";
import LottieView from "../components/AppLottieView";
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

// ==========================================
// 1. Animated Progress Bar
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
// 2. Hero Slider (Carousel)
// ==========================================
const SLIDER_DATA = [
  { id: "1", image: "https://scontent.fcai20-6.fna.fbcdn.net/v/t39.30808-6/615922356_122116726935098137_3368359818312792439_n.jpg?_nc_cat=109&ccb=1-7&_nc_sid=7b2446&_nc_ohc=7dqeL4vODYkQ7kNvwFM6UaL&_nc_oc=AdqFJrxxo-PuIBMMw4PUXp8ZpnEGEqZLa2ycj0TKfZGpupL4lItgeZTkT9MdMuFoIQw&_nc_zt=23&_nc_ht=scontent.fcai20-6.fna&_nc_gid=EZMih5NSWzWpd7rz7zhMgg&_nc_ss=7a32e&oh=00_Afx_4agF0AVSYHuNd8Emhr27DbXvEiVSdI5Pq7Pb2U0Dyg&oe=69CBFB3B", title: "Welcome to Campus" },
  { id: "2", image: "https://scontent.fcai20-2.fna.fbcdn.net/v/t39.30808-6/593271377_872689161975179_7790153367077286875_n.jpg?stp=cp6_dst-jpg_tt6&_nc_cat=104&ccb=1-7&_nc_sid=7b2446&_nc_ohc=Rro9mAwWUU4Q7kNvwFUHXXL&_nc_oc=Adr2hn-OEVqiEkUEhl8FXTJWSnf5ZLuA7eCFBVZ--qpnLAnIwTiGgOPIhoFZatuv-2Y&_nc_zt=23&_nc_ht=scontent.fcai20-2.fna&_nc_gid=4rGC3dB8-jKJRHt8WtsgtA&_nc_ss=7a32e&oh=00_AfxoXi5jZ9H-xVFjGNHuGA2N2tq6DPCQwiVJ42p2lkXzmw&oe=69CBF97E", title: "Explore Your Courses Easily" },
  { id: "3", image: "https://codeforces.com/userpic.codeforces.org/3855328/title/d29cab9da9e6ef26.jpg", title: "Build Your Skills" },
];

function HeroSlider({ scrollY }: { scrollY: SharedValue<number> }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scrollY.value, [-200, 0, 200], [-80, 0, 80], Extrapolation.CLAMP) }],
  }));

  useEffect(() => {
    const interval = setInterval(() => {
      const nextIndex = (activeIndex + 1) % SLIDER_DATA.length;
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    }, 4000);
    return () => clearInterval(interval);
  }, [activeIndex]);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index || 0);
  }).current;

  return (
    <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.sliderContainer}>
      <FlatList
        ref={flatListRef}
        data={SLIDER_DATA}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View style={styles.slideItem}>
            <Animated.Image source={{ uri: item.image }} style={[styles.slideImage, imageStyle]} />
            <LinearGradient colors={["transparent", "rgba(0,0,0,0.8)"]} style={styles.slideOverlay}>
              <Text style={styles.slideTitle}>{item.title}</Text>
            </LinearGradient>
          </View>
        )}
      />
      
      {/* Animated Pagination Dots */}
      <View style={styles.paginationDots}>
        {SLIDER_DATA.map((_, i) => {
          const isActive = activeIndex === i;
          return (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                {
                  width: withSpring(isActive ? 24 : 8, { damping: 12 }),
                  backgroundColor: isActive ? BRAND.primary : BRAND.border,
                },
              ]}
            />
          );
        })}
      </View>
    </Animated.View>
  );
}

// ==========================================
// 3. Action Card Component
// ==========================================
function ActionCard({ item, onOpenScreen }: any) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable 
      style={[styles.actionCard, animatedStyle]}
      onPressIn={() => (scale.value = withSpring(0.9))}
      onPressOut={() => (scale.value = withSpring(1))}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onOpenScreen(item.id);
      }}
    >
      <View style={[styles.actionIconContainer, { backgroundColor: `${item.color}15` }]}>
        <item.icon color={item.color} size={26} strokeWidth={2.5} />
      </View>
      <Text style={styles.actionLabel}>{item.label}</Text>
    </AnimatedPressable>
  );
}

// ==========================================
// 4. Student Dashboard Component
// ==========================================
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function StudentDashboard({ token, onOpenScreen }: any) {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAttendance = async () => {
      try {
        const res = await api.get("/attendance/my-attendance", authHeaders(token));
        setSubjects(res.data || []);
      } catch (err) {
        console.error("Failed to load attendance", err);
      } finally { setLoading(false); }
    };
    fetchAttendance();
  }, [token]);

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
  const avgAttendance = totalSubjects > 0 ? Math.round(subjects.reduce((a, s) => a + s.attendance_percentage, 0) / totalSubjects) : 0;
  const goodStanding = subjects.filter((s) => s.attendance_percentage >= 75).length;

  return (
    <View style={styles.sectionContainer}>
      
      {/* Quick Actions */}
      <Animated.View entering={FadeInDown.delay(200).springify()} style={[styles.actionCardsRow, { flexWrap: "wrap", justifyContent: "flex-start", gap: 8 }]}>
        {[
          { id: 'QR', icon: QrCode, label: 'QR', color: '#ff6b6b' },
          { id: 'Materials', icon: BookOpen, label: 'Materials', color: '#5f27cd' },
          { id: 'Tasks', icon: ClipboardList, label: 'Tasks', color: '#1dd1a1' },
          { id: 'Quizzes', icon: ClipboardCheck, label: 'Exams', color: '#ff9f43' },
          { id: 'Workspaces', icon: Users, label: 'Chats', color: '#0abde3' },
          { id: 'Account', icon: UserIcon, label: 'Account', color: BRAND.primary },
        ].map((item) => (
          <ActionCard key={item.id} item={item} onOpenScreen={onOpenScreen} />
        ))}
      </Animated.View>

      {/* Stats Group */}
      <Animated.View entering={FadeInDown.delay(300).springify()} style={[styles.cardShadow, styles.statsWrapper]}>
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

      <Animated.Text entering={FadeIn.delay(400)} style={styles.sectionTitle}>Subject Attendance</Animated.Text>
      
      {subjects.length === 0 ? (
        <Animated.View entering={FadeIn.delay(500)} style={styles.emptyContainer}>
          {Platform.OS !== "web" ? (
            <LottieView source={{ uri: "https://lottie.host/1ad3af53-f54a-486a-bcf7-9aea0a0f697c/yF4Hsho8pN.json" }} autoPlay loop style={{ width: 180, height: 180 }} />
          ) : (
            <ActivityIndicator size="large" color={BRAND.primary} />
          )}
          <Text style={styles.emptyText}>No enrolled subjects yet.</Text>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInDown.delay(500).springify()} style={[styles.cardShadow, styles.listGroup]}>
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
  const insets = useSafeAreaInsets(); // Accurately account for the safe area insets
  const scrollY = useSharedValue(0);
  const [refreshing, setRefreshing] = useState(false);
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["25%", "50%"], []);

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRefreshing(false);
    }, 1200);
  };

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => { scrollY.value = event.contentOffset.y; },
  });

  const headerStyle = useAnimatedStyle(() => ({
    height: interpolate(scrollY.value, [0, 100], [100 + insets.top, 60 + insets.top], Extrapolation.CLAMP),
    paddingTop: insets.top,
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 50], [1, 0], Extrapolation.CLAMP),
  }));

  const isStudent = user?.role === "student";
  const displayName = useMemo(() => {
    const fullName = (user?.name || "User").trim();
    const parts = fullName.split(/\s+/).filter(Boolean);
    return parts.slice(0, 3).join(" ") || "User";
  }, [user?.name]);

  const universityLogoUri = useMemo(() => resolveMediaUrl(user?.university_logo), [user?.university_logo]);
  const collegeLogoUri = useMemo(() => resolveMediaUrl(user?.college_logo), [user?.college_logo]);

  const openScreen = (screen: string, params?: Record<string, any>) => {
    navigation.navigate(screen as never, params as never);
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      
      {/* Animated Header with Safe Area */}
      <Animated.View style={[styles.heroHeader, headerStyle]}>
        <BlurView intensity={Platform.OS === 'ios' ? 70 : 100} tint="light" style={StyleSheet.absoluteFill} />
        <View style={styles.heroNameBlock}>
          <View style={styles.greetingRow}>
            <Text style={styles.greetingText}>Welcome</Text>
            <Smile color={BRAND.primary} size={18} strokeWidth={2.5} />
          </View>
          <Animated.Text style={[styles.heroTitle, titleStyle]} numberOfLines={1}>
            {displayName}
          </Animated.Text>
          <Animated.Text style={[styles.collegeText, titleStyle]} numberOfLines={1}>
            {user?.college_name || "AttendQR System"}
          </Animated.Text>
        </View>
        <View style={styles.logoContainer}>
          <View style={styles.logosStack}>
            {collegeLogoUri ? (
              <Image source={{ uri: collegeLogoUri }} style={styles.institutionLogo} />
            ) : null}
            {universityLogoUri ? (
              <Image source={{ uri: universityLogoUri }} style={styles.institutionLogo} />
            ) : (
              <View style={[styles.institutionLogo, { backgroundColor: getAvatarColor(user?.name || "") }]}> 
                <Text style={styles.heroAvatarText}>{(user?.name || "U").charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>
        </View>
      </Animated.View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: insets.top + 110, paddingBottom: 100 }} // Dynamic padding
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND.primary} />}
      >
        <HeroSlider scrollY={scrollY} />

        {isStudent && <StudentDashboard token={token} onOpenScreen={openScreen} />}
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

  actionCardsRow: { flexDirection: "row", marginBottom: 24 },
  actionCard: { alignItems: "center", width: "30%", marginBottom: 12 },
  actionIconContainer: { width: 56, height: 56, borderRadius: 18, justifyContent: "center", alignItems: "center", marginBottom: 8 },
  actionLabel: { fontSize: 12, fontWeight: "700", color: BRAND.textMuted },

  cardShadow: {
    backgroundColor: BRAND.surface, borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },

  sectionContainer: { paddingHorizontal: 20, gap: 16 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: BRAND.text, marginTop: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  
  statsWrapper: { overflow: "hidden", marginBottom: 12 },
  statRow: { flexDirection: "row", alignItems: "center", paddingVertical: 16 },
  statBox: { flex: 1, alignItems: "center" },
  statDivider: { width: 1, height: 40, backgroundColor: BRAND.border },
  statValue: { fontSize: 22, fontWeight: "800", color: BRAND.text, marginTop: 8 },
  statLabel: { fontSize: 12, color: BRAND.textMuted, marginTop: 2, fontWeight: "600" },

  listGroup: { overflow: "hidden", padding: 6 },
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