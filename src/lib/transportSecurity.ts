import Constants from "expo-constants";

type PinInitResult = {
  ok: boolean;
  reason?: string;
};

let transportBlocked = false;
let initialized = false;

function getApiDomain() {
  const apiUrl = String(process.env.EXPO_PUBLIC_API_URL || "https://attendqr.tech/api").trim();
  try {
    return new URL(apiUrl).hostname;
  } catch {
    return "attendqr.tech";
  }
}

function getConfiguredPins() {
  const raw = String(process.env.EXPO_PUBLIC_SSL_PINS || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isTransportBlocked() {
  return false;
}

export function blockTransport(reason = "transport_security_failed") {
  // disabled for testing
}

export async function initializeTransportSecurity(): Promise<PinInitResult> {
  // disabled for testing
  return { ok: true };
}
