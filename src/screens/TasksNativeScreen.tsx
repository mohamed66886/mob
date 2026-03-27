import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  TextInput,
  Alert,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  AppState,
  AppStateStatus,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect } from "@react-navigation/native";
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
  FileText,
  Plus,
  UploadCloud,
  X,
  CheckCircle2,
  ClipboardList,
  ChevronRight,
  Calendar,
  Award,
  AlignLeft
} from "lucide-react-native";

// Telegram/iOS Premium Palette
const BRAND = {
  primary: "#3390ec",
  primaryDark: "#2b7cb9",
  surface: "#FFFFFF",
  background: "#f1f2f6", 
  text: "#1c1c1e",
  textMuted: "#8e8e93",
  border: "#E5E5EA",
  success: "#34c759", 
  warning: "#f59e0b",
  danger: "#FF3B30",
};

const getSubjectColor = (name: string) => {
  const colors = ['#e17076', '#faa774', '#a695e7', '#7bc862', '#6ec9cb', '#65aadd', '#ee7aae'];
  const charCode = (name || "T").charCodeAt(0) || 0;
  return colors[charCode % colors.length];
};

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// --- Performance: Skeleton Loader ---
const SkeletonTaskRow = () => {
  const opacity = useSharedValue(0.5);
  useEffect(() => { opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true); }, []);
  return (
    <Animated.View style={[styles.taskRow, { opacity }]}>
      <View style={[styles.taskIconBox, { backgroundColor: BRAND.border }]} />
      <View style={styles.taskContent}>
        <View style={{ width: "60%", height: 16, backgroundColor: BRAND.border, borderRadius: 4, marginBottom: 8 }} />
        <View style={{ width: "40%", height: 12, backgroundColor: BRAND.border, borderRadius: 4 }} />
      </View>
    </Animated.View>
  );
};

// --- Performance: Memoized Animated Task Item ---
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const TaskItem = React.memo(({ item, index, canSubmit, onPress }: any) => {
  const scale = useSharedValue(1);
  const isSubmitted = !!item.my_submission_id;

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).springify().damping(14)}>
      <AnimatedPressable
        onPressIn={() => (scale.value = withSpring(0.97))}
        onPressOut={() => (scale.value = withSpring(1))}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (canSubmit && !isSubmitted) onPress(item.id);
        }}
        style={[{ transform: [{ scale }] }, styles.taskRow]}
      >
        <View style={[styles.taskIconBox, { backgroundColor: getSubjectColor(item.subject_name || "") }]}>
          <FileText color="white" size={24} strokeWidth={2.5} />
        </View>

        <View style={styles.taskContent}>
          <Text style={styles.taskTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.taskSubtitle} numberOfLines={1}>
            {item.subject_name || "Unknown"} • Due: {formatDateTime(item.due_date)}
          </Text>
        </View>

        <View style={styles.taskAction}>
          {canSubmit ? (
            isSubmitted ? (
              <CheckCircle2 color={BRAND.success} size={26} strokeWidth={2.5} />
            ) : (
              <View style={styles.uploadBadge}>
                <UploadCloud color={BRAND.primary} size={16} strokeWidth={2.5} />
                <Text style={styles.uploadBadgeText}>Submit</Text>
              </View>
            )
          ) : (
            <ChevronRight color={BRAND.border} size={24} strokeWidth={2.5} />
          )}
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
});

export default function TasksNativeScreen({ token, user }: { token: string; user: User }) {
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isSubmitModalVisible, setSubmitModalVisible] = useState(false);

  const [creatingTask, setCreatingTask] = useState(false);
  const [createForm, setCreateForm] = useState({ subject_id: "", title: "", description: "", due_date: "", max_grade: "100" });

  const [uploadTaskId, setUploadTaskId] = useState<number | null>(null);
  const [uploadFile, setUploadFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadingSubmission, setUploadingSubmission] = useState(false);

  const canCreate = user?.role === "doctor";
  const canSubmit = user?.role === "student";
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetchingRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const selectedUploadTask = useMemo(() => tasks.find((t) => t.id === uploadTaskId) || null, [tasks, uploadTaskId]);

  const fetchData = useCallback(async (options?: { silent?: boolean; showError?: boolean }) => {
    const silent = Boolean(options?.silent);
    const showError = options?.showError ?? !silent;

    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (!silent && tasks.length === 0) setLoading(true);

    try {
      const [tasksRes, subjectsRes] = await Promise.all([
        api.get("/tasks", authHeaders(token)),
        api.get("/subjects", authHeaders(token)),
      ]);
      setTasks(tasksRes.data || []);
      setSubjects(subjectsRes.data || []);
    } catch {
      if (showError) Alert.alert("Error", "Failed to load tasks data");
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [tasks.length, token]);

  useEffect(() => { fetchData({ showError: true }); }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData({ silent: true, showError: false });
      if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = setInterval(() => { fetchData({ silent: true, showError: false }); }, 5000);
      return () => {
        if (autoRefreshTimerRef.current) { clearInterval(autoRefreshTimerRef.current); autoRefreshTimerRef.current = null; }
      };
    }, [fetchData])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      appStateRef.current = nextState;
      if (wasBackground && nextState === "active") fetchData({ silent: true, showError: false });
    });
    return () => { subscription.remove(); };
  }, [fetchData]);

  const handleCreateTask = async () => {
    if (!createForm.subject_id || !createForm.title || !createForm.due_date) return Alert.alert("Validation", "Please fill in all required fields");
    setCreatingTask(true);
    try {
      await api.post("/tasks", { ...createForm, subject_id: Number(createForm.subject_id), max_grade: Number(createForm.max_grade || 100) }, authHeaders(token));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateModalVisible(false);
      setCreateForm({ subject_id: "", title: "", description: "", due_date: "", max_grade: "100" });
      fetchData({ silent: true, showError: false });
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", err.response?.data?.error || "Failed to create task");
    } finally { setCreatingTask(false); }
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (!result.canceled && result.assets.length > 0) {
        setUploadFile(result.assets[0]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) { Alert.alert("Error", "Failed to pick file"); }
  };

  const openSubmitModal = (taskId: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setUploadTaskId(taskId); setUploadFile(null); setUploadNotes(""); setSubmitModalVisible(true);
  };

  const handleUploadSubmission = async () => {
    if (!uploadTaskId || !uploadFile) return Alert.alert("Validation", "Please choose a submission file");
    setUploadingSubmission(true);
    try {
      const formData = new FormData();
      formData.append("notes", uploadNotes);
      formData.append("file", { uri: uploadFile.uri, name: uploadFile.name, type: uploadFile.mimeType || "application/octet-stream" } as any);

      await api.post(`/tasks/${uploadTaskId}/submit`, formData, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitModalVisible(false); setUploadTaskId(null); fetchData({ silent: true, showError: false });
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = err.response?.data?.error;
      if (msg === "Task already submitted.") {
        Alert.alert("Already Submitted", "This task has already been submitted");
        setSubmitModalVisible(false); fetchData({ silent: true, showError: false });
      } else { Alert.alert("Error", msg || "Failed to upload submission"); }
    } finally { setUploadingSubmission(false); }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      
      {/* Modern Header */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.headerTitle}>Tasks & Assignments</Text>
      </View>

      <Animated.FlatList
        data={loading ? Array.from({ length: 5 }) : tasks}
        keyExtractor={(_, idx) => loading ? `skel-${idx}` : tasks[idx].id.toString()}
        renderItem={loading ? () => <SkeletonTaskRow /> : ({ item, index }) => <TaskItem item={item} index={index} canSubmit={canSubmit} onPress={openSubmitModal} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? null : (
            <Animated.View entering={FadeIn} style={styles.emptyState}>
              <ClipboardList size={64} color={BRAND.border} strokeWidth={1} />
              <Text style={styles.emptyText}>No tasks assigned yet.</Text>
            </Animated.View>
          )
        }
      />

      {/* FAB with Animation */}
      {canCreate && (
        <AnimatedPressable
          style={({ pressed }) => [styles.fab, { bottom: insets.bottom + 20 }, pressed && { transform: [{ scale: 0.92 }] }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setCreateModalVisible(true); }}
        >
          <Plus color="white" size={28} strokeWidth={2.5} />
        </AnimatedPressable>
      )}

      {/* CREATE TASK MODAL (Bottom Sheet Style) */}
      <Modal visible={isCreateModalVisible} transparent animationType="slide" onRequestClose={() => setCreateModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.modalBackdrop} onPress={() => setCreateModalVisible(false)} />
          <View style={[styles.modalContent, { paddingBottom: insets.bottom || 20, maxHeight: '85%' }]}>
            <View style={styles.modalHandleContainer}><View style={styles.modalHandle} /></View>
            
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Task</Text>
              <Pressable onPress={() => setCreateModalVisible(false)} style={styles.closeBtn}>
                <X color={BRAND.textMuted} size={22} strokeWidth={2.5} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Subject</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {subjects.map((s) => {
                  const isActive = createForm.subject_id === String(s.id);
                  return (
                    <Pressable
                      key={s.id}
                      style={[styles.chip, isActive && styles.chipActive]}
                      onPress={() => { Haptics.selectionAsync(); setCreateForm({ ...createForm, subject_id: String(s.id) }); }}
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{s.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.inputLabel}>Title</Text>
              <TextInput style={styles.input} placeholder="E.g., Midterm Assignment" value={createForm.title} onChangeText={(t) => setCreateForm({ ...createForm, title: t })} placeholderTextColor={BRAND.textMuted} />

              <View style={styles.rowInputs}>
                <View style={styles.flex1}>
                  <Text style={styles.inputLabel}>Due Date</Text>
                  <View style={styles.inputWithIcon}>
                    <Calendar color={BRAND.textMuted} size={18} />
                    <TextInput style={styles.inputTransparent} placeholder="YYYY-MM-DD HH:MM" value={createForm.due_date} onChangeText={(t) => setCreateForm({ ...createForm, due_date: t })} placeholderTextColor={BRAND.textMuted} />
                  </View>
                </View>
                <View style={{ width: 16 }} />
                <View style={styles.flex1}>
                  <Text style={styles.inputLabel}>Max Grade</Text>
                  <View style={styles.inputWithIcon}>
                    <Award color={BRAND.textMuted} size={18} />
                    <TextInput style={styles.inputTransparent} placeholder="100" keyboardType="numeric" value={createForm.max_grade} onChangeText={(t) => setCreateForm({ ...createForm, max_grade: t })} placeholderTextColor={BRAND.textMuted} />
                  </View>
                </View>
              </View>

              <Text style={styles.inputLabel}>Description</Text>
              <View style={[styles.inputWithIcon, { alignItems: 'flex-start', paddingTop: 12 }]}>
                 <AlignLeft color={BRAND.textMuted} size={18} style={{marginTop: 2}} />
                 <TextInput style={[styles.inputTransparent, { minHeight: 80, textAlignVertical: "top" }]} placeholder="Task details..." multiline value={createForm.description} onChangeText={(t) => setCreateForm({ ...createForm, description: t })} placeholderTextColor={BRAND.textMuted} />
              </View>

              <Pressable style={({ pressed }) => [styles.modalActionBtn, (creatingTask || pressed) && { opacity: 0.8 }]} onPress={handleCreateTask} disabled={creatingTask}>
                {creatingTask ? <ActivityIndicator color="white" /> : <Text style={styles.modalActionBtnText}>Create Task</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* SUBMIT TASK MODAL (Bottom Sheet Style) */}
      <Modal visible={isSubmitModalVisible} transparent animationType="slide" onRequestClose={() => setSubmitModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.modalBackdrop} onPress={() => setSubmitModalVisible(false)} />
          <View style={[styles.modalContent, { paddingBottom: insets.bottom || 20 }]}>
            <View style={styles.modalHandleContainer}><View style={styles.modalHandle} /></View>
            
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 16 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>{selectedUploadTask?.title || "Submit Assignment"}</Text>
                <Text style={styles.modalSubtitle}>Upload your file to complete the task.</Text>
              </View>
              <Pressable onPress={() => setSubmitModalVisible(false)} style={styles.closeBtn}>
                <X color={BRAND.textMuted} size={22} strokeWidth={2.5} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Pressable style={[styles.filePicker, uploadFile && styles.filePickerActive]} onPress={handlePickFile}>
                <UploadCloud color={uploadFile ? BRAND.primary : BRAND.textMuted} size={40} strokeWidth={1.5} />
                <Text style={[styles.filePickerText, uploadFile && { color: BRAND.primary, fontWeight: "700" }]}>
                  {uploadFile ? uploadFile.name : "Tap to choose file (PDF, ZIP, Image)"}
                </Text>
              </Pressable>

              <Text style={styles.inputLabel}>Notes to Instructor (Optional)</Text>
              <TextInput style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]} placeholder="Add any comments here..." multiline value={uploadNotes} onChangeText={setUploadNotes} placeholderTextColor={BRAND.textMuted} />

              <Pressable style={({ pressed }) => [styles.modalActionBtn, (!uploadFile || uploadingSubmission || pressed) && { opacity: 0.8 }]} onPress={handleUploadSubmission} disabled={!uploadFile || uploadingSubmission}>
                {uploadingSubmission ? <ActivityIndicator color="white" /> : (
                  <>
                    <UploadCloud color="white" size={20} strokeWidth={2.5} />
                    <Text style={styles.modalActionBtnText}>Upload Submission</Text>
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
  headerContainer: { paddingHorizontal: 20, paddingBottom: 16, backgroundColor: BRAND.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.border, zIndex: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  headerTitle: { fontSize: 28, fontWeight: "800", color: BRAND.text, letterSpacing: -0.5 },

  listContent: { paddingTop: 16, paddingBottom: 120, paddingHorizontal: 16 },

  taskRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, backgroundColor: BRAND.surface, borderRadius: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  taskIconBox: { width: 52, height: 52, borderRadius: 16, justifyContent: "center", alignItems: "center", marginRight: 14 },
  taskContent: { flex: 1, justifyContent: "center" },
  taskTitle: { fontSize: 17, fontWeight: "700", color: BRAND.text, marginBottom: 4, letterSpacing: -0.3 },
  taskSubtitle: { fontSize: 13, color: BRAND.textMuted, fontWeight: "500" },
  taskAction: { marginLeft: 12, justifyContent: "center", alignItems: "center" },
  
  uploadBadge: { flexDirection: "row", alignItems: "center", backgroundColor: BRAND.primary + "15", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, gap: 6 },
  uploadBadgeText: { color: BRAND.primary, fontSize: 13, fontWeight: "700" },

  emptyState: { paddingVertical: 100, alignItems: "center", justifyContent: "center" },
  emptyText: { color: BRAND.text, marginTop: 16, fontSize: 18, fontWeight: "700" },

  fab: { position: "absolute", right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: BRAND.primary, justifyContent: "center", alignItems: "center", shadowColor: BRAND.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },

  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  modalContent: { backgroundColor: BRAND.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 10 },
  modalHandleContainer: { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
  modalHandle: { width: 40, height: 5, backgroundColor: BRAND.border, borderRadius: 3 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  modalTitle: { fontSize: 22, fontWeight: "800", color: BRAND.text },
  modalSubtitle: { fontSize: 14, color: BRAND.textMuted, marginTop: 2, fontWeight: "500" },
  closeBtn: { backgroundColor: BRAND.background, padding: 6, borderRadius: 20 },
  
  modalBody: { paddingHorizontal: 20 },
  
  inputLabel: { fontSize: 14, fontWeight: "700", color: BRAND.text, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: BRAND.background, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: BRAND.text, borderWidth: 1, borderColor: BRAND.border },
  
  rowInputs: { flexDirection: 'row', alignItems: 'center' },
  flex1: { flex: 1 },
  inputWithIcon: { flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND.background, borderRadius: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: BRAND.border },
  inputTransparent: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 16, color: BRAND.text },

  chipScroll: { flexDirection: "row", marginBottom: 4 },
  chip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: BRAND.background, marginRight: 10, borderWidth: 1, borderColor: BRAND.border },
  chipActive: { backgroundColor: BRAND.primary, borderColor: BRAND.primary },
  chipText: { color: BRAND.textMuted, fontSize: 14, fontWeight: "600" },
  chipTextActive: { color: "white" },

  filePicker: { backgroundColor: BRAND.background, borderRadius: 16, padding: 32, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: BRAND.border, borderStyle: "dashed", marginTop: 12, marginBottom: 8, gap: 12 },
  filePickerActive: { borderColor: BRAND.primary, backgroundColor: BRAND.primary + "10" },
  filePickerText: { fontSize: 15, color: BRAND.textMuted, textAlign: "center", fontWeight: "500" },

  modalActionBtn: { backgroundColor: BRAND.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 16, marginTop: 24, marginBottom: 16, gap: 8 },
  modalActionBtnText: { color: "white", fontSize: 17, fontWeight: "700" },
});