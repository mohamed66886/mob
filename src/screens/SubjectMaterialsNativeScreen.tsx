import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as DocumentPicker from "expo-document-picker";
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

import { api } from "../lib/api";
import { User } from "../types/auth";
import {
  ArrowLeft,
  Plus,
  UploadCloud,
  Link as LinkIcon,
  BookOpenText,
  FileText,
  Video,
  File,
  X,
  ChevronRight,
} from "lucide-react-native";

// Telegram/iOS-like color palette
const BRAND = {
  primary: "#3390ec",
  primaryDark: "#2b7cb9",
  background: "#f1f2f6",
  surface: "#FFFFFF",
  text: "#1c1c1e",
  textMuted: "#8e8e93",
  border: "#E5E5EA",
  danger: "#FF3B30",
};

type MaterialType = "pdf" | "video" | "file" | "link";

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

const getMaterialColor = (type: string) => {
  switch (type) {
    case "pdf": return "#e17076";   // Red
    case "video": return "#65aadd"; // Blue
    case "link": return "#7bc862";  // Green
    default: return "#a695e7";      // Purple
  }
};

const getMaterialIcon = (type: string) => {
  switch (type) {
    case "pdf": return <FileText color="white" size={20} strokeWidth={2.5} />;
    case "video": return <Video color="white" size={20} strokeWidth={2.5} />;
    case "link": return <LinkIcon color="white" size={20} strokeWidth={2.5} />;
    default: return <File color="white" size={20} strokeWidth={2.5} />;
  }
};

// --- Skeleton Component ---
const SkeletonMaterialRow = () => {
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, []);

  return (
    <Animated.View style={[styles.listRow, { opacity }]}>
      <View style={[styles.iconBox, { backgroundColor: BRAND.border }]} />
      <View style={styles.listRowContent}>
        <View style={{ width: "70%", height: 16, backgroundColor: BRAND.border, borderRadius: 4, marginBottom: 8 }} />
        <View style={{ width: "40%", height: 12, backgroundColor: BRAND.border, borderRadius: 4 }} />
      </View>
    </Animated.View>
  );
};

// --- Animated List Item ---
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const MaterialItem = React.memo(({ item, index, isLast, onPress }: any) => {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const formatDate = (value?: string) => {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).springify().damping(14)}>
      <AnimatedPressable
        onPressIn={() => (scale.value = withSpring(0.97))}
        onPressOut={() => (scale.value = withSpring(1))}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress(item);
        }}
        style={[styles.listRow, isLast && styles.noBorder, animatedStyle]}
      >
        <View style={[styles.iconBox, { backgroundColor: getMaterialColor(item.material_type) }]}>
          {getMaterialIcon(item.material_type)}
        </View>
        <View style={styles.listRowContent}>
          <Text style={styles.listTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.listSubtitle}>
            {item.material_type.toUpperCase()} • {formatDate(item.created_at)}
          </Text>
        </View>
        <ChevronRight color={BRAND.border} size={20} strokeWidth={2.5} />
      </AnimatedPressable>
    </Animated.View>
  );
});

export default function SubjectMaterialsNativeScreen({ token, user, route, navigation }: any) {
  const subjectId = route?.params?.subjectId || 0;
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<any[]>([]);
  const [subject, setSubject] = useState<any>(null);
  
  const [isModalVisible, setModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [form, setForm] = useState({ title: "", material_type: "file" as MaterialType, link_url: "" });

  const canCreate = user?.role === "doctor";

  const sortedMaterials = useMemo(() => {
    return [...materials].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime; 
    });
  }, [materials]);

  const fetchData = useCallback(async () => {
    if (!subjectId) { setLoading(false); return; }
    try {
      const [matRes, subRes] = await Promise.all([
        api.get(`/materials?subject_id=${subjectId}`, authHeaders(token)),
        api.get("/subjects", authHeaders(token)),
      ]);
      const sub = (subRes.data || []).find((s: any) => s.id === subjectId) || null;
      setSubject(sub);
      setMaterials(matRes.data || []);
    } catch (err) {
      Alert.alert("Error", "Failed to load subject materials");
    } finally {
      setLoading(false);
    }
  }, [subjectId, token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: "*/*" });
      if (!result.canceled && result.assets.length > 0) {
        setFile(result.assets[0]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) { Alert.alert("Error", "Failed to pick file"); }
  };

  const submitMaterial = async () => {
    if (!form.title.trim()) return Alert.alert("Validation", "Please enter a title");
    if (form.material_type === "link" && !form.link_url.trim()) return Alert.alert("Validation", "Please enter a valid link");
    if (form.material_type !== "link" && !file) return Alert.alert("Validation", "Please select a file to upload");

    setIsSubmitting(true);
    try {
      const data = new FormData();
      data.append("subject_id", String(subjectId));
      data.append("title", form.title);
      data.append("material_type", form.material_type);
      if (form.material_type === "link") {
        data.append("link_url", form.link_url);
      } else if (file) {
        data.append("file", { uri: file.uri, name: file.name, type: file.mimeType || "application/octet-stream" } as any);
      }

      await api.post("/materials", data, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalVisible(false);
      setFile(null);
      setForm({ title: "", material_type: "file", link_url: "" });
      fetchData();
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.error || "Failed to upload material");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setIsSubmitting(false); }
  };

  const openMaterial = useCallback((m: any) => {
    const isPdf = m.material_type === "pdf" || /\.pdf($|\?)/i.test(m.file_url);
    const type = isPdf ? "pdf" : m.material_type;
    const params = { id: m.id, title: m.title, type, url: m.file_url };

    const parentNavigation = navigation?.getParent?.();
    if (typeof parentNavigation?.navigate === "function") return parentNavigation.navigate("MaterialViewerNative", params);
    if (typeof navigation?.push === "function") return navigation.push("MaterialViewerNative", params);
    if (typeof navigation?.navigate === "function") return navigation.navigate("MaterialViewerNative", params);
  }, [navigation]);

  if (!subjectId) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Invalid Subject ID</Text>
        <Pressable style={styles.backBtn} onPress={() => navigation?.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      
      {/* Modern Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable 
          onPress={() => {
            Haptics.selectionAsync();
            navigation?.goBack();
          }} 
          style={({ pressed }) => [styles.backIcon, pressed && { opacity: 0.5 }]}
        >
          <ArrowLeft color={BRAND.primary} size={28} strokeWidth={2.5} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {subject?.name || "Loading..."}
          </Text>
          {!loading && <Text style={styles.headerSubtitle}>{materials.length} Materials</Text>}
        </View>
      </View>

      <Animated.FlatList
        data={loading ? Array.from({ length: 4 }) : sortedMaterials}
        keyExtractor={(_, index) => loading ? `skeleton-${index}` : sortedMaterials[index].id.toString()}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={loading ? () => <SkeletonMaterialRow /> : ({ item, index }) => (
          <MaterialItem item={item} index={index} isLast={index === sortedMaterials.length - 1} onPress={openMaterial} />
        )}
        ListEmptyComponent={
          loading ? null : (
            <Animated.View entering={FadeIn} style={styles.emptyState}>
              <BookOpenText color={BRAND.border} size={64} strokeWidth={1} />
              <Text style={styles.emptyText}>No materials uploaded yet</Text>
              {canCreate && <Text style={styles.emptySubText}>Tap the + button to add the first material.</Text>}
            </Animated.View>
          )
        }
      />

      {/* Animated FAB */}
      {canCreate && (
        <AnimatedPressable 
          style={({ pressed }) => [
            styles.fab, 
            { bottom: insets.bottom + 24 },
            pressed && { transform: [{ scale: 0.92 }] }
          ]} 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setModalVisible(true);
          }}
        >
          <Plus color="white" size={28} strokeWidth={2.5} />
        </AnimatedPressable>
      )}

      {/* Bottom Sheet Modal */}
      <Modal visible={isModalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={styles.modalBackdrop} onPress={() => setModalVisible(false)} />
          <View style={[styles.modalContent, { paddingBottom: insets.bottom || 20 }]}>
            
            {/* Modal Handle */}
            <View style={styles.modalHandleContainer}>
              <View style={styles.modalHandle} />
            </View>

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Material</Text>
              <Pressable onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <X color={BRAND.textMuted} size={22} strokeWidth={2.5} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Title</Text>
              <TextInput
                style={styles.input}
                placeholder="E.g., Chapter 1 Notes"
                value={form.title}
                onChangeText={(t) => setForm({ ...form, title: t })}
                placeholderTextColor={BRAND.textMuted}
              />

              <Text style={styles.inputLabel}>Material Type</Text>
              <View style={styles.typeSelector}>
                {(["file", "pdf", "video", "link"] as MaterialType[]).map((type) => (
                  <Pressable
                    key={type}
                    style={[styles.typeBtn, form.material_type === type && styles.typeBtnActive]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setForm({ ...form, material_type: type });
                    }}
                  >
                    <Text style={[styles.typeBtnText, form.material_type === type && styles.typeBtnTextActive]}>
                      {type.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {form.material_type === "link" ? (
                <>
                  <Text style={styles.inputLabel}>Link URL</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="https://..."
                    value={form.link_url}
                    onChangeText={(t) => setForm({ ...form, link_url: t })}
                    placeholderTextColor={BRAND.textMuted}
                    keyboardType="url"
                    autoCapitalize="none"
                  />
                </>
              ) : (
                <>
                  <Text style={styles.inputLabel}>Attachment</Text>
                  <Pressable style={[styles.filePickerBtn, file && styles.filePickerBtnActive]} onPress={handlePickFile}>
                    <UploadCloud color={file ? BRAND.primary : BRAND.textMuted} size={32} />
                    <Text style={[styles.filePickerText, file && { color: BRAND.primary, fontWeight: "600" }]}>
                      {file ? file.name : "Tap to select a file"}
                    </Text>
                  </Pressable>
                </>
              )}

              <Pressable 
                style={({ pressed }) => [styles.modalActionBtn, (isSubmitting || pressed) && { opacity: 0.8 }]} 
                onPress={submitMaterial}
                disabled={isSubmitting}
              >
                {isSubmitting ? <ActivityIndicator color="white" /> : (
                  <>
                    {form.material_type === "link" ? <LinkIcon color="white" size={20} strokeWidth={2.5} /> : <UploadCloud color="white" size={20} strokeWidth={2.5} />}
                    <Text style={styles.modalActionBtnText}>Save Material</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  
  header: { 
    flexDirection: "row", 
    alignItems: "center", 
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: BRAND.surface, 
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3, zIndex: 10
  },
  backIcon: { marginRight: 16, padding: 4 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: BRAND.text, letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 14, color: BRAND.textMuted, fontWeight: "500", marginTop: 2 },
  
  listContent: { paddingTop: 16, paddingBottom: 120, paddingHorizontal: 16 },

  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: BRAND.surface,
    borderRadius: 16,
    marginBottom: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1
  },
  noBorder: { borderBottomWidth: 0 },
  iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 16 },
  listRowContent: { flex: 1, justifyContent: "center" },
  listTitle: { fontSize: 16, fontWeight: "600", color: BRAND.text, marginBottom: 4, letterSpacing: -0.3 },
  listSubtitle: { fontSize: 13, color: BRAND.textMuted, fontWeight: "500" },

  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 100 },
  emptyText: { color: BRAND.text, marginTop: 16, fontSize: 18, fontWeight: "700" },
  emptySubText: { color: BRAND.textMuted, marginTop: 8, fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
  errorText: { color: BRAND.textMuted, fontSize: 16, marginBottom: 16 },
  backBtn: { backgroundColor: BRAND.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  backBtnText: { color: "white", fontWeight: "bold" },

  fab: {
    position: "absolute",
    right: 20,
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: BRAND.primary,
    justifyContent: "center", alignItems: "center",
    shadowColor: BRAND.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },

  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  modalContent: {
    backgroundColor: BRAND.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 10,
  },
  modalHandleContainer: { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
  modalHandle: { width: 40, height: 5, backgroundColor: BRAND.border, borderRadius: 3 },
  
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: BRAND.text },
  closeBtn: { backgroundColor: BRAND.background, padding: 6, borderRadius: 20 },
  
  modalBody: { paddingHorizontal: 20 },
  inputLabel: { fontSize: 14, fontWeight: "600", color: BRAND.text, marginBottom: 8, marginTop: 4 },
  input: { 
    backgroundColor: BRAND.background, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: BRAND.text, marginBottom: 16, borderWidth: 1, borderColor: BRAND.border 
  },
  
  typeSelector: { flexDirection: "row", gap: 8, marginBottom: 20 },
  typeBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 12, backgroundColor: BRAND.background, borderWidth: 1, borderColor: BRAND.border },
  typeBtnActive: { backgroundColor: BRAND.primary, borderColor: BRAND.primary },
  typeBtnText: { fontSize: 13, fontWeight: "700", color: BRAND.textMuted },
  typeBtnTextActive: { color: "white" },

  filePickerBtn: { backgroundColor: BRAND.background, borderRadius: 16, padding: 24, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: BRAND.border, borderStyle: "dashed", marginBottom: 20, gap: 10 },
  filePickerBtnActive: { borderColor: BRAND.primary, backgroundColor: BRAND.primary + "10" },
  filePickerText: { fontSize: 15, color: BRAND.textMuted, fontWeight: "500" },

  modalActionBtn: { backgroundColor: BRAND.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 16, marginTop: 8, gap: 8 },
  modalActionBtnText: { color: "white", fontSize: 17, fontWeight: "700" },
});