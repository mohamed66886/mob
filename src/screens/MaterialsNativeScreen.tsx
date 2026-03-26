import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Platform,
  ActivityIndicator,
  Pressable,
  FlatList,
} from "react-native";
import { api } from "../lib/api";
import { BookMarked, ChevronRight, FolderOpen } from "lucide-react-native";
import { useNavigation } from '@react-navigation/native';

// Telegram-like color palette
const BRAND = {
  primary: "#3390ec", // Telegram Blue
  primaryDark: "#2b7cb9",
  background: "#f1f2f6", // Telegram background
  surface: "#FFFFFF",
  text: "#000000",
  textMuted: "#707579",
  border: "#E1E9F2",
};

// Helper to generate consistent colors for subjects
const getAvatarColor = (name: string) => {
  const colors = ['#e17076', '#faa774', '#a695e7', '#7bc862', '#6ec9cb', '#65aadd', '#ee7aae'];
  const charCode = (name || "X").charCodeAt(0) || 0;
  return colors[charCode % colors.length];
};

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export default function MaterialsNativeScreen({ token }: { token: string }) {
  const navigation = useNavigation<any>();
  const [materials, setMaterials] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [matRes, subRes] = await Promise.all([
          api.get("/materials", authHeaders(token)),
          api.get("/subjects", authHeaders(token)),
        ]);
        setMaterials(matRes.data || []);
        setSubjects(subRes.data || []);
      } catch (err) {
        console.error("Failed to load materials", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token]);

  // Group materials by subject
  const materialsBySubject = useMemo(() => {
    const map = new Map<number, number>();
    materials.forEach((item) => {
      map.set(item.subject_id, (map.get(item.subject_id) || 0) + 1);
    });
    return map;
  }, [materials]);

  // Combine subjects with their material counts
  const visibleSubjects = useMemo(() => {
    if (subjects.length > 0) return subjects;
    return Array.from(materialsBySubject.keys()).map((id) => ({
      id,
      name: materials.find((m) => m.subject_id === id)?.subject_name || `Subject ${id}`,
    }));
  }, [subjects, materialsBySubject, materials]);

  const getSubjectInitials = (name?: string) => {
    return name ? name.trim().slice(0, 2).toUpperCase() : "MT";
  };

  const renderSubjectRow = ({ item, index }: { item: any, index: number }) => {
    const materialsCount = materialsBySubject.get(item.id) || 0;
    const isLast = index === visibleSubjects.length - 1;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.listRow,
          isLast && styles.noBorder,
          pressed && { backgroundColor: BRAND.border + "50" },
        ]}
        onPress={() => {
          navigation.navigate('SubjectMaterialsNative', { subjectId: item.id });
        }}
      >
        <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.name) }]}>
          <Text style={styles.avatarText}>{getSubjectInitials(item.name)}</Text>
        </View>
        
        <View style={styles.listRowContent}>
          <Text style={styles.listTitle} numberOfLines={1}>
            {item.name || `Subject ${item.id}`}
          </Text>
          <Text style={styles.listSubtitle}>
            {materialsCount} {materialsCount === 1 ? 'item' : 'items'}
          </Text>
        </View>
        
        <ChevronRight color={BRAND.textMuted} size={20} style={{ marginLeft: 10 }} />
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BRAND.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      {/* Telegram-style Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <BookMarked color={BRAND.primaryDark} size={28} />
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Materials</Text>
            <Text style={styles.headerSubtitle}>{visibleSubjects.length} subjects</Text>
          </View>
        </View>
      </View>

      {/* Grouped List Content */}
      <FlatList
        data={visibleSubjects}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          visibleSubjects.length > 0 ? (
            <Text style={styles.sectionTitle}>Your Subjects</Text>
          ) : null
        }
        renderItem={({ item, index }) => (
          <View style={styles.listGroupWrapper}>
            {/* If it's the first item, wrap it in the group styling */}
            {index === 0 ? (
              <View style={[styles.listGroup, { marginBottom: 0 }]}>
                {visibleSubjects.map((sub, idx) => (
                  <React.Fragment key={sub.id}>
                    {renderSubjectRow({ item: sub, index: idx })}
                  </React.Fragment>
                ))}
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <FolderOpen color={BRAND.border} size={56} strokeWidth={1.5} />
            <Text style={styles.emptyText}>No materials available right now.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BRAND.background,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) : 0,
  },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: BRAND.background },
  
  // Header
  header: { 
    flexDirection: "row", 
    alignItems: "center", 
    paddingHorizontal: 16, 
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: BRAND.surface, 
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  headerTitle: { fontSize: 20, fontWeight: "700", color: BRAND.text },
  headerSubtitle: { fontSize: 13, color: BRAND.textMuted },
  
  listContent: { paddingBottom: 40 },

  // Telegram Style Grouped Lists
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: BRAND.textMuted,
    marginLeft: 16,
    marginTop: 20,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  listGroupWrapper: {
    paddingHorizontal: 16,
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
  noBorder: {
    borderBottomWidth: 0,
  },
  listRowContent: { 
    flex: 1, 
    justifyContent: "center" 
  },
  listTitle: { 
    fontSize: 16, 
    fontWeight: "600", 
    color: BRAND.text, 
    marginBottom: 2 
  },
  listSubtitle: { 
    fontSize: 13, 
    color: BRAND.textMuted 
  },

  // Avatars
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  avatarText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 1,
  },

  // Empty State
  emptyState: { 
    alignItems: "center", 
    justifyContent: "center", 
    paddingVertical: 80 
  },
  emptyText: { 
    color: BRAND.textMuted, 
    marginTop: 16, 
    fontSize: 16, 
    fontWeight: "500" 
  },
});