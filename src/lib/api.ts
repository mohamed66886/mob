import axios from "axios";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { LoginResponse, User } from "../types/auth";

function resolveDevBaseUrl() {
  const envUrl = String(process.env.EXPO_PUBLIC_API_URL || "").trim();
  const isProdEnv = /attendqr\.tech\/api\/?$/i.test(envUrl);

  if (!__DEV__ || !isProdEnv) {
    return envUrl || "https://attendqr.tech/api";
  }

  const hostUri =
    (Constants as any)?.expoConfig?.hostUri ||
    (Constants as any)?.manifest2?.extra?.expoGo?.debuggerHost ||
    "";
  const hostIp = String(hostUri).split(":")[0];

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
  },
});

export const realtimeBaseURL = SOCKET_BASE_URL;

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
  const response = await api.post<LoginResponse>("/auth/login", {
    username: username.trim(),
    password,
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
