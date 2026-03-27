import axios from "axios";
import { LoginResponse, User } from "../types/auth";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "https://attendqr.tech/api";
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
    return `${API_ORIGIN}${value}`;
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
    id: data.id,
    name: data.name,
    username: data.username,
    role: data.role,
    university_id: data.university_id,
    college_id: data.college_id,
  };

  // Extract logos and names from role-specific nested objects
  const roleData = data[data.role]; // e.g., data.student, data.doctor, data.employee
  if (roleData) {
    user.college_logo = resolveMediaUrl(roleData.college_logo);
    user.university_logo = resolveMediaUrl(roleData.university_logo);
    user.college_name = roleData.college_name;
    user.university_name = roleData.university_name;
  }
  
  // For college_admin and employee, logos might be at top level
  if (data.college_logo) user.college_logo = resolveMediaUrl(data.college_logo);
  if (data.university_logo) user.university_logo = resolveMediaUrl(data.university_logo);
  if (data.college_name) user.college_name = data.college_name;
  if (data.university_name) user.university_name = data.university_name;

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
