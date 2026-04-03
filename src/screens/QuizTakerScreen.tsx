import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, useNavigation } from "@react-navigation/native";
import { CheckCircle, Clock, AlertTriangle, ChevronLeft } from "lucide-react-native";

import { api } from "../lib/api";
import { User } from "../types/auth";
import { usePreventScreenCapture } from "expo-screen-capture";

const BRAND = {
  primary: "#3390ec",
  background: "#f4f6f9",
  surface: "#FFFFFF",
  text: "#1c1c1e",
  textMuted: "#8e8e93",
  border: "#E5E5EA",
  success: "#34c759",
  danger: "#ff3b30",
};

interface Question {
  id: number;
  question_text: string;
  options: string[];
}

export default function QuizTakerScreen({
  token,
  user,
  route,
}: {
  token: string;
  user: User;
  route: any;
}) {
  const { quizId } = route.params;
  const navigation = useNavigation<any>();

  // Use screenshot prevention to secure exam environment
  usePreventScreenCapture();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [quizDetails, setQuizDetails] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);

  const [needsPassword, setNeedsPassword] = useState(false);
  const [accessPassword, setAccessPassword] = useState("");
  
  const [status, setStatus] = useState<"pending" | "in_progress" | "submitted">("pending");
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  
  const [answers, setAnswers] = useState<Record<number, number>>({});
  
  // Timer State
  const [timeRemainingSec, setTimeRemainingSec] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchQuizData();
    return () => clearInterval(timerRef.current!);
  }, [quizId]);

  const applyQuizPayload = (data: any) => {
    setQuizDetails({
      id: data.id,
      title: data.title,
      description: data.description,
      time_limit_minutes: data.time_limit_minutes,
    });

    setQuestions((data.questions || []).map((q: any) => {
      let parsedOpts = q.options;
      if (typeof parsedOpts === "string") {
        try { parsedOpts = JSON.parse(parsedOpts); } catch { parsedOpts = []; }
      }
      return {
        ...q,
        options: Array.isArray(parsedOpts) ? parsedOpts : []
      };
    }));
  };

  const fetchQuizData = async () => {
    try {
      const res = await api.get(`/quizzes/${quizId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNeedsPassword(false);
      applyQuizPayload(res.data);
      
      // Let's check status. If hitting /subject returned in-progress, we don't know it here directly
      // unless we attempt to start or there's an endpoint to check. 
      // We can optimistically call /start right away if they press the start button.
      // Or we can check if they already started by calling start. If we get "Quiz already started",
      // it returns submissionId, startedAt.
      
      // We will handle that by letting them click "Start", or if they reload the page, we can try to "peek"
      // the status. To peek without starting, we'll need a peek route, or we can just try "Starting"
      // and checking the error response.
      // NOTE: do not auto-hit /start here; starting should be explicit

    } catch (err: any) {
      const statusCode = err?.response?.status;
      const errMsg = err?.response?.data?.error;

      if (statusCode === 403 && errMsg === "Password required") {
        setNeedsPassword(true);
        setStatus("pending");
        setStartedAt(null);
        setQuestions([]);
        setAccessPassword("");

        const quiz = err?.response?.data?.quiz;
        if (quiz) {
          setQuizDetails({
            id: quiz.id,
            title: quiz.title,
            description: quiz.description,
            time_limit_minutes: quiz.time_limit_minutes,
          });
        }
      } else if (statusCode === 403) {
        Alert.alert("Not Active", "This exam is not active right now.", [
          { text: "OK", onPress: () => navigation.goBack() }
        ]);
      } else {
        console.warn("Failed fetching quiz", err);
      }
    } finally {
      setLoading(false);
    }
  };

  const startupCheck = async () => {
    try {
      // Just hit start. If it creates a new one, great. If it already exists, it returns those fields anyway!
      // This is a common idempotent pattern in LMS systems.
      const startRes = await api.post(`/quizzes/${quizId}/start`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (startRes.data.message === "Quiz already started") {
        if (startRes.data.finishedAt) {
          setStatus("submitted");
        } else {
          setStatus("in_progress");
          setStartedAt(new Date(startRes.data.startedAt));
        }
      } else {
         // Because we auto-hit start, we actually started the quiz instantly upon screen load.
         // Let's modify the flow to ONLY hit start when user explicitly taps "Start Quiz"
         // To do that properly, I'll bypass the auto-start. Wait, let's keep it manual.
         // We do not want to auto-start so they don't lose time accidentally opening it.
      }
    } catch {
       // Silently fail if we can't auto-start peek.
    }
  };

  useEffect(() => {
    if (status === "in_progress" && startedAt && quizDetails) {
      timerRef.current = setInterval(() => {
        const now = new Date().getTime();
        const start = startedAt.getTime();
        const elapsedSec = Math.floor((now - start) / 1000);
        const limitSec = quizDetails.time_limit_minutes * 60;
        const remaining = limitSec - elapsedSec;

        if (remaining <= 0) {
          clearInterval(timerRef.current!);
          setTimeRemainingSec(0);
          handleAutoSubmit();
        } else {
          setTimeRemainingSec(remaining);
        }
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status, startedAt, quizDetails]);

  const handleStartQuiz = async () => {
    if (needsPassword && !accessPassword.trim()) {
      Alert.alert("Password Required", "Enter the exam password to start.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post(
        `/quizzes/${quizId}/start`,
        accessPassword.trim() ? { password: accessPassword.trim() } : {},
        {
        headers: { Authorization: `Bearer ${token}` },
        },
      );
      
      if (res.data.finishedAt) {
        setStatus("submitted");
      } else {
        setStatus("in_progress");
        setStartedAt(new Date(res.data.startedAt));
      }

      setNeedsPassword(false);

      // Load questions now that the quiz is unlocked/started
      const quizRes = await api.get(`/quizzes/${quizId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      applyQuizPayload(quizRes.data);
    } catch (err: any) {
      const errMsg = err?.response?.data?.error;
      if (err?.response?.status === 403 && (errMsg === "Password required" || errMsg === "Invalid password")) {
        setNeedsPassword(true);
        Alert.alert("Password", errMsg === "Invalid password" ? "Incorrect password." : "Password is required.");
        return;
      }
      if (err?.response?.data?.message === "Quiz already started") {
        setStatus("in_progress");
        // We'd need to fetch startedAt from somewhere if not returned. 
        // Our backend actually supports returning it inside the error payload or success payload.
      } else {
        Alert.alert("Error", err?.response?.data?.error || "Could not start quiz.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSelect = (questionId: number, index: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: index }));
  };

  const submitQuiz = async (auto = false) => {
    if (!auto && Object.keys(answers).length < questions.length) {
      const incomplete = questions.length - Object.keys(answers).length;
      return new Promise<void>((resolve) => {
        Alert.alert(
          "Incomplete",
          `You have ${incomplete} unanswered questions. Submit anyway?`,
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve() },
            { 
              text: "Submit", 
              style: "destructive", 
              onPress: () => {
                executeSubmit();
                resolve();
              } 
            }
          ]
        );
      });
    } else {
      await executeSubmit();
    }
  };

  const executeSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    
    // Format answers map to array
    const answersArray = Object.keys(answers).map(qId => ({
      questionId: Number(qId),
      selectedOptionIndex: answers[Number(qId)]
    }));

    try {
      const res = await api.post(`/quizzes/${quizId}/submit`, { answers: answersArray }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStatus("submitted");
      Alert.alert(
        "Exam Submitted", 
        `Submission successful. You scored ${res.data.score}/${res.data.total}.`,
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      Alert.alert("Submission Error", err?.response?.data?.error || "Could not submit exam.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAutoSubmit = () => {
    Alert.alert("Time's Up!", "Your exam time has expired. Submitting automatically...", [
      { text: "OK", onPress: () => executeSubmit() }
    ]);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (loading || !quizDetails) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BRAND.primary} />
      </View>
    );
  }

  // Pending State
  if (status === "pending") {
    return (
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView style={styles.pendingKeyboardView} behavior={Platform.OS === "ios" ? "padding" : "height"}>
         <View style={styles.header}>
           <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
             <ChevronLeft size={24} color={BRAND.text} />
           </Pressable>
           <Text style={styles.headerTitle}>Exam Room</Text>
         </View>
         <View style={styles.pendingContainer}>
           <View style={styles.pendingCard}>
             <Text style={styles.quizTitle}>{quizDetails.title}</Text>
             <Text style={styles.quizDesc}>{quizDetails.description}</Text>
             <View style={styles.infoRow}>
               <Clock size={20} color={BRAND.primary} />
               <Text style={styles.infoText}>Time Limit: {quizDetails.time_limit_minutes} Mins</Text>
             </View>
             <View style={[styles.infoRow, { marginTop: 12 }]}>
               <AlertTriangle size={20} color={BRAND.danger} />
               <Text style={[styles.infoText, { color: BRAND.danger }]}>Do not leave the app during the exam.</Text>
             </View>

             {needsPassword && (
              <View style={styles.passwordBox}>
                <Text style={styles.passwordLabel}>Exam Password</Text>
                <TextInput
                 value={accessPassword}
                 onChangeText={setAccessPassword}
                 placeholder="Enter password"
                 placeholderTextColor={BRAND.textMuted}
                 secureTextEntry
                 autoCapitalize="none"
                 style={styles.passwordInput}
                />
              </View>
             )}
           </View>
           <Pressable onPress={handleStartQuiz} style={styles.startBtn}>
             <Text style={styles.startBtnText}>Start Exam</Text>
           </Pressable>
         </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Submitted State
  if (status === "submitted") {
    return (
      <SafeAreaView style={styles.screen}>
         <View style={styles.header}>
            <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
               <ChevronLeft size={24} color={BRAND.text} />
            </Pressable>
         </View>
         <View style={styles.loadingContainer}>
            <CheckCircle size={80} color={BRAND.success} style={{ marginBottom: 20 }}/>
            <Text style={styles.quizTitle}>Exam Submitted</Text>
            <Text style={styles.infoText}>You have already completed this exam.</Text>
         </View>
      </SafeAreaView>
    );
  }

  // In Progress State
  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.examHeader}>
        <Text style={styles.examTitle} numberOfLines={1}>{quizDetails.title}</Text>
        <View style={[
          styles.timerBadge, 
          timeRemainingSec !== null && timeRemainingSec < 60 && styles.timerDanger
        ]}>
          <Clock size={16} color={timeRemainingSec !== null && timeRemainingSec < 60 ? "#fff" : BRAND.text} />
          <Text style={[
            styles.timerText,
            timeRemainingSec !== null && timeRemainingSec < 60 && { color: "#fff" }
          ]}>
            {timeRemainingSec !== null ? formatTime(timeRemainingSec) : "--:--"}
          </Text>
        </View>
      </View>

      <FlatList
        data={questions}
        keyExtractor={(q) => q.id.toString()}
        contentContainerStyle={styles.listContent}
        renderItem={({ item: q, index }) => (
          <View style={styles.questionCard}>
            <View style={styles.qHeader}>
               <View style={styles.qBadge}><Text style={styles.qBadgeText}>Q{index + 1}</Text></View>
               <Text style={styles.qText}>{q.question_text}</Text>
            </View>
            
            <View style={styles.optionsList}>
               {q.options.map((opt, optIdx) => {
                  const isSelected = answers[q.id] === optIdx;
                  return (
                    <Pressable
                      key={optIdx}
                      style={[styles.optionBtn, isSelected && styles.optionSelected]}
                      onPress={() => handleAnswerSelect(q.id, optIdx)}
                    >
                      <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                         {isSelected && <View style={styles.radioInner} />}
                      </View>
                      <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{opt}</Text>
                    </Pressable>
                  );
               })}
            </View>
          </View>
        )}
        ListFooterComponent={
          <Pressable 
            style={[styles.startBtn, submitting && { opacity: 0.7 }]} 
            onPress={() => submitQuiz(false)}
            disabled={submitting}
          >
             {submitting ? (
               <ActivityIndicator color="#fff" />
             ) : (
               <Text style={styles.startBtnText}>Submit Exam</Text>
             )}
          </Pressable>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.background },
  pendingKeyboardView: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    backgroundColor: BRAND.surface,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: BRAND.text },
  
  pendingContainer: { flex: 1, padding: 20, justifyContent: "center" },
  pendingCard: {
    backgroundColor: BRAND.surface,
    padding: 24,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 30,
  },
  quizTitle: { fontSize: 24, fontWeight: "800", color: BRAND.text, marginBottom: 8 },
  quizDesc: { fontSize: 15, color: BRAND.textMuted, lineHeight: 22, marginBottom: 20 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  infoText: { fontSize: 15, fontWeight: "600", color: BRAND.text },

  passwordBox: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: BRAND.border,
  },
  passwordLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: BRAND.text,
    marginBottom: 10,
  },
  passwordInput: {
    height: 48,
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: BRAND.background,
    color: BRAND.text,
    fontSize: 15,
    fontWeight: "600",
  },
  
  startBtn: {
    backgroundColor: BRAND.primary,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: BRAND.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  startBtnText: { color: "#fff", fontSize: 18, fontWeight: "800" },

  examHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: BRAND.surface,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
  },
  examTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: BRAND.text, paddingRight: 10 },
  timerBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: BRAND.background, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  timerDanger: { backgroundColor: BRAND.danger },
  timerText: { fontSize: 16, fontWeight: "800", color: BRAND.text, fontVariant: ["tabular-nums"] },

  listContent: { padding: 16, paddingBottom: 100 },
  questionCard: {
    backgroundColor: BRAND.surface,
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  qHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 20 },
  qBadge: {
    backgroundColor: BRAND.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 12,
    marginTop: 2,
  },
  qBadgeText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  qText: { flex: 1, fontSize: 17, fontWeight: "700", color: BRAND.text, lineHeight: 24 },
  
  optionsList: { gap: 10 },
  optionBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    backgroundColor: BRAND.background,
  },
  optionSelected: {
    borderColor: BRAND.primary,
    backgroundColor: BRAND.primary + "10",
  },
  radioOuter: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: "#c7c7cc",
    justifyContent: "center", alignItems: "center",
    marginRight: 12,
  },
  radioOuterSelected: { borderColor: BRAND.primary },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: BRAND.primary },
  optionText: { flex: 1, fontSize: 16, color: BRAND.text, fontWeight: "500" },
  optionTextSelected: { color: BRAND.primary, fontWeight: "700" },
});
