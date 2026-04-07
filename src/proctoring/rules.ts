import { ProctorEventType, VisionInferenceResult } from "./types";

export const PROCTOR_EVENT_WEIGHTS: Record<ProctorEventType, number> = {
  NO_FACE: 3,
  MULTIPLE_FACES: 5,
  LOOKING_AWAY: 2,
  VOICE_ACTIVITY: 2,
  APP_EXIT: 6,
  SCREEN_CAPTURE_ATTEMPT: 7,
  CAMERA_BLOCKED: 10,
  MIC_BLOCKED: 4,
};

export const SMART_SAMPLING = {
  lowRiskIntervalMs: 3000,
  mediumRiskIntervalMs: 2000,
  highRiskIntervalMs: 1000,
};

export function getSamplingIntervalMs(riskScore: number): number {
  if (riskScore >= 15) return SMART_SAMPLING.highRiskIntervalMs;
  if (riskScore >= 7) return SMART_SAMPLING.mediumRiskIntervalMs;
  return SMART_SAMPLING.lowRiskIntervalMs;
}

export function shouldSampleFrame(riskScore: number): boolean {
  if (riskScore >= 15) return true;
  if (riskScore >= 7) return Math.random() < 0.8;
  return Math.random() < 0.7;
}

export function inferVisionEvents(result: VisionInferenceResult) {
  const events: Array<{ event: ProctorEventType; risk: number }> = [];

  if (result.faceCount === 0) {
    events.push({ event: "NO_FACE", risk: PROCTOR_EVENT_WEIGHTS.NO_FACE });
  }

  if (result.faceCount > 1) {
    events.push({ event: "MULTIPLE_FACES", risk: PROCTOR_EVENT_WEIGHTS.MULTIPLE_FACES });
  }

  if (
    Math.abs(result.yawDeg) > 25 ||
    Math.abs(result.pitchDeg) > 25 ||
    result.eyesOffScreen === true
  ) {
    events.push({ event: "LOOKING_AWAY", risk: PROCTOR_EVENT_WEIGHTS.LOOKING_AWAY });
  }

  return events;
}
