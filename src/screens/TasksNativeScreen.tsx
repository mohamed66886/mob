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
import { WebView } from "react-native-webview";
import RNFetchBlob from "rn-fetch-blob";
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

import { api, resolveMediaUrl } from "../lib/api";
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

// Server dates may arrive as:
// - ISO strings with timezone (e.g. 2026-04-01T10:00:00.000Z)
// - MySQL-ish strings without timezone (e.g. 2026-04-01 10:00:00)
// iOS/Android can parse the latter inconsistently, so normalize it.
function parseServerDateTime(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  const normalized = String(value).trim();
  if (!normalized) return null;

  let isoLike = normalized;
  if (!isoLike.includes("T") && isoLike.includes(" ")) {
    isoLike = isoLike.replace(" ", "T");
  }

  // Some endpoints may accidentally serialize MySQL DATETIME as ISO UTC (trailing 'Z').
  // In this app, task windows are intended to be Egypt-local times, so treat that as local.
  // (Keep explicit numeric offsets like +02:00 if present.)
  if (/Z$/i.test(isoLike) && !/[+\-]\d{2}:?\d{2}$/i.test(isoLike)) {
    isoLike = isoLike.replace(/Z$/i, "");
  }

  // Important: when the server doesn't include timezone info (common with MySQL DATETIME),
  // we treat the value as *local time* (do NOT append "Z"), to avoid hour shifts.
  const dt = new Date(isoLike);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

function getFileExtensionFromUrl(url: string) {
  const clean = String(url || "").split("?")[0];
  const idx = clean.lastIndexOf(".");
  if (idx < 0) return "";
  return clean.slice(idx + 1).trim().toLowerCase();
}

function getMimeByExtension(ext: string) {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    txt: "text/plain",
    html: "text/html",
    htm: "text/html",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip",
    rar: "application/vnd.rar",
    csv: "text/csv",
  };
  return map[String(ext || "").toLowerCase()] || "application/octet-stream";
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
const TaskItem = React.memo(({ item, index, canSubmit, onOpenDetails, onOpenSubmit }: any) => {
  const scale = useSharedValue(1);
  const isSubmitted = !!item.my_submission_id;

  const getSubmitWindow = () => {
    const now = Date.now();
    const startMs = item?.start_date ? (parseServerDateTime(item.start_date)?.getTime() ?? null) : null;
    const dueMs = parseServerDateTime(item.due_date)?.getTime() ?? NaN;

    if (!Number.isFinite(dueMs)) {
      return { canSubmitNow: false, reason: "Invalid deadline" as const };
    }

    if (startMs && Number.isFinite(startMs) && now < startMs) {
      return { canSubmitNow: false, reason: "Submission has not started yet" as const };
    }

    if (now > dueMs) {
      return { canSubmitNow: false, reason: "Deadline has passed" as const };
    }

    return { canSubmitNow: true, reason: null };
  };

  const windowStatus = getSubmitWindow();
  const canOpenSubmit = canSubmit && !isSubmitted && windowStatus.canSubmitNow;

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).springify().damping(14)}>
      <Animated.View style={[{ transform: [{ scale }] }, styles.taskRow]}>
        <Pressable
          onPressIn={() => (scale.value = withSpring(0.97))}
          onPressOut={() => (scale.value = withSpring(1))}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onOpenDetails(item.id);
          }}
          style={styles.taskMain}
        >
          <View style={[styles.taskIconBox, { backgroundColor: getSubjectColor(item.subject_name || "") }]}>
            <FileText color="white" size={24} strokeWidth={2.5} />
          </View>

          <View style={styles.taskContent}>
            <Text style={styles.taskTitle} numberOfLines={1}>{item.title}</Text>
          </View>
        </Pressable>

        <View style={styles.taskAction}>
          {canSubmit ? (
            isSubmitted ? (
              <View style={[styles.uploadBadge, { backgroundColor: BRAND.success + "15" }]}>
                <CheckCircle2 color={BRAND.success} size={16} strokeWidth={2.5} />
                <Text style={[styles.uploadBadgeText, { color: BRAND.success }]}>Submitted</Text>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (canOpenSubmit) onOpenSubmit(item.id);
                  else Alert.alert("Submission closed", windowStatus.reason || "Submission is not allowed right now");
                }}
                style={({ pressed }) => [
                  styles.uploadBadge,
                  !windowStatus.canSubmitNow && { backgroundColor: BRAND.border },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <UploadCloud color={windowStatus.canSubmitNow ? BRAND.primary : BRAND.textMuted} size={16} strokeWidth={2.5} />
                <Text style={[styles.uploadBadgeText, !windowStatus.canSubmitNow && { color: BRAND.textMuted }]}>Submit</Text>
              </Pressable>
            )
          ) : (
            <ChevronRight color={BRAND.border} size={24} strokeWidth={2.5} />
          )}
        </View>
      </Animated.View>
    </Animated.View>
  );
});

export default function TasksNativeScreen({ token, user }: { token: string; user: User }) {
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [isFileViewerVisible, setFileViewerVisible] = useState(false);
  const [fileViewerUrl, setFileViewerUrl] = useState<string | null>(null);
  const [fileViewerLoading, setFileViewerLoading] = useState(false);

  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isSubmitModalVisible, setSubmitModalVisible] = useState(false);
  const [isDetailsModalVisible, setDetailsModalVisible] = useState(false);

  const [creatingTask, setCreatingTask] = useState(false);
  const [createForm, setCreateForm] = useState({ subject_id: "", title: "", description: "", due_date: "", max_grade: "100" });

  const [uploadTaskId, setUploadTaskId] = useState<number | null>(null);
  const [uploadFile, setUploadFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadingSubmission, setUploadingSubmission] = useState(false);

  const [detailsTaskId, setDetailsTaskId] = useState<number | null>(null);

  const canCreate = user?.role === "doctor";
  const canSubmit = user?.role === "student";
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetchingRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const selectedUploadTask = useMemo(() => tasks.find((t) => t.id === uploadTaskId) || null, [tasks, uploadTaskId]);
  const selectedDetailsTask = useMemo(() => tasks.find((t) => t.id === detailsTaskId) || null, [tasks, detailsTaskId]);

  const closeFileViewer = useCallback(() => {
    setFileViewerVisible(false);
    setFileViewerUrl(null);
  }, []);

  const openFileExternally = useCallback(async (url: string) => {
    try {
      const guessedExt = getFileExtensionFromUrl(url) || "bin";
      const mimeByExt = getMimeByExtension(guessedExt);
      const targetPath = `${RNFetchBlob.fs.dirs.DocumentDir}/task_${Date.now()}.${guessedExt}`;

      const response = await RNFetchBlob.config({
        fileCache: true,
        path: targetPath,
      }).fetch("GET", url, {
        Authorization: `Bearer ${token}`,
      });

      const info = response.info();
      if (info.status >= 400) {
        Alert.alert("Error", "Could not download the task file");
        return;
      }

      const downloadedPath = response.path();
      const headerMime =
        info?.headers?.["Content-Type"] ||
        info?.headers?.["content-type"] ||
        mimeByExt;

      if (Platform.OS === "android") {
        await RNFetchBlob.android.actionViewIntent(downloadedPath, headerMime);
        return;
      }

      await RNFetchBlob.ios.openDocument(downloadedPath);
    } catch {
      Alert.alert("Error", "Failed to open file");
    }
  }, [token]);

  const openTaskAttachment = useCallback(async (task: any) => {
    const url = resolveMediaUrl(task?.attachment_url);
    if (!url) {
      Alert.alert("No file", "This task has no attachment");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Reliable strategy: always download first with auth header, then open by the OS.
    await openFileExternally(url);
  }, [openFileExternally]);

  const getSubmitWindow = useCallback((task: any) => {
    const now = Date.now();
    const startMs = task?.start_date ? (parseServerDateTime(task.start_date)?.getTime() ?? null) : null;
    const dueMs = parseServerDateTime(task?.due_date)?.getTime() ?? NaN;

    if (!Number.isFinite(dueMs)) return { canSubmitNow: false, reason: "Invalid deadline" };
    if (startMs && Number.isFinite(startMs) && now < startMs) return { canSubmitNow: false, reason: "Submission has not started yet" };
    if (now > dueMs) return { canSubmitNow: false, reason: "Deadline has passed" };
    return { canSubmitNow: true, reason: null };
  }, []);

  const detailsWindowStatus = useMemo(() => {
    if (!selectedDetailsTask) return { canSubmitNow: false, reason: null as string | null };
    return getSubmitWindow(selectedDetailsTask);
  }, [getSubmitWindow, selectedDetailsTask]);

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
    const task = tasks.find((t) => t.id === taskId);
    const windowStatus = getSubmitWindow(task);
    if (!windowStatus.canSubmitNow) {
      Alert.alert("Submission closed", windowStatus.reason || "Submission is not allowed right now");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setUploadTaskId(taskId); setUploadFile(null); setUploadNotes(""); setSubmitModalVisible(true);
  };

  const openDetailsModal = (taskId: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDetailsTaskId(taskId);
    setDetailsModalVisible(true);
  };

  const formatDateTime = (dateString?: string | null) => {
    if (!dateString) return "—";
    const dt = parseServerDateTime(dateString);
    if (!dt) return "—";
    return dt.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleUploadSubmission = async () => {
    if (!uploadTaskId || !uploadFile) return Alert.alert("Validation", "Please choose a submission file");

    const windowStatus = getSubmitWindow(selectedUploadTask);
    if (!windowStatus.canSubmitNow) {
      return Alert.alert("Submission closed", windowStatus.reason || "Submission is not allowed right now");
    }

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
        renderItem={loading ? () => <SkeletonTaskRow /> : ({ item, index }) => (
          <TaskItem
            item={item}
            index={index}
            canSubmit={canSubmit}
            onOpenDetails={openDetailsModal}
            onOpenSubmit={openSubmitModal}
          />
        )}
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

      {/* TASK DETAILS MODAL */}
      <Modal
        visible={isDetailsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailsModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setDetailsModalVisible(false)}
          />
          <View style={[styles.modalContent, { paddingBottom: insets.bottom || 20, maxHeight: "85%" }]}>
            <View style={styles.modalHandleContainer}><View style={styles.modalHandle} /></View>

            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 16 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {selectedDetailsTask?.title || "Task Details"}
                </Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {selectedDetailsTask?.subject_name || "Unknown subject"}
                </Text>
              </View>
              <Pressable onPress={() => setDetailsModalVisible(false)} style={styles.closeBtn}>
                <X color={BRAND.textMuted} size={22} strokeWidth={2.5} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.detailsCard}>
                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLabel}>Start</Text>
                  <Text style={styles.detailsValue}>{formatDateTime(selectedDetailsTask?.start_date)}</Text>
                </View>
                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLabel}>Deadline</Text>
                  <Text style={styles.detailsValue}>{formatDateTime(selectedDetailsTask?.due_date)}</Text>
                </View>
                <View style={[styles.detailsRow, { alignItems: "flex-start" }]}>
                  <Text style={styles.detailsLabel}>Description</Text>
                  <Text style={styles.detailsValue}>
                    {selectedDetailsTask?.description?.trim() ? selectedDetailsTask.description : "—"}
                  </Text>
                </View>
              </View>

              {!!selectedDetailsTask?.attachment_url && (
                <Pressable
                  onPress={() => openTaskAttachment(selectedDetailsTask)}
                  style={({ pressed }) => [styles.taskFileButton, pressed && { opacity: 0.9 }]}
                >
                  <FileText color={BRAND.primary} size={20} strokeWidth={2.5} />
                  <Text style={styles.taskFileButtonText}>View task file</Text>
                </Pressable>
              )}

              {canSubmit && (
                <Pressable
                  onPress={() => {
                    if (!selectedDetailsTask?.id) return;
                    if (selectedDetailsTask?.my_submission_id) return;
                    if (!detailsWindowStatus.canSubmitNow) {
                      Alert.alert(
                        "Submission closed",
                        detailsWindowStatus.reason || "Submission is not allowed right now",
                      );
                      return;
                    }
                    setDetailsModalVisible(false);
                    openSubmitModal(selectedDetailsTask.id);
                  }}
                  disabled={
                    Boolean(selectedDetailsTask?.my_submission_id) ||
                    !detailsWindowStatus.canSubmitNow
                  }
                  style={({ pressed }) => [
                    styles.modalActionBtn,
                    (Boolean(selectedDetailsTask?.my_submission_id) ||
                      !detailsWindowStatus.canSubmitNow) && { opacity: 0.6 },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <UploadCloud color="white" size={20} strokeWidth={2.5} />
                  <Text style={styles.modalActionBtnText}>
                    {selectedDetailsTask?.my_submission_id
                      ? "Submitted"
                      : detailsWindowStatus.canSubmitNow
                        ? "Submit"
                        : "Closed"}
                  </Text>
                </Pressable>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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
              {!!selectedUploadTask?.attachment_url && (
                <Pressable
                  onPress={() => openTaskAttachment(selectedUploadTask)}
                  style={({ pressed }) => [styles.taskFileButton, pressed && { opacity: 0.9 }]}
                >
                  <FileText color={BRAND.primary} size={20} strokeWidth={2.5} />
                  <Text style={styles.taskFileButtonText}>View task file</Text>
                </Pressable>
              )}

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

      {/* IN-APP FILE VIEWER (keep last so it appears above other modals) */}
      <Modal
        visible={isFileViewerVisible}
        transparent
        animationType="slide"
        onRequestClose={closeFileViewer}
      >
        <View style={[styles.modalOverlay, { justifyContent: "flex-end" }]}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={closeFileViewer}
          />
          <View style={[styles.modalContent, { paddingBottom: insets.bottom || 20, height: "85%" }]}>
            <View style={styles.modalHandleContainer}><View style={styles.modalHandle} /></View>

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>File</Text>
              {!!fileViewerUrl && (
                <Pressable
                  onPress={() => openFileExternally(fileViewerUrl)}
                  style={[styles.closeBtn, { marginRight: 8 }]}
                >
                  <Text style={{ color: BRAND.primary, fontWeight: "700" }}>Open</Text>
                </Pressable>
              )}
              <Pressable
                onPress={closeFileViewer}
                style={styles.closeBtn}
              >
                <X color={BRAND.textMuted} size={22} strokeWidth={2.5} />
              </Pressable>
            </View>

            <View style={{ flex: 1, paddingHorizontal: 12, paddingBottom: 12 }}>
              {!fileViewerUrl ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: BRAND.textMuted, fontWeight: "600" }}>No file</Text>
                </View>
              ) : (
                <View style={{ flex: 1, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: BRAND.border }}>
                  {fileViewerLoading && (
                    <View style={{ position: "absolute", top: 16, right: 16, zIndex: 10 }}>
                      <ActivityIndicator />
                    </View>
                  )}
                  <WebView
                    source={{ uri: fileViewerUrl, headers: { Authorization: `Bearer ${token}` } }}
                    onLoadStart={() => setFileViewerLoading(true)}
                    onLoadEnd={() => setFileViewerLoading(false)}
                    onError={() => {
                      setFileViewerLoading(false);
                      Alert.alert("Error", "Failed to preview file. Opening in browser instead.");
                      if (fileViewerUrl) {
                        openFileExternally(fileViewerUrl);
                        closeFileViewer();
                      }
                    }}
                  />
                </View>
              )}
            </View>
          </View>
        </View>
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
  taskMain: { flex: 1, flexDirection: "row", alignItems: "center" },
  taskIconBox: { width: 52, height: 52, borderRadius: 16, justifyContent: "center", alignItems: "center", marginRight: 14 },
  taskContent: { flex: 1, justifyContent: "center" },
  taskTitle: { fontSize: 17, fontWeight: "700", color: BRAND.text, marginBottom: 4, letterSpacing: -0.3 },
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

  taskFileButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: BRAND.primary + "10", borderWidth: 1, borderColor: BRAND.primary + "25", borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, marginTop: 12 },
  taskFileButtonText: { color: BRAND.primary, fontSize: 15, fontWeight: "800" },

  detailsCard: { backgroundColor: BRAND.background, borderRadius: 16, borderWidth: 1, borderColor: BRAND.border, padding: 14, marginTop: 8 },
  detailsRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BRAND.border },
  detailsLabel: { width: 90, color: BRAND.textMuted, fontSize: 13, fontWeight: "700" },
  detailsValue: { flex: 1, color: BRAND.text, fontSize: 13, fontWeight: "600" },
  
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