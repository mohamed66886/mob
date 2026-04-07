import Constants from "expo-constants";
import { Platform } from "react-native";

type RiskLevel = "low" | "medium" | "high";

export type RuntimeRiskReport = {
  level: RiskLevel;
  score: number;
  reasons: string[];
};

export function shouldEnforceRuntimeGuard() {
  const appOwnership = String((Constants as any)?.appOwnership || "").toLowerCase();
  const executionEnvironment = String((Constants as any)?.executionEnvironment || "").toLowerCase();
  const runningExpoGo = appOwnership === "expo" || executionEnvironment === "storeclient";
  return !__DEV__ && !runningExpoGo;
}

function containsAny(value: string, patterns: string[]) {
  const normalized = String(value || "").toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

export function evaluateRuntimeRisk(): RuntimeRiskReport {
  const reasons: string[] = [];
  let score = 0;

  const appOwnership = String((Constants as any)?.appOwnership || "").toLowerCase();
  const executionEnvironment = String((Constants as any)?.executionEnvironment || "").toLowerCase();
  const debuggerHost = String((Constants as any)?.expoConfig?.hostUri || "");
  const runtimeGlobal = globalThis as any;
  const hasHermes = Boolean(runtimeGlobal?.HermesInternal);
  const releaseChannel = String((Constants as any)?.expoConfig?.releaseChannel || "").toLowerCase();
  const executionEnvironmentDetails = String((Constants as any)?.executionEnvironment || "").toLowerCase();
  const platformConstants = (Platform as any)?.constants || {};

  const model = String(platformConstants?.Model || platformConstants?.model || "");
  const brand = String(platformConstants?.Brand || platformConstants?.brand || "");
  const fingerprint = String(platformConstants?.Fingerprint || platformConstants?.fingerprint || "");
  const deviceName = String(platformConstants?.Device || platformConstants?.device || "");

  if (__DEV__) {
    score += 45;
    reasons.push("Developer mode is enabled.");
  }

  if (appOwnership === "expo" || executionEnvironment === "storeclient") {
    score += 25;
    reasons.push("Running inside Expo Go instead of a hardened build.");
  }

  if (debuggerHost) {
    score += 20;
    reasons.push("Debug bridge host detected.");
  }

  if (containsAny(executionEnvironmentDetails, ["bare", "standalone"]) && releaseChannel.includes("dev")) {
    score += 15;
    reasons.push("Development release channel detected.");
  }

  if (runtimeGlobal?.__REMOTEDEV__ || runtimeGlobal?.__REDUX_DEVTOOLS_EXTENSION__) {
    score += 20;
    reasons.push("Debug tooling hooks are active.");
  }

  if (runtimeGlobal?.__DEVTOOLS__ || runtimeGlobal?.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    score += 15;
    reasons.push("React devtools hook detected.");
  }

  if (runtimeGlobal?.HermesInternal?.hasPromise?.toString?.().includes("[native code]") === false) {
    score += 20;
    reasons.push("Runtime hook mismatch detected.");
  }

  const syncHookSource = String(runtimeGlobal?.nativeCallSyncHook || "").toLowerCase();
  const possibleFridaArtifacts = [
    syncHookSource,
    String(runtimeGlobal?.Frida || "").toLowerCase(),
    String(runtimeGlobal?.frida || "").toLowerCase(),
    String(runtimeGlobal?.__frida || "").toLowerCase(),
  ].join("|");

  if (containsAny(possibleFridaArtifacts, ["frida", "gum-js-loop", "frida-agent"])) {
    score += 40;
    reasons.push("Instrumentation hook pattern detected.");
  }

  if (containsAny(`${model}|${brand}|${fingerprint}|${deviceName}`, ["emulator", "simulator", "generic", "sdk_gphone", "vbox", "goldfish"])) {
    score += 40;
    reasons.push("Emulator or simulator environment detected.");
  }

  if (containsAny(`${fingerprint}|${deviceName}`, ["test-keys", "magisk", "supersu", "xposed", "zygisk"])) {
    score += 45;
    reasons.push("Root/Jailbreak indicators detected.");
  }

  if (runtimeGlobal?.__turboModuleProxy == null) {
    score += 10;
    reasons.push("Runtime integrity mismatch detected.");
  }

  if (!hasHermes) {
    score += 5;
    reasons.push("Unexpected JS runtime profile.");
  }

  if (score > 100) score = 100;

  const level: RiskLevel = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
  return { level, score, reasons };
}
