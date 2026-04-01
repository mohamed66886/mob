import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import {
  ClipboardCheck,
  CheckCircle,
  Clock,
  ChevronRight,
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
  student_status: "pending" | "in_progress" | "submitted";
  score: number | null;
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
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [groupedQuizzes, setGroupedQuizzes] = useState<Record<number, Quiz[]>>({});

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

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const getStatusBadge = (studentStatus: string, score: number | null) => {
    if (studentStatus === "submitted") {
      return (
        <View style={[styles.badge, { backgroundColor: BRAND.success + "20" }]}>
          <CheckCircle size={14} color={BRAND.success} />
          <Text style={[styles.badgeText, { color: BRAND.success }]}>
            Submitted {score !== null ? `(${score})` : ""}
          </Text>
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BRAND.primary} />
      </View>
    );
  }

  // Flatten the layout for FlatList rendering
  let listData: any[] = [];
  subjects.forEach((subj) => {
    const subjQuizzes = groupedQuizzes[subj.id];
    if (subjQuizzes && subjQuizzes.length > 0) {
      listData.push({ type: "header", title: subj.name, id: `h-${subj.id}` });
      subjQuizzes.forEach((q) => {
        listData.push({ type: "quiz", data: q, id: `q-${q.id}` });
      });
    }
  });

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
                navigation.navigate("QuizTaker", { quizId: q.id });
              }}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.quizTitle}>{q.title}</Text>
                {getStatusBadge(q.student_status, q.score)}
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
});
