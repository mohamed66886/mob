import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Pressable,
  TextInput,
  FlatList,
  Alert,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
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

// Telegram-like color palette
const BRAND = {
  primary: "#3390ec", // Telegram Blue
  primaryDark: "#2b7cb9",
  background: "#f1f2f6", // Telegram background
  surface: "#FFFFFF",
  text: "#000000",
  textMuted: "#707579",
  border: "#E1E9F2",
  danger: "#ff3b30",
};

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

type MaterialType = "pdf" | "video" | "file" | "link";

// Helper for Telegram-style color coded file icons
const getMaterialColor = (type: string) => {
  switch (type) {
    case "pdf": return "#e17076";   // Red
    case "video": return "#65aadd"; // Blue
    case "link": return "#7bc862";  // Green
    default: return "#a695e7";      // Purple for generic files
  }
};

export default function SubjectMaterialsNativeScreen({
  token,
  user,
  route,
  navigation,
}: {
  token: string;
  user: User;
  route?: any; 
  navigation?: any;
}) {
  const subjectId = route?.params?.subjectId || 0; 
  
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<any[]>([]);
  const [subject, setSubject] = useState<any>(null);
  
  // Modal & Form States
  const [isModalVisible, setModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [form, setForm] = useState({
    title: "",
    material_type: "file" as MaterialType,
    link_url: "",
  });

  const canCreate = user?.role === "doctor";

  const sortedMaterials = useMemo(() => {
    return [...materials].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime; 
    });
  }, [materials]);

  const fetchData = async () => {
    if (!subjectId) {
      setLoading(false);
      return;
    }
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
  };

  useEffect(() => {
    fetchData();
  }, [subjectId]);

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: "*/*", 
      });

      if (!result.canceled && result.assets.length > 0) {
        setFile(result.assets[0]);
      }
    } catch (err) {
      Alert.alert("Error", "Failed to pick file");
    }
  };

  const submitMaterial = async () => {
    if (!form.title.trim()) {
      Alert.alert("Validation", "Please enter a title");
      return;
    }
    if (form.material_type === "link" && !form.link_url.trim()) {
      Alert.alert("Validation", "Please enter a valid link");
      return;
    }
    if (form.material_type !== "link" && !file) {
      Alert.alert("Validation", "Please select a file to upload");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = new FormData();
      data.append("subject_id", String(subjectId));
      data.append("title", form.title);
      data.append("material_type", form.material_type);

      if (form.material_type === "link") {
        data.append("link_url", form.link_url);
      } else if (file) {
        data.append("file", {
          uri: file.uri,
          name: file.name,
          type: file.mimeType || "application/octet-stream",
        } as any);
      }

      await api.post("/materials", data, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      setModalVisible(false);
      setFile(null);
      setForm({ title: "", material_type: "file", link_url: "" });
      fetchData();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || "Failed to upload material";
      Alert.alert("Error", errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openMaterial = (m: any) => {
    const isPdf = m.material_type === "pdf" || /\.pdf($|\?)/i.test(m.file_url);
    const type = isPdf ? "pdf" : m.material_type;
    const params = {
      id: m.id,
      title: m.title,
      type,
      url: m.file_url,
    };

    const parentNavigation = navigation?.getParent?.();
    if (typeof parentNavigation?.navigate === "function") {
      parentNavigation.navigate("MaterialViewerNative", params);
      return;
    }

    if (typeof navigation?.push === "function") {
      navigation.push("MaterialViewerNative", params);
      return;
    }

    if (typeof navigation?.navigate === "function") {
      navigation.navigate("MaterialViewerNative", params);
      return;
    }

    Alert.alert("Navigation Error", "Unable to open material viewer screen.");
  };

  const formatDate = (value?: string) => {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  // --- UI Components ---
  const getMaterialIcon = (type: string) => {
    switch (type) {
      case "pdf": return <FileText color="white" size={22} />;
      case "video": return <Video color="white" size={22} />;
      case "link": return <LinkIcon color="white" size={22} />;
      default: return <File color="white" size={22} />;
    }
  };

  const renderMaterialItem = ({ item, index }: { item: any, index: number }) => {
    const isLast = index === sortedMaterials.length - 1;
    const iconColor = getMaterialColor(item.material_type);

    return (
      <Pressable 
        style={({ pressed }) => [styles.listRow, isLast && styles.noBorder, pressed && { backgroundColor: BRAND.border + "50" }]} 
        onPress={() => openMaterial(item)}
      >
        <View style={[styles.iconBox, { backgroundColor: iconColor }]}>
          {getMaterialIcon(item.material_type)}
        </View>
        <View style={styles.listRowContent}>
          <Text style={styles.listTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.listSubtitle}>
            {item.material_type.toUpperCase()} • {formatDate(item.created_at)}
          </Text>
        </View>
        <ChevronRight color={BRAND.textMuted} size={20} style={{ marginLeft: 10 }} />
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={BRAND.primary} />
      </View>
    );
  }

  if (!subjectId) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Invalid Subject ID</Text>
        <Pressable style={styles.backBtn} onPress={() => navigation?.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation?.goBack()} style={styles.backIcon}>
          <ArrowLeft color={BRAND.primaryDark} size={24} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {subject?.name || `Subject ${subjectId}`}
          </Text>
          <Text style={styles.headerSubtitle}>{materials.length} materials</Text>
        </View>
      </View>

      <FlatList
        data={sortedMaterials}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderMaterialItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={true}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <BookOpenText color={BRAND.border} size={56} strokeWidth={1.5} />
            <Text style={styles.emptyText}>No materials uploaded yet.</Text>
          </View>
        }
      />

      {/* Floating Action Button (FAB) for Doctor */}
      {canCreate && (
        <Pressable 
          style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.95 }] }]} 
          onPress={() => setModalVisible(true)}
        >
          <Plus color="white" size={26} />
        </Pressable>
      )}

      {/* Upload Material Modal */}
      <Modal visible={isModalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Material</Text>
              <Pressable onPress={() => setModalVisible(false)} style={{ padding: 4 }}>
                <X color={BRAND.textMuted} size={24} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
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
                    onPress={() => setForm({ ...form, material_type: type })}
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
                  <Pressable style={styles.filePickerBtn} onPress={handlePickFile}>
                    <UploadCloud color={file ? BRAND.primary : BRAND.textMuted} size={32} />
                    <Text style={[styles.filePickerText, file && { color: BRAND.primary, fontWeight: "600" }]}>
                      {file ? file.name : "Tap to select a file"}
                    </Text>
                  </Pressable>
                </>
              )}

              <Pressable 
                style={[styles.modalActionBtn, isSubmitting && { opacity: 0.7 }]} 
                onPress={submitMaterial}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    {form.material_type === "link" ? <LinkIcon color="white" size={20} /> : <UploadCloud color="white" size={20} />}
                    <Text style={styles.modalActionBtnText}>Save Material</Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  
  // Header
  header: { 
    flexDirection: "row", 
    alignItems: "center", 
    padding: 16, 
    backgroundColor: BRAND.surface, 
    borderBottomWidth: StyleSheet.hairlineWidth, 
    borderBottomColor: BRAND.border 
  },
  backIcon: { marginRight: 12, padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: BRAND.text },
  headerSubtitle: { fontSize: 13, color: BRAND.textMuted, marginTop: 2 },
  
  listContent: { paddingBottom: 100 }, // Space for FAB

  // Telegram Style Rows
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
  iconBox: { 
    width: 48, 
    height: 48, 
    borderRadius: 24, 
    alignItems: "center", 
    justifyContent: "center",
    marginRight: 14
  },
  listRowContent: { flex: 1, justifyContent: "center" },
  listTitle: { fontSize: 16, fontWeight: "600", color: BRAND.text, marginBottom: 4 },
  listSubtitle: { fontSize: 13, color: BRAND.textMuted },

  // Empty State
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 80 },
  emptyText: { color: BRAND.textMuted, marginTop: 16, fontSize: 16, fontWeight: "500" },
  errorText: { color: BRAND.textMuted, fontSize: 16, marginBottom: 16 },
  backBtn: { backgroundColor: BRAND.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  backBtnText: { color: "white", fontWeight: "bold" },

  // FAB
  fab: {
    position: "absolute",
    right: 16,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BRAND.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    width: "100%",
    maxHeight: "90%",
    backgroundColor: BRAND.surface,
    borderRadius: 16,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: BRAND.text },
  modalBody: { padding: 16 },
  
  inputLabel: { fontSize: 13, fontWeight: "600", color: BRAND.textMuted, marginBottom: 6, marginTop: 4 },
  input: { 
    backgroundColor: BRAND.background, 
    borderRadius: 10, 
    paddingHorizontal: 14, 
    paddingVertical: 12, 
    fontSize: 15, 
    color: BRAND.text, 
    marginBottom: 12,
  },
  
  typeSelector: { flexDirection: "row", gap: 8, marginBottom: 12 },
  typeBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10, backgroundColor: BRAND.background },
  typeBtnActive: { backgroundColor: BRAND.primary },
  typeBtnText: { fontSize: 13, fontWeight: "600", color: BRAND.textMuted },
  typeBtnTextActive: { color: "white" },

  filePickerBtn: { 
    backgroundColor: BRAND.background, 
    borderRadius: 12, 
    padding: 24, 
    alignItems: "center", 
    justifyContent: "center", 
    borderWidth: 1, 
    borderColor: BRAND.border, 
    borderStyle: "dashed", 
    marginBottom: 16, 
    gap: 8 
  },
  filePickerText: { fontSize: 14, color: BRAND.textMuted },

  modalActionBtn: { 
    backgroundColor: BRAND.primary, 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "center", 
    paddingVertical: 14, 
    borderRadius: 12, 
    marginBottom: 16,
    gap: 8 
  },
  modalActionBtnText: { color: "white", fontSize: 16, fontWeight: "600" },
});