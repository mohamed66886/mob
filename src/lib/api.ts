import axios from "axios";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { LoginResponse, User } from "../types/auth";
import {
  clearRefreshToken,
  getOrCreateDeviceId,
  getRefreshToken,
  saveRefreshToken,
} from "./tokenStorage";
import { isTransportBlocked } from "./transportSecurity";

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

function buildRequestNonce() {
  if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
    return (crypto as any).randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 18)}`;
}

function resolveDevBaseUrl() {
  const envUrl = String(process.env.EXPO_PUBLIC_API_URL || "").trim();
  if (!__DEV__) {
    return envUrl || "https://attendqr.tech/api";
  }

  const hostUri =
    (Constants as any)?.expoConfig?.hostUri ||
    (Constants as any)?.manifest2?.extra?.expoGo?.debuggerHost ||
    "";
  const hostIp = String(hostUri).split(":")[0];

  if (envUrl) {
    if (hostIp && /localhost|127\.0\.0\.1/i.test(envUrl)) {
      return envUrl.replace(/localhost|127\.0\.0\.1/gi, hostIp);
    }
    return envUrl;
  }

  if (hostIp) {
    return `http://${hostIp}:5001/api`;
  }

  if (Platform.OS === "android") {
    return "http://10.0.2.2:5001/api";
  }

  return "http://localhost:5001/api";
}

const BASE_URL = resolveDevBaseUrl();
const SOCKET_BASE_URL = BASE_URL.replace(/\/api\/?$/, "");
const API_ORIGIN = SOCKET_BASE_URL;

export const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
    "Origin": "https://attendqr.tech",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36"
  },
});

type RetryableRequestConfig = {
  _retry?: boolean;
  headers?: Record<string, string>;
  url?: string;
};

export function setAccessToken(token: string | null) {
  accessToken = token && token.trim() ? token : null;
}

export function getAccessToken() {
  return accessToken;
}

export const realtimeBaseURL = SOCKET_BASE_URL;

export async function logRuntimeSecurityEvent(payload: {
  eventType: string;
  severity?: "low" | "medium" | "high" | "critical";
  message?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const deviceId = await getOrCreateDeviceId();
    await api.post(
      "/security/runtime-events",
      {
        eventType: payload.eventType,
        severity: payload.severity || "high",
        message: payload.message || null,
        deviceId,
        metadata: payload.metadata || {},
      },
      {
        headers: {
          "x-device-id": deviceId,
          "x-client-platform": "mobile",
        },
      },
    );
  } catch {
    // Never interrupt guard flow because telemetry fails.
  }
}

export async function refreshMobileAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      setAccessToken(null);
      return null;
    }

    const deviceId = await getOrCreateDeviceId();

    try {
      const response = await api.post<{ token?: string; refreshToken?: string }>(
        "/auth/refresh",
        {
          refreshToken,
          device_id: deviceId,
        },
        {
          headers: {
            "x-device-id": deviceId,
            "x-client-platform": "mobile",
          },
        },
      );

      const nextAccessToken = String(response.data?.token || "").trim();
      const nextRefreshToken = String(response.data?.refreshToken || "").trim();

      if (!nextAccessToken || !nextRefreshToken) {
        await clearRefreshToken();
        setAccessToken(null);
        return null;
      }

      await saveRefreshToken(nextRefreshToken);
      setAccessToken(nextAccessToken);
      return nextAccessToken;
    } catch {
      await clearRefreshToken();
      setAccessToken(null);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

api.interceptors.request.use(async (config) => {
  if (isTransportBlocked()) {
    return Promise.reject(new Error("Network transport blocked by certificate pinning policy."));
  }

  const deviceId = await getOrCreateDeviceId();
  const nonce = buildRequestNonce();
  const timestamp = String(Date.now());

  if (config.headers && typeof config.headers.set === "function") {
    config.headers.set("x-device-id", deviceId);
    config.headers.set("x-client-platform", "mobile");
    config.headers.set("x-nonce", nonce);
    config.headers.set("x-timestamp", timestamp);
    if (accessToken) {
      config.headers.set("Authorization", `Bearer ${accessToken}`);
    }
  } else {
    config.headers = config.headers || {};
    config.headers["x-device-id"] = deviceId;
    config.headers["x-client-platform"] = "mobile";
    config.headers["x-nonce"] = nonce;
    config.headers["x-timestamp"] = timestamp;
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = Number(error?.response?.status || 0);
    const originalRequest = (error?.config || {}) as RetryableRequestConfig;
    const requestUrl = String(originalRequest?.url || "");
    const isLoginRequest = requestUrl.includes("/auth/login");
    const isRefreshRequest = requestUrl.includes("/auth/refresh");

    if (status === 401 && !isLoginRequest && !isRefreshRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshed = await refreshMobileAccessToken();

      if (refreshed) {
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${refreshed}`;
        return api.request(originalRequest);
      }
    }

    return Promise.reject(error);
  },
);

export function resolveMediaUrl(raw?: string | null) {
  const value = (raw || "").trim();
  if (!value) return undefined;

  if (/^https?:\/\//i.test(value) || value.startsWith("data:") || value.startsWith("blob:")) {
    return value;
  }

  if (value.startsWith("/")) {
    // Some older rows may contain "/api/uploads/...". Static files are served at "/uploads".
    const normalizedPath = value.startsWith("/api/") ? value.slice(4) : value;
    return `${API_ORIGIN}${normalizedPath}`;
  }

  return `${API_ORIGIN}/${value}`;
}

export async function login(username: string, password: string) {
  const deviceId = await getOrCreateDeviceId();
  const response = await api.post<LoginResponse>("/auth/login", {
    username: username.trim(),
    password,
    device_id: deviceId,
  }, {
    headers: {
      "x-device-id": deviceId,
      "x-client-platform": "mobile",
    },
  });

  return response.data;
}

export async function getMe(token: string) {
  const response = await api.get<any>("/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = response.data;
  
  // Flatten nested role-specific data into User object
  const user: User = {
    id: data?.id,
    name: data?.name || "User",
    username: data?.username,
    role: data?.role || "student",
    university_id: data?.university_id,
    college_id: data?.college_id,
  };

  // Extract logos and names from role-specific nested objects
  const role = String(data?.role || "").toLowerCase().trim();
  const roleData = role ? data?.[role] : null;
  
  if (roleData && typeof roleData === "object") {
    user.college_logo = resolveMediaUrl(roleData.college_logo);
    user.university_logo = resolveMediaUrl(roleData.university_logo);
    user.college_name = roleData.college_name || data?.college_name;
    user.university_name = roleData.university_name || data?.university_name;
  }
  
  // For college_admin and employee, logos might be at top level
  if (data?.college_logo) user.college_logo = resolveMediaUrl(data.college_logo);
  if (data?.university_logo) user.university_logo = resolveMediaUrl(data.university_logo);
  if (data?.college_name) user.college_name = data.college_name;
  if (data?.university_name) user.university_name = data.university_name;

  return user;
}

type RegisterDeviceTokenPayload = {
  token: string;
  platform: "ios" | "android" | "unknown";
  device_id?: string;
};

export async function registerDeviceToken(
  authToken: string,
  payload: RegisterDeviceTokenPayload,
) {
  const response = await api.post(
    "/notifications/device-token",
    payload,
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    },
  );

  return response.data;
}

export async function unregisterDeviceToken(authToken: string, token: string) {
  const response = await api.delete("/notifications/device-token", {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
    data: {
      token,
    },
  });

  return response.data;
}
