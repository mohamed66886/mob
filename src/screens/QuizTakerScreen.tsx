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
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  useAudioRecorder,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from "expo-audio";

import { api } from "../lib/api";
import { User } from "../types/auth";
import { usePreventScreenCapture, addScreenshotListener } from "expo-screen-capture";

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

const RISK_AUTO_SUBMIT_THRESHOLD = 10;
const RISK_SCORE_CAP = 100;
const FACE_ANALYSIS_INTERVAL_MS = 2000;
const AI_FRAME_INTERVAL_MS = 2500;
const VOICE_ANALYSIS_INTERVAL_MS = 2500;
const VOICE_METERING_THRESHOLD_DB = -35;
const VOICE_SPEECH_MIN_DB = -30;
const VOICE_SPEECH_MAX_DB = -10;
const LOW_RISK_FRAME_COOLDOWN_MS = 6000;
const MAX_ALLOWED_APP_EXITS = 2;

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
  const [aiViolations, setAiViolations] = useState(0);
  const [riskScore, setRiskScore] = useState(0);
  const [frameAiRisk, setFrameAiRisk] = useState<number | null>(null);
  const [voiceLevelDb, setVoiceLevelDb] = useState<number | null>(null);
  const [faces, setFaces] = useState<any[]>([]);
  const [noFaceCount, setNoFaceCount] = useState(0);
  const [hasSeenFaceSignal, setHasSeenFaceSignal] = useState(false);
  const riskCooldownMapRef = useRef<Record<string, number>>({});
  const didAutoSubmitForRiskRef = useRef(false);
  const lastAutoSubmitAttemptAtRef = useRef(0);
  const cameraRef = useRef<any>(null);
  const frameAnalysisBusyRef = useRef(false);
  const voiceAnalysisBusyRef = useRef(false);
  const lastFrameAnalyzeAtRef = useRef(0);

  const [permission, requestPermission] = useCameraPermissions();
  const recorder = useAudioRecorder({
    ...RecordingPresets.LOW_QUALITY,
    isMeteringEnabled: true,
  });
  const appState = useRef(AppState.currentState);

  const reportViolation = async (type: string) => {
    try {
      await api.post(`/quizzes/${quizId}/violation`, {
        type,
        timestamp: new Date().toISOString(),
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      console.log("Violation report failed");
    }
  };

  async function handleAutoSubmit(trigger = "RISK_THRESHOLD") {
    if (status !== "in_progress" || submitting) return;

    const now = Date.now();
    // Allow retrying auto-submit if backend asks to continue, but avoid spamming.
    if (now - lastAutoSubmitAttemptAtRef.current < 8000) return;
    lastAutoSubmitAttemptAtRef.current = now;

    try {
      const decisionRes = await api.post(
        `/quizzes/${quizId}/risk/final-decision`,
        {
          trigger,
          risk_score: riskScore,
          frame_ai_risk: frameAiRisk,
          voice_level_db: voiceLevelDb,
          timestamp: new Date().toISOString(),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const shouldSubmit =
        decisionRes?.data?.action === "submit" ||
        decisionRes?.data?.force_submit === true;

      if (!shouldSubmit) {
        didAutoSubmitForRiskRef.current = false;
        return;
      }
    } catch (err: any) {
      // Fail-safe for environments where decision endpoint is not yet deployed.
      if (err?.response?.status !== 404) {
        console.log("Risk final decision unavailable", err?.response?.status || "");
      }
    }

    executeSubmit(true);
  }

  function addRisk(points: number, reason: string, cooldownMs = 3000) {
    if (status !== "in_progress") return;

    const now = Date.now();
    const last = riskCooldownMapRef.current[reason] || 0;
    if (now - last < cooldownMs) return;

    riskCooldownMapRef.current[reason] = now;
    reportViolation(reason);

    setRiskScore((prev) => {
      const next = Math.min(RISK_SCORE_CAP, prev + points);
      if (
        next >= RISK_AUTO_SUBMIT_THRESHOLD &&
        !didAutoSubmitForRiskRef.current
      ) {
        didAutoSubmitForRiskRef.current = true;
        void handleAutoSubmit(reason);
      }
      return next;
    });
  }

  function normalizeRiskToTen(raw: unknown): number {
    const value = Number(raw);
    if (!Number.isFinite(value)) return 0;
    const scaled = value > 1 ? value : value * 10;
    return Math.min(10, Math.max(0, scaled));
  }

  const analyzeCurrentFrame = async () => {
    if (
      status !== "in_progress" ||
      !permission?.granted ||
      !cameraRef.current ||
      frameAnalysisBusyRef.current
    ) {
      return;
    }

    const now = Date.now();
    const dynamicMinInterval =
      frameAiRisk !== null && frameAiRisk < 2
        ? LOW_RISK_FRAME_COOLDOWN_MS
        : AI_FRAME_INTERVAL_MS;

    if (now - lastFrameAnalyzeAtRef.current < dynamicMinInterval) return;
    if (frameAiRisk !== null && frameAiRisk < 2 && Math.random() > 0.4) return;
    lastFrameAnalyzeAtRef.current = now;

    frameAnalysisBusyRef.current = true;
    try {
      const takePictureFn =
        cameraRef.current?.takePictureAsync || cameraRef.current?.takePicture;
      if (typeof takePictureFn !== "function") return;

      const shot = await takePictureFn.call(cameraRef.current, {
        quality: 0.2,
        base64: true,
        skipProcessing: true,
      });

      const imageBase64 = shot?.base64;
      if (!imageBase64) return;

      const res = await api.post(
        `/quizzes/${quizId}/ai/analyze-frame`,
        {
          image: imageBase64,
          timestamp: new Date().toISOString(),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const data = res?.data ?? {};

      if (typeof data.risk === "number" && Number.isFinite(data.risk)) {
        const normalized = normalizeRiskToTen(data.risk);
        setFrameAiRisk(normalized);
        if (normalized >= 0.5) {
          addRisk(Math.min(4, Math.max(1, normalized)), "AI_FRAME_RISK", 3000);
        }
      }

      const faceCountRaw =
        typeof data.face_count === "number"
          ? data.face_count
          : typeof data.facesCount === "number"
            ? data.facesCount
            : undefined;

      if (typeof faceCountRaw === "number" && Number.isFinite(faceCountRaw)) {
        const count = Math.max(0, Math.floor(faceCountRaw));
        const yaw = Number(data.yaw ?? data.headPose?.yaw ?? 0);
        const pitch = Number(data.pitch ?? data.headPose?.pitch ?? 0);

        const mappedFaces = Array.from({ length: count }, (_, idx) =>
          idx === 0 ? { yawAngle: yaw, pitchAngle: pitch } : {},
        );
        setFaces(mappedFaces);
      }

      if (data.no_face === true) addRisk(1, "NO_FACE", 5000);
      if (data.multiple_faces === true) addRisk(5, "MULTIPLE_FACES", 3000);
      if (data.looking_away === true) addRisk(2, "LOOKING_AWAY", 4000);
    } catch (err: any) {
      // Backend AI endpoint may not exist in all environments; fail soft.
      if (err?.response?.status !== 404) {
        console.log("AI frame analysis unavailable", err?.response?.status || "");
      }
    } finally {
      frameAnalysisBusyRef.current = false;
    }
  };

  const analyzeVoiceSignal = async () => {
    if (status !== "in_progress" || voiceAnalysisBusyRef.current) return;

    voiceAnalysisBusyRef.current = true;
    try {
      const recorderState = recorder.getStatus();
      const metering = recorderState?.metering;

      if (typeof metering === "number" && Number.isFinite(metering)) {
        setVoiceLevelDb(metering);

        if (metering > VOICE_SPEECH_MIN_DB && metering < VOICE_SPEECH_MAX_DB) {
          addRisk(1, "VOICE_ACTIVITY", 4000);
        }

        try {
          const res = await api.post(
            `/quizzes/${quizId}/ai/analyze-audio-signal`,
            {
              metering,
              timestamp: new Date().toISOString(),
            },
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );

          const aiAudioRisk = Number(res?.data?.risk ?? 0);
          if (Number.isFinite(aiAudioRisk) && aiAudioRisk > 0) {
            const normalized = aiAudioRisk <= 1 ? aiAudioRisk * 6 : aiAudioRisk / 20;
            addRisk(Math.min(3, Math.max(1, normalized)), "AI_AUDIO_RISK", 4000);
          }
        } catch (err: any) {
          if (err?.response?.status !== 404) {
            console.log("AI audio analysis unavailable", err?.response?.status || "");
          }
        }
      }
    } finally {
      voiceAnalysisBusyRef.current = false;
    }
  };

  useEffect(() => {
    if (status !== "in_progress") {
      setRiskScore(0);
      setNoFaceCount(0);
      setHasSeenFaceSignal(false);
      riskCooldownMapRef.current = {};
      didAutoSubmitForRiskRef.current = false;
    }
  }, [status, quizId]);

  useEffect(() => {
    if (faces.length > 0 && !hasSeenFaceSignal) {
      setHasSeenFaceSignal(true);
    }
  }, [faces, hasSeenFaceSignal]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (
        status === "in_progress" &&
        appState.current === "active" &&
        nextState !== "active"
      ) {
        addRisk(6, "APP_EXIT", 500);

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
            void executeSubmit(true);
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
    if (status === "in_progress" && !permission?.granted) {
      requestPermission();
    }
  }, [status, permission]);

  useEffect(() => {
    if (status === "in_progress" && permission && !permission.granted && permission.status !== "undetermined") {
      addRisk(10, "CAMERA_BLOCKED", 0);
    }
  }, [permission, status]);

  useEffect(() => {
    let mounted = true;

    const startVoiceSampling = async () => {
      if (status !== "in_progress") return;

      try {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          addRisk(3, "MIC_BLOCKED", 5000);
          return;
        }

        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });

        await recorder.prepareToRecordAsync();
        if (mounted && !recorder.isRecording) {
          recorder.record();
        }
      } catch {
        addRisk(2, "MIC_INIT_FAILED", 5000);
      }
    };

    void startVoiceSampling();

    return () => {
      mounted = false;
      if (recorder.isRecording) {
        void recorder.stop();
      }
      (recorder as any).remove?.();
    };
  }, [status, recorder]);

  // AI face analysis is sampled over time to avoid noisy per-frame decisions.
  useEffect(() => {
    if (status !== "in_progress") return;

    const timer = setInterval(() => {
      if (faces.length === 0) {
        if (hasSeenFaceSignal) {
          setNoFaceCount((prev) => prev + 1);
          addRisk(1, "NO_FACE", 5000);
        }
        return;
      }

      setNoFaceCount(0);

      if (faces.length > 1) {
        setAiViolations((v) => v + 1);
        addRisk(5, "MULTIPLE_FACES", 3000);
      }

      const yaw = faces[0]?.yawAngle ?? 0;
      const pitch = faces[0]?.pitchAngle ?? 0;
      if (Math.abs(yaw) > 25 || Math.abs(pitch) > 25) {
        addRisk(2, "LOOKING_AWAY", 4000);
      }
    }, FACE_ANALYSIS_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [faces, hasSeenFaceSignal, status]);

  useEffect(() => {
    const sub = addScreenshotListener(() => {
      if (status === "in_progress") {
        addRisk(3, "SCREEN_CAPTURE_BLOCKED", 2000);
      }
    });
    return () => sub.remove();
  }, [status]);

  useEffect(() => {
    if (status !== "in_progress") return;

    const timer = setInterval(() => {
      void analyzeCurrentFrame();
    }, AI_FRAME_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [status, permission?.granted]);

  useEffect(() => {
    if (status !== "in_progress") return;

    const timer = setInterval(() => {
      void analyzeVoiceSignal();
    }, VOICE_ANALYSIS_INTERVAL_MS);

    return () => clearInterval(timer);
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

  const startupCheck = async () => {
    try {
      // Just hit start. If it creates a new one, great. If it already exists, it returns those fields anyway!
      // This is a common idempotent pattern in LMS systems.
      const fingerprint = await getDeviceFingerprint();
      const startRes = await api.post(`/quizzes/${quizId}/start`, { deviceFingerprint: fingerprint }, {
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
          void handleAutoSubmit("TIME_LIMIT");
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
      {status === "in_progress" && permission?.granted && (
        <CameraView
          ref={cameraRef}
          style={styles.cameraFloating}
          facing="front"
        />
      )}
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
          Risk Score: {riskScore}/{RISK_AUTO_SUBMIT_THRESHOLD}
        </Text>
        <Text style={styles.riskSubText}>
          Frame AI: {frameAiRisk !== null ? frameAiRisk.toFixed(2) : "-"} | Voice dB: {voiceLevelDb !== null ? voiceLevelDb.toFixed(1) : "-"}
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
  cameraFloating: {
    width: 96,
    height: 128,
    position: "absolute",
    right: 10,
    bottom: 96,
    zIndex: 999,
    elevation: 999,
    borderRadius: 10,
    overflow: "hidden",
  },
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
