import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CheckCircle, Clock, AlertTriangle, ChevronLeft, Flag, Check } from "lucide-react-native";

import { api } from "../lib/api";
import { User } from "../types/auth";
import { usePreventScreenCapture, addScreenshotListener } from "expo-screen-capture";
import { createProctorSocketClient } from "../proctoring/socket";
import { ProctorDecision, ProctorEventType, ProctorRiskUpdate } from "../proctoring/types";

async function getDeviceFingerprint(): Promise<string> {
  try {
    let fp = await AsyncStorage.getItem("device_fingerprint");
    if (!fp) {
      fp = "fp_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 10);
      await AsyncStorage.setItem("device_fingerprint", fp);
    }
    return fp;
  } catch {
    return "unknown_device_fp";
  }
}

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

const MAX_ALLOWED_APP_EXITS = 2;
const PROCTOR_HEARTBEAT_MS = 12000;

interface Question {
  id: number;
  question_text: string;
  question_type?: string;
  type?: string;
  questionType?: string;
  image_url?: string;
  options: string[];
  matching_right?: string[];
  correct_answer?: string;
}

function normalizeQuestionType(raw: unknown): string {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();

  if (
    value === "mcq" ||
    value === "single" ||
    value === "single_choice" ||
    value === "single choice"
  ) {
    return "mcq";
  }

  if (
    value === "multiple_responses" ||
    value === "multiple" ||
    value === "multi" ||
    value === "multiple choice" ||
    value === "multiple responses"
  ) {
    return "multiple_responses";
  }

  if (
    value === "true_false" ||
    value === "true/false" ||
    value === "tf" ||
    value === "boolean"
  ) {
    return "true_false";
  }

  if (value === "short_answer" || value === "short" || value === "text") {
    return "short_answer";
  }

  if (
    value === "essay" ||
    value === "long" ||
    value === "long_answer" ||
    value === "long answer"
  ) {
    return "essay";
  }

  if (
    value === "fill_blanks" ||
    value === "fill" ||
    value === "fill in blanks" ||
    value === "fill in the blanks"
  ) {
    return "fill_blanks";
  }

  if (value === "matching" || value === "match" || value === "التوصيل") {
    return "matching";
  }

  return "mcq";
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
  
  const [answers, setAnswers] = useState<Record<number, any>>({});
  
  // Timer State
  const [timeRemainingSec, setTimeRemainingSec] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [violations, setViolations] = useState(0);
  const [riskScore, setRiskScore] = useState(0);
  const [warningThreshold, setWarningThreshold] = useState(10);
  const [autoSubmitThreshold, setAutoSubmitThreshold] = useState(20);
  const [socketConnected, setSocketConnected] = useState(false);
  const riskCooldownMapRef = useRef<Record<string, number>>({});
  const lastWarningAtRef = useRef(0);
  const proctorClientRef = useRef(createProctorSocketClient(token));
  const appState = useRef(AppState.currentState);

  const applyRiskUpdate = (payload: ProctorRiskUpdate) => {
    if (typeof payload?.risk_score === "number" && Number.isFinite(payload.risk_score)) {
      setRiskScore(payload.risk_score);
    }
    if (
      typeof payload?.warning_threshold === "number" &&
      Number.isFinite(payload.warning_threshold)
    ) {
      setWarningThreshold(payload.warning_threshold);
    }
    if (
      typeof payload?.auto_submit_threshold === "number" &&
      Number.isFinite(payload.auto_submit_threshold)
    ) {
      setAutoSubmitThreshold(payload.auto_submit_threshold);
    }
  };

  const executeSubmitRef = useRef<((isAuto?: boolean) => Promise<void>) | undefined>(undefined);

  useEffect(() => {
    executeSubmitRef.current = executeSubmit;
  });

  const emitProctorEvent = async (
    event: ProctorEventType,
    risk: number,
    metadata?: Record<string, unknown>,
  ) => {
    const ack = await proctorClientRef.current.sendEvent({
      event,
      risk,
      timestamp: new Date().toISOString(),
      quizId: Number(quizId),
      metadata,
    });

    if (!ack.ok && __DEV__) {
      console.log("Failed to emit proctor event", event, ack.message || "");
    }
  };

  const handleProctorDecision = (payload: ProctorDecision) => {
    applyRiskUpdate(payload);

    if (payload.action === "FORCE_SUBMIT") {
      void executeSubmitRef.current?.(true);
      return;
    }

    if (payload.action === "WARNING") {
      const now = Date.now();
      if (now - lastWarningAtRef.current < 12000) return;
      lastWarningAtRef.current = now;
      Alert.alert("Warning", "Suspicious behavior detected. Please focus on the exam.");
    }
  };

  function addRisk(points: number, event: ProctorEventType, cooldownMs = 3000) {
    if (status !== "in_progress") return;

    const now = Date.now();
    const last = riskCooldownMapRef.current[event] || 0;
    if (now - last < cooldownMs) return;

    riskCooldownMapRef.current[event] = now;
    void emitProctorEvent(event, points);
  }

  useEffect(() => {
    if (status !== "in_progress") {
      setRiskScore(0);
      riskCooldownMapRef.current = {};
    }
  }, [status, quizId]);

  useEffect(() => {
    if (status !== "in_progress") return;

    const client = proctorClientRef.current;

    const onConnect = () => {
      setSocketConnected(true);
      void client.join(Number(quizId)).then((ack) => {
        if (ack.ok) {
          if (typeof ack.risk_score === "number") {
            setRiskScore(ack.risk_score);
          }
          if (typeof ack.warning_threshold === "number") {
            setWarningThreshold(ack.warning_threshold);
          }
          if (typeof ack.auto_submit_threshold === "number") {
            setAutoSubmitThreshold(ack.auto_submit_threshold);
          }
        }
      });
    };
    const onDisconnect = () => setSocketConnected(false);

    client.socket.on("connect", onConnect);
    client.socket.on("disconnect", onDisconnect);

    let unsubscribeRisk = () => {};
    let unsubscribeDecision = () => {};
    let active = true;

    const startSession = async () => {
      const joinAck = await client.join(Number(quizId));

      if (!active) return;

      if (joinAck.ok) {
        setSocketConnected(client.socket.connected);
        if (typeof joinAck.risk_score === "number") {
          setRiskScore(joinAck.risk_score);
        }
        if (typeof joinAck.warning_threshold === "number") {
          setWarningThreshold(joinAck.warning_threshold);
        }
        if (typeof joinAck.auto_submit_threshold === "number") {
          setAutoSubmitThreshold(joinAck.auto_submit_threshold);
        }
      } else if (__DEV__) {
        console.log("Could not join proctor channel", joinAck.message || "");
      }

      unsubscribeRisk = client.onRiskUpdate(applyRiskUpdate);
      unsubscribeDecision = client.onDecision(handleProctorDecision);
    };

    void startSession();

    return () => {
      active = false;
      unsubscribeRisk();
      unsubscribeDecision();
      client.socket.off("connect", onConnect);
      client.socket.off("disconnect", onDisconnect);
      setSocketConnected(false);
    };
  }, [status, quizId]);

  useEffect(() => {
    if (status !== "in_progress") return;

    const timer = setInterval(() => {
      void proctorClientRef.current.heartbeat(Number(quizId)).then((ack) => {
        if (ack.ok) {
          applyRiskUpdate(ack as unknown as ProctorRiskUpdate);
        }
      });
    }, PROCTOR_HEARTBEAT_MS);

    return () => clearInterval(timer);
  }, [status, quizId]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (
        status === "in_progress" &&
        appState.current === "active" &&
        nextState !== "active"
      ) {
        addRisk(6, "APP_EXIT", 500);

        // Fallback: WebSockets are paused immediately when backgrounding.
        // Firing an HTTP request offers a significantly higher chance of arriving at the server.
        api.post(`/quizzes/${quizId}/violation`, {
          type: "APP_EXIT",
          timestamp: new Date().toISOString(),
        }).catch(() => {});

        // Force save current state / flag
        const currentQ = questions[currentQuestionIndex];
        if (currentQ) {
          setAnswers(prev => ({
            ...prev,
            [currentQ.id]: prev[currentQ.id]
          }));
        }

        setViolations((prev) => {
          const newVal = prev + 1;

          if (newVal > MAX_ALLOWED_APP_EXITS) {
            // Allowed exits are limited. Third exit forces submission.
            void executeSubmitRef.current?.(true);
            return newVal;
          }

          const remaining = MAX_ALLOWED_APP_EXITS - newVal;

          Alert.alert(
            "Warning",
            `You left the exam (${newVal}/${MAX_ALLOWED_APP_EXITS}). Remaining allowed exits: ${remaining}.`
          );

          return newVal;
        });
      }

      if (status === "in_progress" && appState.current.match(/inactive|background/) && nextState === "active") {
        fetchQuizData(); // Check logic on server
      }

      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [status, currentQuestionIndex, questions]);

  useEffect(() => {
    const sub = addScreenshotListener(() => {
      if (status === "in_progress") {
        addRisk(7, "SCREEN_CAPTURE_ATTEMPT", 2000);
      }
    });
    return () => sub.remove();
  }, [status]);

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

      const questionType = normalizeQuestionType(
        q.question_type ?? q.type ?? q.questionType,
      );

      let matchingRight: string[] = [];
      if (Array.isArray(q.matching_right)) {
        matchingRight = q.matching_right.map((item: unknown) => String(item));
      } else if (typeof q.matching_right === "string") {
        try {
          const parsedRight = JSON.parse(q.matching_right);
          if (Array.isArray(parsedRight)) {
            matchingRight = parsedRight.map((item: unknown) => String(item));
          }
        } catch {
          matchingRight = [];
        }
      }

      if (
        questionType === "matching" &&
        matchingRight.length === 0 &&
        typeof q.correct_answer === "string"
      ) {
        try {
          const fallbackRight = JSON.parse(q.correct_answer || "[]");
          if (Array.isArray(fallbackRight)) {
            matchingRight = fallbackRight.map((item: unknown) => String(item));
          }
        } catch {
          matchingRight = [];
        }
      }

      return {
        ...q,
        question_type: questionType,
        options:
          questionType === "true_false"
            ? ["True", "False"]
            : Array.isArray(parsedOpts)
              ? parsedOpts.map((item: unknown) => String(item))
              : [],
        matching_right: matchingRight,
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
          void executeSubmitRef.current?.(true);
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
      const fingerprint = await getDeviceFingerprint();
      const payload: any = { deviceFingerprint: fingerprint };
      if (accessPassword.trim()) {
        payload.password = accessPassword.trim();
      }

      const res = await api.post(
        `/quizzes/${quizId}/start`,
        payload,
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
    const answersArray = Object.entries(answers).map(([qId, value]) => {
      const q = questions.find((x) => x.id === Number(qId));
      if (!q) return null;
      const questionType = normalizeQuestionType(q.question_type);

      if (questionType === "short_answer" || questionType === "essay" || questionType === "fill_blanks") {
        return { questionId: Number(qId), textAnswer: value };
      } else if (questionType === "multiple_responses") {
        return { questionId: Number(qId), selectedOptions: value || [] };
      } else if (questionType === "matching") {
        return { questionId: Number(qId), matches: value || [] };
      } else {
        return { questionId: Number(qId), selectedOptionIndex: value };
      }
    }).filter(Boolean);

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
           <View style={styles.pendingIntroCard}>
             <Text style={styles.pendingIntroTitle}>Exam Instructions</Text>
             <Text style={styles.pendingIntroText}>Review the details below before you begin. Your answers will be saved during the attempt.</Text>
           </View>
           <View style={styles.pendingCard}>
             <Text style={styles.quizTitle}>{quizDetails.title}</Text>
             {quizDetails.description ? <Text style={styles.quizDesc}>{quizDetails.description}</Text> : null}
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

      <View style={styles.riskBarContainer}>
        <Text style={styles.riskBarText}>
          Risk Score: {riskScore.toFixed(2)} / {autoSubmitThreshold}
        </Text>
        <Text style={styles.riskSubText}>
          Warning: {warningThreshold} | Socket: {socketConnected ? "online" : "offline"}
        </Text>
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
              {(() => {
                const questionType = normalizeQuestionType(q.question_type);

                return (
                  <>
              {(questionType === 'mcq' || questionType === 'true_false') && (
                <>
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
                </>
              )}

              {questionType === 'multiple_responses' && (
                <>
                  <Text style={styles.selectOneText}>Select all that apply:</Text>
                  <View style={styles.optionsListMoodle}>
                     {q.options.map((opt, optIdx) => {
                        const selectedArr: number[] = answers[q.id] || [];
                        const isSelected = selectedArr.includes(optIdx);
                        const optionLabel = String.fromCharCode(97 + optIdx);
                        return (
                          <Pressable
                            key={optIdx}
                            style={styles.optionBtnMoodle}
                            onPress={() => {
                              const newArr = isSelected ? selectedArr.filter((i: number) => i !== optIdx) : [...selectedArr, optIdx];
                              setAnswers((prev: any) => ({ ...prev, [q.id]: newArr }));
                            }}
                          >
                            <View style={[styles.moodleCheckboxOuter, isSelected && styles.moodleCheckboxOuterSelected]}>
                               {isSelected && <Check size={14} color="#fff" />}
                            </View>
                            <Text style={styles.optionLetterLabel}>{optionLabel}.</Text>
                            <Text style={styles.optionTextMoodle}>{opt}</Text>
                          </Pressable>
                        );
                     })}
                  </View>
                </>
              )}

              {(questionType === 'short_answer' || questionType === 'essay' || questionType === 'fill_blanks') && (
                <>
                  <Text style={styles.selectOneText}>Your Answer:</Text>
                  <TextInput
                     style={[styles.textInputBox, questionType === 'essay' && { height: 120, textAlignVertical: 'top' }]}
                     multiline={questionType === 'essay'}
                     placeholder="Type your answer here..."
                     placeholderTextColor="#adb5bd"
                     value={answers[q.id] || ""}
                     onChangeText={(txt) => setAnswers((prev: any) => ({ ...prev, [q.id]: txt }))}
                  />
                </>
              )}

              {questionType === 'matching' && (
                <>
                  <Text style={styles.selectOneText}>Match the following:</Text>
                  <View style={{ marginTop: 10, gap: 12 }}>
                     {q.options.map((leftOpt, optIdx) => {
                        const rights = q.matching_right || [];
                        const selectedMatches = answers[q.id] || [];
                        return (
                          <View key={optIdx} style={styles.matchingRow}>
                            <Text style={styles.matchingLeft}>{leftOpt}</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                               {rights.map((rightOpt, rIdx) => {
                                  const isSelected = selectedMatches[optIdx] === rightOpt;
                                  return (
                                    <Pressable
                                      key={rIdx}
                                      style={[styles.matchChip, isSelected && styles.matchChipSelected]}
                                      onPress={() => {
                                        const newArr = [...selectedMatches];
                                        newArr[optIdx] = rightOpt;
                                        setAnswers((prev: any) => ({ ...prev, [q.id]: newArr }));
                                      }}
                                    >
                                      <Text style={[styles.matchChipText, isSelected && styles.matchChipTextSelected]}>{rightOpt}</Text>
                                    </Pressable>
                                  );
                               })}
                            </ScrollView>
                          </View>
                        );
                     })}
                  </View>
                </>
              )}
                  </>
                );
              })()}
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
  
  pendingContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24 },
  pendingIntroCard: {
    backgroundColor: BRAND.surface,
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  pendingIntroTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: BRAND.text,
    marginBottom: 4,
  },
  pendingIntroText: {
    fontSize: 13,
    color: BRAND.textMuted,
    lineHeight: 19,
  },
  pendingCard: {
    backgroundColor: BRAND.surface,
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    marginBottom: 16,
  },
  quizTitle: { fontSize: 23, fontWeight: "800", color: BRAND.text, marginBottom: 8 },
  quizDesc: { fontSize: 15, color: BRAND.textMuted, lineHeight: 22, marginBottom: 18 },
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
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2c7fcb",
  },
  startBtnText: { color: "#fff", fontSize: 20, fontWeight: "800" },

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
  riskBarContainer: {
    backgroundColor: '#fff3cd',
    borderBottomWidth: 1,
    borderBottomColor: '#ffe69c',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  riskBarText: {
    color: '#664d03',
    fontSize: 13,
    fontWeight: '700',
  },
  riskSubText: {
    color: '#7a6320',
    fontSize: 11,
    marginTop: 2,
  },

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
  moodleCheckboxOuter: {
    width: 20, height: 20, borderRadius: 4,
    borderWidth: 1, borderColor: "#495057",
    justifyContent: "center", alignItems: "center",
    marginRight: 8, marginTop: 2, backgroundColor: '#fff',
  },
  moodleCheckboxOuterSelected: { borderColor: "#007bff", backgroundColor: "#007bff", borderWidth: 2 },
  textInputBox: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 6,
    padding: 12,
    fontSize: 16,
    color: '#212529',
    minHeight: 50,
  },
  matchingRow: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  matchingLeft: {
    fontSize: 16,
    color: '#212529',
    fontWeight: '600',
  },
  matchChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dee2e6',
    marginRight: 8,
  },
  matchChipSelected: {
    backgroundColor: '#e7f1ff',
    borderColor: '#0d6efd',
  },
  matchChipText: {
    fontSize: 14,
    color: '#495057',
  },
  matchChipTextSelected: {
    color: '#0d6efd',
    fontWeight: '600',
  },
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
