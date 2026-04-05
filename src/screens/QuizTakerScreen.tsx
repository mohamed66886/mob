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
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CheckCircle, Clock, AlertTriangle, ChevronLeft, Flag } from "lucide-react-native";

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
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

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
    // Do not clear interval based on quizId alone here because timer is dependent on status too
  }, [quizId]);

  // Persistent storage for answers
  useEffect(() => {
    AsyncStorage.getItem(`quiz_${quizId}_answers`).then((data) => {
      if (data) setAnswers(JSON.parse(data));
    });
  }, [quizId]);

  useEffect(() => {
    if (Object.keys(answers).length > 0) {
      AsyncStorage.setItem(`quiz_${quizId}_answers`, JSON.stringify(answers));
    }
  }, [answers, quizId]);

  // Prevent leaving exam screen
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e: any) => {
      const isGoingBackToStart = e.data.action.type === 'GO_BACK';
      if (status === "in_progress") {
        e.preventDefault();
        Alert.alert("Warning", "You cannot leave during the exam. Please submit first.");
      }
    });
    return unsubscribe;
  }, [navigation, status]);

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
      if (timerRef.current) clearInterval(timerRef.current);

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
      const resData = err?.response?.data;

      if (err?.response?.status === 403 && (errMsg === "Password required" || errMsg === "Invalid password")) {
        setNeedsPassword(true);
        Alert.alert("Password", errMsg === "Invalid password" ? "Incorrect password." : "Password is required.");
        return;
      }

      // Check if backend returns 'already started' either in standard error message or specifically format
      if (resData?.message === "Quiz already started") {
        if (resData.finishedAt) {
          setStatus("submitted");
        } else {
          setStatus("in_progress");
          if (resData.startedAt) setStartedAt(new Date(resData.startedAt));
        }
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
                executeSubmit(false);
                resolve();
              } 
            }
          ]
        );
      });
    } else {
      await executeSubmit(false);
    }
  };

  const executeSubmit = async (isAuto = false) => {
    if (submitting) return;
    setSubmitting(true);
    
    // Format answers map to array
    const answersArray = Object.entries(answers).map(([qId, value]) => ({
      questionId: Number(qId),
      selectedOptionIndex: value,
    }));

    try {
      const res = await api.post(`/quizzes/${quizId}/submit`, { answers: answersArray }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStatus("submitted");
      Alert.alert(
        isAuto ? "Time's Up!" : "Exam Submitted", 
        isAuto 
          ? `Your time expired and your exam was automatically submitted.\nYou scored ${res.data.score}/${res.data.total}.`
          : `Submission successful. You scored ${res.data.score}/${res.data.total}.`,
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      Alert.alert("Submission Error", err?.response?.data?.error || "Could not submit exam.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAutoSubmit = () => {
    executeSubmit(true);
  };

  const formatFullTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
  const q = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const isFirstQuestion = currentQuestionIndex === 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.examHeader}>
        <Text style={styles.examTitle} numberOfLines={1}>{quizDetails.title}</Text>
        <View style={styles.timerBadge}>
          <Text style={styles.timerLabelText}>Time left </Text>
          <Text style={styles.timerText}>
            {timeRemainingSec !== null 
              ? formatFullTime(timeRemainingSec)
              : "00:00:00"}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.singleQuestionContent} contentContainerStyle={{ paddingBottom: 40 }}>
        {q && (
          <>
            <View style={styles.questionMetaContainer}>
              <Text style={styles.questionMetaTitle}>
                Question <Text style={styles.questionMetaNumber}>{currentQuestionIndex + 1}</Text>
              </Text>
              <Text style={styles.questionMetaStatus}>
                {answers[q.id] !== undefined ? "Answer saved" : "Not yet answered"}
              </Text>
              <Text style={styles.questionMetaPoints}>Marked out of 1.00</Text>
              <Pressable style={styles.flagButton}>
                <Flag size={14} color="#007bff" />
                <Text style={styles.flagText}>Flag question</Text>
              </Pressable>
            </View>
            
            <View style={styles.questionBox}>
              <Text style={styles.qTextMoodle}>{q.question_text}</Text>
              
              <Text style={styles.selectOneText}>Select one:</Text>
              <View style={styles.optionsListMoodle}>
                 {q.options.map((opt, optIdx) => {
                    const isSelected = answers[q.id] === optIdx;
                    const optionLabel = String.fromCharCode(97 + optIdx); // a, b, c, d
                    return (
                      <Pressable
                        key={optIdx}
                        style={styles.optionBtnMoodle}
                        onPress={() => handleAnswerSelect(q.id, optIdx)}
                      >
                        <View style={[styles.moodleRadioOuter, isSelected && styles.moodleRadioOuterSelected]}>
                           {isSelected && <View style={styles.moodleRadioInner} />}
                        </View>
                        <Text style={styles.optionLetterLabel}>{optionLabel}.</Text>
                        <Text style={styles.optionTextMoodle}>{opt}</Text>
                      </Pressable>
                    );
                 })}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.navigationFooter}>
        <Pressable 
          style={[styles.navBtn, isFirstQuestion && styles.navBtnDisabled]} 
          disabled={isFirstQuestion}
          onPress={() => setCurrentQuestionIndex(prev => prev - 1)}
        >
          <Text style={[styles.navBtnText, isFirstQuestion && styles.navBtnTextDisabled]}>Previous</Text>
        </Pressable>

        {isLastQuestion ? (
          <Pressable 
            style={[styles.navBtn, submitting && { opacity: 0.7 }, { backgroundColor: BRAND.primary, borderColor: BRAND.primary }]} 
            onPress={() => submitQuiz(false)}
            disabled={submitting}
          >
             {submitting ? (
               <ActivityIndicator color="#fff" />
             ) : (
               <Text style={[styles.navBtnText, { color: '#fff' }]}>Submit Exam</Text>
             )}
          </Pressable>
        ) : (
          <Pressable 
            style={styles.navBtn} 
            onPress={() => setCurrentQuestionIndex(prev => prev + 1)}
          >
            <Text style={styles.navBtnText}>Next</Text>
          </Pressable>
        )}
      </View>
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
    flexDirection: "row", alignItems: "center",
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#a52a2a',
  },
  timerLabelText: { fontSize: 16, color: '#212529' },
  timerText: { fontSize: 16, color: '#212529', fontVariant: ["tabular-nums"] },

  singleQuestionContent: {
    padding: 16,
    flex: 1,
  },
  questionMetaContainer: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    padding: 16,
  },
  questionMetaTitle: {
    fontSize: 16,
    color: '#212529',
    fontWeight: '700',
  },
  questionMetaNumber: {
    fontSize: 22,
    fontWeight: '800',
  },
  questionMetaStatus: {
    fontSize: 14,
    color: '#212529',
    marginTop: 12,
  },
  questionMetaPoints: {
    fontSize: 14,
    color: '#212529',
    marginTop: 4,
  },
  flagButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  flagText: {
    color: '#007bff',
    fontSize: 14,
  },
  questionBox: {
    backgroundColor: '#eef4f5',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#dee2e6',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    padding: 24,
    marginBottom: 20,
  },
  qTextMoodle: {
    fontSize: 18,
    color: '#212529',
    lineHeight: 28,
  },
  selectOneText: {
    fontSize: 15,
    color: '#212529',
    marginBottom: 12,
    marginTop: 20,
  },
  optionsListMoodle: {
    gap: 12,
  },
  optionBtnMoodle: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 6,
  },
  moodleRadioOuter: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1, borderColor: "#495057",
    justifyContent: "center", alignItems: "center",
    marginRight: 8,
    marginTop: 2,
    backgroundColor: '#fff',
  },
  moodleRadioOuterSelected: { borderColor: "#007bff", borderWidth: 2 },
  moodleRadioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#007bff" },
  optionLetterLabel: {
    fontSize: 16,
    color: '#212529',
    marginRight: 8,
    lineHeight: 24,
  },
  optionTextMoodle: {
    flex: 1, 
    fontSize: 16, 
    color: '#212529',
    lineHeight: 24,
  },
  navigationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BRAND.border,
    backgroundColor: '#fff',
  },
  navBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#adb5bd',
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
    marginHorizontal: 6,
  },
  navBtnDisabled: {
    backgroundColor: '#f8f9fa',
    borderColor: '#dee2e6',
  },
  navBtnText: {
    color: '#212529',
    fontSize: 16,
    fontWeight: '600',
  },
  navBtnTextDisabled: {
    color: '#adb5bd',
  },
});
