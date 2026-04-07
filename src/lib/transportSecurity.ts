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
  return transportBlocked;
}

export function blockTransport(reason = "transport_security_failed") {
  transportBlocked = true;
  if (!__DEV__) {
    console.error(`Transport blocked: ${reason}`);
  }
}

export async function initializeTransportSecurity(): Promise<PinInitResult> {
  if (initialized) {
    return transportBlocked
      ? { ok: false, reason: "transport_already_blocked" }
      : { ok: true };
  }

  initialized = true;

  const executionEnvironment = String((Constants as any)?.executionEnvironment || "").toLowerCase();
  const runningExpoGo = executionEnvironment === "storeclient" || String((Constants as any)?.appOwnership || "").toLowerCase() === "expo";

  const apiDomain = getApiDomain();
  const pins = getConfiguredPins();

  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const sslPinning = require("react-native-ssl-public-key-pinning");

    if (!pins.length) {
      blockTransport("missing_ssl_pins");
      return { ok: false, reason: "missing_ssl_pins" };
    }

    await sslPinning.initializeSslPinning({
      [apiDomain]: {
        includeSubdomains: true,
        publicKeyHashes: pins,
      },
    });

    return { ok: true };
  } catch (error: any) {
    if (__DEV__ && runningExpoGo) {
      // Expo Go cannot load native pinning modules; do not block local development.
      return { ok: true };
    }

    blockTransport("ssl_pinning_init_failed");
    return {
      ok: false,
      reason: error?.message || "ssl_pinning_init_failed",
    };
  }
}
