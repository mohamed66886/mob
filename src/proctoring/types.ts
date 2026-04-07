export type ProctorEventType =
  | "NO_FACE"
  | "MULTIPLE_FACES"
  | "LOOKING_AWAY"
  | "VOICE_ACTIVITY"
  | "APP_EXIT"
  | "SCREEN_CAPTURE_ATTEMPT"
  | "CAMERA_BLOCKED"
  | "MIC_BLOCKED";

export type ProctorEventPayload = {
  event: ProctorEventType;
  risk: number;
  timestamp: string;
  quizId: number;
  metadata?: Record<string, unknown>;
};

export type ProctorRiskUpdate = {
  risk_score: number;
  warning_threshold: number;
  auto_submit_threshold: number;
  updated_at: string;
};

export type ProctorDecision = ProctorRiskUpdate & {
  action: "WARNING" | "FORCE_SUBMIT";
  reason: string;
  event?: ProctorEventType;
};

export type VisionInferenceResult = {
  faceCount: number;
  yawDeg: number;
  pitchDeg: number;
  eyesOffScreen?: boolean;
};

export interface OnDeviceVisionEngine {
  analyzeFrame: () => Promise<VisionInferenceResult | null>;
}
