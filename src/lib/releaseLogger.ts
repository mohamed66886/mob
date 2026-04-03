import AsyncStorage from "@react-native-async-storage/async-storage";

const RELEASE_LOGS_KEY = "attendqr_release_logs_v1";
const MAX_LOG_ENTRIES = 200;

export type ReleaseLogLevel = "info" | "warn" | "error";

type ReleaseLogEntry = {
  ts: string;
  level: ReleaseLogLevel;
  message: string;
  details?: string;
};

function stringifyDetails(value: unknown) {
  if (value == null) return undefined;
  if (value instanceof Error) {
    return `${value.name}: ${value.message}\n${value.stack || ""}`.trim();
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export async function appendReleaseLog(
  level: ReleaseLogLevel,
  message: string,
  details?: unknown,
) {
  const entry: ReleaseLogEntry = {
    ts: new Date().toISOString(),
    level,
    message: String(message || "Unknown log message"),
    details: stringifyDetails(details),
  };

  try {
    const raw = await AsyncStorage.getItem(RELEASE_LOGS_KEY);
    const parsed: ReleaseLogEntry[] = raw ? JSON.parse(raw) : [];
    const next = [...parsed.slice(-(MAX_LOG_ENTRIES - 1)), entry];
    await AsyncStorage.setItem(RELEASE_LOGS_KEY, JSON.stringify(next));
  } catch {
    // Never block app flow because of logging.
  }
}

export async function getReleaseLogs() {
  const raw = await AsyncStorage.getItem(RELEASE_LOGS_KEY);
  return raw ? (JSON.parse(raw) as ReleaseLogEntry[]) : [];
}

export async function clearReleaseLogs() {
  await AsyncStorage.removeItem(RELEASE_LOGS_KEY);
}

let hasInstalledGlobalHandlers = false;

export function installGlobalErrorLogging() {
  if (hasInstalledGlobalHandlers) return;
  hasInstalledGlobalHandlers = true;

  const errorUtils = (globalThis as any)?.ErrorUtils;
  const previousHandler = errorUtils?.getGlobalHandler?.();

  if (errorUtils?.setGlobalHandler) {
    errorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
      appendReleaseLog("error", `GlobalError fatal=${Boolean(isFatal)}`, error);
      if (typeof previousHandler === "function") {
        previousHandler(error, isFatal);
      }
    });
  }

  const maybeProcess = (globalThis as any)?.process;
  if (maybeProcess?.on) {
    maybeProcess.on("unhandledRejection", (reason: unknown) => {
      appendReleaseLog("error", "UnhandledPromiseRejection", reason);
    });
  }
}
