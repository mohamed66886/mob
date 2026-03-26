import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Pressable,
  TextInput,
  FlatList,
  Alert,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  AppState,
  AppStateStatus,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../lib/api";
import { User } from "../types/auth";
import {
  CalendarClock,
  FileText,
  Plus,
  UploadCloud,
  X,
  CheckCircle2,
  ClipboardList,
  ChevronRight,
} from "lucide-react-native";

// Telegram-like color palette
const BRAND = {
  primary: "#3390ec", // Telegram Blue
  primaryDark: "#2b7cb9",
  surface: "#FFFFFF",
  background: "#f1f2f6", // Telegram background
  text: "#000000",
  textMuted: "#707579",
  border: "#E1E9F2",
  success: "#34c759", // iOS/Telegram green
  warning: "#f59e0b",
};

// Helper to generate consistent colors for subjects
const getSubjectColor = (name: string) => {
  const colors = ['#e17076', '#faa774', '#a695e7', '#7bc862', '#6ec9cb', '#65aadd', '#ee7aae'];
  const charCode = (name || "T").charCodeAt(0) || 0;
  return colors[charCode % colors.length];
};

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export default function TasksNativeScreen({
  token,
  user,
}: {
  token: string;
  user: User;
}) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals States
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isSubmitModalVisible, setSubmitModalVisible] = useState(false);

  // Create Task States
  const [creatingTask, setCreatingTask] = useState(false);
  const [createForm, setCreateForm] = useState({
    subject_id: "",
    title: "",
    description: "",
    due_date: "", // e.g., '2026-04-10T23:59'
    max_grade: "100",
  });

  // Submit Task States
  const [uploadTaskId, setUploadTaskId] = useState<number | null>(null);
  const [uploadFile, setUploadFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadingSubmission, setUploadingSubmission] = useState(false);

  const canCreate = user?.role === "doctor";
  const canSubmit = user?.role === "student";
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetchingRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const selectedUploadTask = useMemo(
    () => tasks.find((t) => t.id === uploadTaskId) || null,
    [tasks, uploadTaskId]
  );

  const fetchData = useCallback(async (options?: { silent?: boolean; showError?: boolean }) => {
    const silent = Boolean(options?.silent);
    const showError = options?.showError ?? !silent;

    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (!silent && tasks.length === 0) {
      setLoading(true);
    }

    try {
      const [tasksRes, subjectsRes] = await Promise.all([
        api.get("/tasks", authHeaders(token)),
        api.get("/subjects", authHeaders(token)),
      ]);
      setTasks(tasksRes.data || []);
      setSubjects(subjectsRes.data || []);
    } catch {
      if (showError) {
        Alert.alert("Error", "Failed to load tasks data");
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [tasks.length, token]);

  useEffect(() => {
    fetchData({ showError: true });
  }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      // Refresh immediately when screen becomes active.
      fetchData({ silent: true, showError: false });

      if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = setInterval(() => {
        fetchData({ silent: true, showError: false });
      }, 5000);

      return () => {
        if (autoRefreshTimerRef.current) {
          clearInterval(autoRefreshTimerRef.current);
          autoRefreshTimerRef.current = null;
        }
      };
    }, [fetchData]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      appStateRef.current = nextState;
      if (wasBackground && nextState === "active") {
        fetchData({ silent: true, showError: false });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [fetchData]);

  // --- Actions ---
  const handleCreateTask = async () => {
    if (!createForm.subject_id || !createForm.title || !createForm.due_date) {
      Alert.alert("Validation", "Please fill in all required fields");
      return;
    }

    setCreatingTask(true);
    try {
      await api.post(
        "/tasks",
        {
          ...createForm,
          subject_id: Number(createForm.subject_id),
          max_grade: Number(createForm.max_grade || 100),
        },
        authHeaders(token)
      );
      setCreateModalVisible(false);
      setCreateForm({ subject_id: "", title: "", description: "", due_date: "", max_grade: "100" });
      fetchData({ silent: true, showError: false });
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.error || "Failed to create task");
    } finally {
      setCreatingTask(false);
    }
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (!result.canceled && result.assets.length > 0) {
        setUploadFile(result.assets[0]);
      }
    } catch (err) {
      Alert.alert("Error", "Failed to pick file");
    }
  };

  const openSubmitModal = (taskId: number) => {
    setUploadTaskId(taskId);
    setUploadFile(null);
    setUploadNotes("");
    setSubmitModalVisible(true);
  };

  const handleUploadSubmission = async () => {
    if (!uploadTaskId || !uploadFile) {
      Alert.alert("Validation", "Please choose a submission file");
      return;
    }

    setUploadingSubmission(true);
    try {
      const formData = new FormData();
      formData.append("notes", uploadNotes);
      formData.append("file", {
        uri: uploadFile.uri,
        name: uploadFile.name,
        type: uploadFile.mimeType || "application/octet-stream",
      } as any);

      await api.post(`/tasks/${uploadTaskId}/submit`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      setSubmitModalVisible(false);
      setUploadTaskId(null);
      fetchData({ silent: true, showError: false });
    } catch (err: any) {
      const msg = err.response?.data?.error;
      if (msg === "Task already submitted.") {
        Alert.alert("Already Submitted", "This task has already been submitted");
        setSubmitModalVisible(false);
        fetchData({ silent: true, showError: false });
      } else {
        Alert.alert("Error", msg || "Failed to upload submission");
      }
    } finally {
      setUploadingSubmission(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // --- Renders ---
  const renderTask = ({ item }: { item: any }) => {
    const isSubmitted = !!item.my_submission_id;
    const subjectColor = getSubjectColor(item.subject_name || "");

    return (
      <Pressable
        style={({ pressed }) => [
          styles.taskRow,
          pressed && { backgroundColor: BRAND.border + "80" },
        ]}
        onPress={() => (canSubmit && !isSubmitted ? openSubmitModal(item.id) : null)}
      >
        <View style={[styles.taskIconBox, { backgroundColor: subjectColor }]}>
          <FileText color="white" size={24} />
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
              <CheckCircle2 color={BRAND.success} size={24} />
            ) : (
              <View style={styles.uploadBadge}>
                <UploadCloud color={BRAND.primary} size={16} />
                <Text style={styles.uploadBadgeText}>Submit</Text>
              </View>
            )
          ) : (
            <ChevronRight color={BRAND.textMuted} size={20} />
          )}
        </View>
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

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Tasks</Text>
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderTask}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={true}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <ClipboardList size={56} color={BRAND.border} strokeWidth={1.5} />
            <Text style={styles.emptyText}>No tasks assigned yet.</Text>
          </View>
        }
      />

      {/* FAB for Doctors */}
      {canCreate && (
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.95 }] }]}
          onPress={() => setCreateModalVisible(true)}
        >
          <Plus color="white" size={26} />
        </Pressable>
      )}

      {/* CREATE TASK MODAL (Doctor) */}
      <Modal visible={isCreateModalVisible} transparent animationType="fade" onRequestClose={() => setCreateModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Task</Text>
              <Pressable onPress={() => setCreateModalVisible(false)} style={{ padding: 4 }}>
                <X color={BRAND.textMuted} size={24} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Subject</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {subjects.map((s) => {
                  const isActive = createForm.subject_id === String(s.id);
                  return (
                    <Pressable
                      key={s.id}
                      style={[styles.chip, isActive && styles.chipActive]}
                      onPress={() => setCreateForm({ ...createForm, subject_id: String(s.id) })}
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{s.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.inputLabel}>Title</Text>
              <TextInput
                style={styles.input}
                placeholder="E.g., Midterm Assignment"
                value={createForm.title}
                onChangeText={(t) => setCreateForm({ ...createForm, title: t })}
                placeholderTextColor={BRAND.textMuted}
              />

              <Text style={styles.inputLabel}>Due Date</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD HH:MM"
                value={createForm.due_date}
                onChangeText={(t) => setCreateForm({ ...createForm, due_date: t })}
                placeholderTextColor={BRAND.textMuted}
              />

              <Text style={styles.inputLabel}>Max Grade</Text>
              <TextInput
                style={styles.input}
                placeholder="100"
                keyboardType="numeric"
                value={createForm.max_grade}
                onChangeText={(t) => setCreateForm({ ...createForm, max_grade: t })}
                placeholderTextColor={BRAND.textMuted}
              />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
                placeholder="Task details..."
                multiline
                value={createForm.description}
                onChangeText={(t) => setCreateForm({ ...createForm, description: t })}
                placeholderTextColor={BRAND.textMuted}
              />

              <Pressable
                style={[styles.modalActionBtn, creatingTask && { opacity: 0.7 }]}
                onPress={handleCreateTask}
                disabled={creatingTask}
              >
                {creatingTask ? <ActivityIndicator color="white" /> : <Text style={styles.modalActionBtnText}>Create Task</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* SUBMIT TASK MODAL (Student) */}
      <Modal visible={isSubmitModalVisible} transparent animationType="fade" onRequestClose={() => setSubmitModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalSubtitle}>Submit Assignment</Text>
                <Text style={styles.modalTitle} numberOfLines={1}>{selectedUploadTask?.title}</Text>
              </View>
              <Pressable onPress={() => setSubmitModalVisible(false)} style={{ padding: 4 }}>
                <X color={BRAND.textMuted} size={24} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Pressable style={styles.filePicker} onPress={handlePickFile}>
                <UploadCloud color={uploadFile ? BRAND.primary : BRAND.textMuted} size={36} />
                <Text style={[styles.filePickerText, uploadFile && { color: BRAND.primary, fontWeight: "600" }]}>
                  {uploadFile ? uploadFile.name : "Tap to choose file (PDF, ZIP)"}
                </Text>
              </Pressable>

              <Text style={styles.inputLabel}>Notes (Optional)</Text>
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
                placeholder="Add comments for the instructor..."
                multiline
                value={uploadNotes}
                onChangeText={setUploadNotes}
                placeholderTextColor={BRAND.textMuted}
              />

              <Pressable
                style={[styles.modalActionBtn, (!uploadFile || uploadingSubmission) && { opacity: 0.6 }]}
                onPress={handleUploadSubmission}
                disabled={!uploadFile || uploadingSubmission}
              >
                {uploadingSubmission ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <UploadCloud color="white" size={20} />
                    <Text style={styles.modalActionBtnText}>Upload Submission</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BRAND.surface,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) : 0,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  headerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: BRAND.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
  },
  headerTitle: { fontSize: 22, fontWeight: "700", color: BRAND.text },

  listContent: { paddingBottom: 100 }, // space for FAB

  // Telegram Style Row
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: BRAND.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
  },
  taskIconBox: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  taskContent: {
    flex: 1,
    justifyContent: "center",
  },
  taskTitle: { fontSize: 16, fontWeight: "600", color: BRAND.text, marginBottom: 4 },
  taskSubtitle: { fontSize: 13, color: BRAND.textMuted },
  taskAction: {
    marginLeft: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  uploadBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BRAND.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  uploadBadgeText: { color: BRAND.primary, fontSize: 12, fontWeight: "600" },

  emptyState: { paddingVertical: 80, alignItems: "center", justifyContent: "center" },
  emptyText: { color: BRAND.textMuted, marginTop: 16, fontSize: 16, fontWeight: "500" },

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

  // Modals
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
  modalSubtitle: { fontSize: 12, color: BRAND.textMuted, marginBottom: 2 },
  modalBody: { padding: 16 },
  
  inputLabel: { fontSize: 13, fontWeight: "600", color: BRAND.textMuted, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: BRAND.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: BRAND.text,
  },

  chipScroll: { flexDirection: "row", marginBottom: 4 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: BRAND.background,
    marginRight: 8,
  },
  chipActive: { backgroundColor: BRAND.primary },
  chipText: { color: BRAND.textMuted, fontSize: 14, fontWeight: "500" },
  chipTextActive: { color: "white", fontWeight: "600" },

  filePicker: {
    backgroundColor: BRAND.background,
    borderRadius: 12,
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: BRAND.border,
    borderStyle: "dashed",
    marginTop: 8,
    marginBottom: 8,
    gap: 12,
  },
  filePickerText: { fontSize: 14, color: BRAND.textMuted, textAlign: "center" },

  modalActionBtn: {
    backgroundColor: BRAND.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
    marginBottom: 16,
    gap: 8,
  },
  modalActionBtnText: { color: "white", fontSize: 16, fontWeight: "600" },
});