import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  ClipboardCheck,
  CheckCircle,
  Clock,
  ChevronRight,
  X,
} from "lucide-react-native";

import { api } from "../lib/api";
import { User } from "../types/auth";

const BRAND = {
  primary: "#3390ec",
  background: "#f4f6f9",
  surface: "#FFFFFF",
  text: "#1c1c1e",
  textMuted: "#8e8e93",
  border: "#E5E5EA",
  success: "#34c759",
  warning: "#ffcc00",
};

interface Quiz {
  id: number;
  subject_id: number;
  title: string;
  description: string;
  time_limit_minutes: number;
  status: string;
  start_time?: string | null;
  deadline?: string | null;
  availability_status?: "upcoming" | "open" | "closed";
  student_status: "pending" | "in_progress" | "submitted";
  score: number | null;
  total_marks?: number;
  show_results?: number | boolean;
  started_at?: string | null;
  finished_at?: string | null;
}

interface Subject {
  id: number;
  name: string;
}

export default function QuizzesNativeScreen({
  token,
  user,
}: {
  token: string;
  user: User;
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [groupedQuizzes, setGroupedQuizzes] = useState<Record<number, Quiz[]>>({});

  const [selectedResult, setSelectedResult] = useState<Quiz | null>(null);
  const [resultModalVisible, setResultModalVisible] = useState(false);

  const fetchData = async () => {
    try {
      // Use role-appropriate endpoint
      const isStudent = user?.role === "student";
      const endpoint = isStudent ? "/subjects/my-subjects" : "/subjects";
      const subRes = await api.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const mySubjects: Subject[] = subRes.data || [];
      setSubjects(mySubjects);

      if (!mySubjects.length) {
        setGroupedQuizzes({});
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // 2. Fetch quizzes per subject
      const quizzesData: Record<number, Quiz[]> = {};
      await Promise.all(
        mySubjects.map(async (subj) => {
          try {
            const qRes = await api.get(`/quizzes/subject/${subj.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (qRes.data && qRes.data.length > 0) {
              quizzesData[subj.id] = qRes.data;
            }
          } catch (e: any) {
            console.warn(`Failed fetching quizzes for subject ${subj.id}:`, e?.response?.data || e?.message || e);
          }
        })
      );
      setGroupedQuizzes(quizzesData);
    } catch (err) {
      console.warn("Failed fetching quizzes", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  useFocusEffect(
    React.useCallback(() => {
      fetchData();
    }, [token, user?.role])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const getStatusBadge = (quiz: Quiz) => {
    const studentStatus = quiz.student_status;
    const score = quiz.score;

    if (quiz.availability_status === "upcoming") {
      return (
        <View style={[styles.badge, { backgroundColor: BRAND.warning + "20" }]}> 
          <Clock size={14} color="#d4a000" />
          <Text style={[styles.badgeText, { color: "#d4a000" }]}>Not Started</Text>
        </View>
      );
    }

    if (quiz.availability_status === "closed" && studentStatus === "pending") {
      return (
        <View style={[styles.badge, { backgroundColor: BRAND.border }]}> 
          <Text style={[styles.badgeText, { color: BRAND.textMuted }]}>Closed</Text>
        </View>
      );
    }

    if (studentStatus === "submitted") {
      return (
        <View style={[styles.badge, { backgroundColor: BRAND.success + "20" }]}>
          <CheckCircle size={14} color={BRAND.success} />
          <Text style={[styles.badgeText, { color: BRAND.success }]}>Result</Text>
        </View>
      );
    }
    if (studentStatus === "in_progress") {
      return (
        <View style={[styles.badge, { backgroundColor: BRAND.warning + "20" }]}>
          <Clock size={14} color="#d4a000" />
          <Text style={[styles.badgeText, { color: "#d4a000" }]}>In Progress</Text>
        </View>
      );
    }
    return (
      <View style={[styles.badge, { backgroundColor: BRAND.primary + "20" }]}>
        <Text style={[styles.badgeText, { color: BRAND.primary }]}>Start Exam</Text>
      </View>
    );
  };

  // Flatten the layout for FlatList rendering
  const listData = useMemo(() => {
    let data: any[] = [];
    subjects.forEach((subj) => {
      const subjQuizzes = groupedQuizzes[subj.id];
      if (subjQuizzes && subjQuizzes.length > 0) {
        data.push({ type: "header", title: subj.name, id: `h-${subj.id}` });
        subjQuizzes.forEach((q) => {
          data.push({ type: "quiz", data: q, id: `q-${q.id}` });
        });
      }
    });
    return data;
  }, [subjects, groupedQuizzes]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BRAND.primary} />
      </View>
    );
  }

  if (listData.length === 0) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.emptyContainer}>
          <ClipboardCheck size={60} color={BRAND.border} />
          <Text style={styles.emptyTitle}>No Exams Found</Text>
          <Text style={styles.emptySubtitle}>You have no active exams right now.</Text>
          <Pressable onPress={onRefresh} style={styles.refreshBtn}>
             <Text style={styles.refreshBtnText}>Refresh</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND.primary} />
        }
        renderItem={({ item }) => {
          if (item.type === "header") {
            return <Text style={styles.sectionHeader}>{item.title}</Text>;
          }

          const q: Quiz = item.data;
          
          return (
            <Pressable
              style={styles.card}
              onPress={() => {
                if (q.student_status === "submitted") {
                  setSelectedResult(q);
                  setResultModalVisible(true);
                } else {
                  navigation.navigate("QuizTaker", { quizId: q.id });
                }
              }}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.quizTitle}>{q.title}</Text>
                {getStatusBadge(q)}
              </View>
              {q.description ? <Text style={styles.quizDesc}>{q.description}</Text> : null}
              
              <View style={styles.cardFooter}>
                <View style={styles.footerInfo}>
                   <Clock size={16} color={BRAND.textMuted} />
                   <Text style={styles.footerText}>{q.time_limit_minutes} Mins</Text>
                </View>
                <ChevronRight size={20} color={BRAND.border} />
              </View>
            </Pressable>
          );
        }}
      />

      {/* RESULT MODAL */}
      <Modal
        visible={resultModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setResultModalVisible(false)}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={styles.modalBackdrop} onPress={() => setResultModalVisible(false)} />
          <View style={[styles.modalContent, { paddingBottom: insets.bottom || 20 }]}>
            <View style={styles.modalHandleContainer}><View style={styles.modalHandle} /></View>
            
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {selectedResult?.title || "Quiz Result"}
              </Text>
              <Pressable onPress={() => setResultModalVisible(false)} style={styles.closeBtn}>
                <X color={BRAND.textMuted} size={22} strokeWidth={2.5} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.resultOverview}>
                <Text style={styles.resultOverviewLabel}>Your final grade for this quiz is</Text>
                <Text style={styles.resultOverviewValue}>
                  {selectedResult?.show_results
                    ? `${Number(selectedResult?.score || 0).toFixed(2)} / ${Number(selectedResult?.total_marks || 0).toFixed(2)}`
                    : "Pending review"}
                </Text>
              </View>

              <Text style={styles.attemptsSummaryTitle}>Your attempts</Text>
              
              <View style={styles.attemptCard}>
                <View style={styles.attemptCardHeader}>
                  <Text style={styles.attemptCardTitle}>Attempt 1</Text>
                </View>
                <View style={styles.attemptRow}>
                  <Text style={styles.attemptLabel}>Status</Text>
                  <Text style={styles.attemptValue}>Finished</Text>
                </View>
                <View style={styles.attemptRow}>
                  <Text style={styles.attemptLabel}>Started</Text>
                  <Text style={styles.attemptValue}>
                    {selectedResult?.started_at ? new Date(selectedResult.started_at).toLocaleString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : "—"}
                  </Text>
                </View>
                <View style={styles.attemptRow}>
                  <Text style={styles.attemptLabel}>Completed</Text>
                  <Text style={styles.attemptValue}>
                    {selectedResult?.finished_at ? new Date(selectedResult.finished_at).toLocaleString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : "—"}
                  </Text>
                </View>
                <View style={styles.attemptRow}>
                  <Text style={styles.attemptLabel}>Duration</Text>
                  <Text style={styles.attemptValue}>
                    {(() => {
                      if (!selectedResult?.started_at || !selectedResult?.finished_at) return "—";
                      const diffMs = new Date(selectedResult.finished_at).getTime() - new Date(selectedResult.started_at).getTime();
                      if (diffMs <= 0) return "0 mins";
                      const mins = Math.floor(diffMs / 60000);
                      const secs = Math.floor((diffMs % 60000) / 1000);
                      return mins > 0 ? `${mins} mins ${secs} secs` : `${secs} secs`;
                    })()}
                  </Text>
                </View>
                <View style={[styles.attemptRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                  <Text style={[styles.attemptLabel, { fontWeight: "700" }]}>Grade</Text>
                  <Text style={[styles.attemptValue, { fontWeight: "700" }]}>
                    {selectedResult?.show_results
                      ? <><Text style={{ color: BRAND.success }}>{Number(selectedResult?.score || 0).toFixed(2)}</Text> out of {Number(selectedResult?.total_marks || 0).toFixed(2)}</>
                      : "Pending review"}
                  </Text>
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.background },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { padding: 16, paddingBottom: 100 },
  sectionHeader: {
    fontSize: 15,
    fontWeight: "700",
    color: BRAND.textMuted,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 16,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: BRAND.surface,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  quizTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: BRAND.text,
    marginRight: 12,
  },
  quizDesc: {
    fontSize: 14,
    color: BRAND.textMuted,
    marginBottom: 12,
    lineHeight: 20,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: BRAND.border,
    paddingTop: 12,
    marginTop: 8,
  },
  footerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerText: {
    fontSize: 14,
    fontWeight: "600",
    color: BRAND.textMuted,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: BRAND.text, marginTop: 16 },
  emptySubtitle: { fontSize: 15, color: BRAND.textMuted, marginTop: 8, textAlign: "center" },
  refreshBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: BRAND.primary,
    borderRadius: 12,
  },
  refreshBtnText: { color: "#fff", fontWeight: "700" },

  // Modal Styles
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  modalContent: {
    backgroundColor: BRAND.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
  },
  modalHandleContainer: { alignItems: "center", paddingTop: 12, paddingBottom: 8 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: BRAND.border },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: BRAND.text, flex: 1 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BRAND.background,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBody: { padding: 20 },
  resultOverview: {
    marginBottom: 24,
  },
  resultOverviewLabel: { fontSize: 18, fontWeight: "700", color: BRAND.text, marginBottom: 4 },
  resultOverviewValue: { fontSize: 24, fontWeight: "800", color: BRAND.text },
  attemptsSummaryTitle: { fontSize: 18, fontWeight: "700", color: BRAND.text, marginBottom: 12 },
  attemptCard: {
    backgroundColor: BRAND.surface,
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 40,
  },
  attemptCardHeader: {
    backgroundColor: BRAND.background,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
  },
  attemptCardTitle: { fontSize: 16, fontWeight: "700", color: BRAND.text },
  attemptRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
  },
  attemptLabel: { flex: 1, fontSize: 14, color: BRAND.textMuted, fontWeight: "500" },
  attemptValue: { flex: 2, fontSize: 14, color: BRAND.text, fontWeight: "500" },
});
