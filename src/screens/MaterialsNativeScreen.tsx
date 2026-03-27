import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookMarked, ChevronRight, FolderOpen, AlertCircle, RefreshCw } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

// افترضنا إن الـ api موجودة في مسارك
import { api } from "../lib/api";

const BRAND = {
  primary: "#3390ec",
  primaryDark: "#2b7cb9",
  background: "#f1f2f6", // خلفية أغمق سنة عشان الـ Cards تنطق
  surface: "#FFFFFF",
  text: "#1c1c1e", // لون نصوص iOS أريح للعين
  textMuted: "#8e8e93",
  border: "#E5E5EA",
  error: "#FF3B30",
};

const getAvatarColor = (name: string) => {
  const colors = ["#e17076", "#faa774", "#a695e7", "#7bc862", "#6ec9cb", "#65aadd", "#ee7aae"];
  const charCode = (name || "X").charCodeAt(0) || 0;
  return colors[charCode % colors.length];
};

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// --- Skeleton Loader Component ---
const SkeletonRow = () => {
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.listRow, animatedStyle]}>
      <View style={[styles.avatar, { backgroundColor: BRAND.border }]} />
      <View style={styles.listRowContent}>
        <View style={{ width: "60%", height: 16, backgroundColor: BRAND.border, borderRadius: 4, marginBottom: 8 }} />
        <View style={{ width: "30%", height: 12, backgroundColor: BRAND.border, borderRadius: 4 }} />
      </View>
    </Animated.View>
  );
};

// --- Animated List Item Component ---
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SubjectItem = React.memo(({ item, index, isFirst, isLast, materialsCount, onPress }: any) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const getSubjectInitials = (name?: string) => name ? name.trim().slice(0, 2).toUpperCase() : "MT";

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).springify().damping(14)}>
      <AnimatedPressable
        onPressIn={() => (scale.value = withSpring(0.97))}
        onPressOut={() => (scale.value = withSpring(1))}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress(item.id);
        }}
        style={[
          styles.listRow,
          isFirst && styles.firstRow,
          isLast && styles.lastRow,
          animatedStyle,
        ]}
      >
        <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.name) }]}>
          <Text style={styles.avatarText}>{getSubjectInitials(item.name)}</Text>
        </View>

        <View style={styles.listRowContent}>
          <Text style={styles.listTitle} numberOfLines={1}>
            {item.name || `Subject ${item.id}`}
          </Text>
          <Text style={styles.listSubtitle}>
            {materialsCount} {materialsCount === 1 ? "Material" : "Materials"}
          </Text>
        </View>

        <ChevronRight color={BRAND.border} size={20} strokeWidth={2.5} />
      </AnimatedPressable>
      {!isLast && <View style={styles.separator} />}
    </Animated.View>
  );
});

export default function MaterialsNativeScreen({ token }: { token: string }) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  
  const [materials, setMaterials] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [matRes, subRes] = await Promise.all([
        api.get("/materials", authHeaders(token)),
        api.get("/subjects", authHeaders(token)),
      ]);
      setMaterials(matRes.data || []);
      setSubjects(subRes.data || []);
    } catch (err) {
      console.error("Failed to load materials", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const materialsBySubject = useMemo(() => {
    const map = new Map<number, number>();
    materials.forEach((item) => {
      map.set(item.subject_id, (map.get(item.subject_id) || 0) + 1);
    });
    return map;
  }, [materials]);

  const visibleSubjects = useMemo(() => {
    if (subjects.length > 0) return subjects;
    return Array.from(materialsBySubject.keys()).map((id) => ({
      id,
      name: materials.find((m) => m.subject_id === id)?.subject_name || `Subject ${id}`,
    }));
  }, [subjects, materialsBySubject, materials]);

  const handleNavigate = useCallback((id: number) => {
    navigation.navigate("SubjectMaterialsNative", { subjectId: id });
  }, [navigation]);

  const renderSubjectRow = useCallback(({ item, index }: { item: any; index: number }) => {
    return (
      <SubjectItem
        item={item}
        index={index}
        isFirst={index === 0}
        isLast={index === visibleSubjects.length - 1}
        materialsCount={materialsBySubject.get(item.id) || 0}
        onPress={handleNavigate}
      />
    );
  }, [visibleSubjects.length, materialsBySubject, handleNavigate]);

  // --- UI States ---
  if (error) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <AlertCircle color={BRAND.error} size={48} strokeWidth={1.5} style={{ marginBottom: 16 }} />
        <Text style={styles.errorTitle}>Oops! Something went wrong.</Text>
        <Text style={styles.errorSubtitle}>We couldn't load your materials.</Text>
        <Pressable style={styles.retryButton} onPress={fetchData}>
          <RefreshCw color="#fff" size={18} style={{ marginRight: 8 }} />
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      
      {/* Header with Safe Area padding */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.iconContainer}>
            <BookMarked color={BRAND.primary} size={24} strokeWidth={2.5} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Materials</Text>
            {!loading && <Text style={styles.headerSubtitle}>{visibleSubjects.length} subjects available</Text>}
          </View>
        </View>
      </View>

      <Animated.FlatList
        data={loading ? Array.from({ length: 5 }) : visibleSubjects} // Show 5 skeletons if loading
        keyExtractor={(_, index) => (loading ? `skeleton-${index}` : visibleSubjects[index].id.toString())}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          !loading && visibleSubjects.length > 0 ? (
             <Text style={styles.sectionTitle}>Your Subjects</Text>
          ) : <View style={{ height: 24 }} />
        }
        renderItem={loading ? () => <SkeletonRow /> : renderSubjectRow}
        ListEmptyComponent={
          loading ? null : (
            <Animated.View entering={FadeIn} style={styles.emptyState}>
              <FolderOpen color={BRAND.border} size={64} strokeWidth={1} />
              <Text style={styles.emptyText}>No materials found</Text>
              <Text style={styles.emptySubText}>When you add materials, they'll show up here.</Text>
            </Animated.View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.background },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: BRAND.background, padding: 24 },
  
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: BRAND.surface,
    // Soft shadow for depth
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    zIndex: 10,
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: BRAND.primary + "15", // 15% opacity
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  headerTitle: { fontSize: 24, fontWeight: "800", color: BRAND.text, letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: BRAND.textMuted, fontWeight: "500", marginTop: 2 },

  listContent: { 
    paddingBottom: 120,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: BRAND.textMuted,
    marginLeft: 8,
    marginTop: 24,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },

  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: BRAND.surface,
  },
  firstRow: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  lastRow: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: BRAND.border, marginLeft: 76 },

  listRowContent: { flex: 1, justifyContent: "center" },
  listTitle: { fontSize: 17, fontWeight: "600", color: BRAND.text, marginBottom: 4, letterSpacing: -0.3 },
  listSubtitle: { fontSize: 14, color: BRAND.textMuted, fontWeight: "400" },

  avatar: { width: 48, height: 48, borderRadius: 16, justifyContent: "center", alignItems: "center", marginRight: 16 },
  avatarText: { color: "white", fontSize: 16, fontWeight: "700", letterSpacing: 1 },

  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 100 },
  emptyText: { color: BRAND.text, marginTop: 16, fontSize: 18, fontWeight: "700" },
  emptySubText: { color: BRAND.textMuted, marginTop: 8, fontSize: 15, textAlign: "center", paddingHorizontal: 32, lineHeight: 22 },

  errorTitle: { fontSize: 20, fontWeight: "700", color: BRAND.text, marginBottom: 8 },
  errorSubtitle: { fontSize: 15, color: BRAND.textMuted, marginBottom: 24, textAlign: "center" },
  retryButton: { flexDirection: "row", backgroundColor: BRAND.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, alignItems: "center" },
  retryText: { color: "white", fontSize: 16, fontWeight: "600" },
});