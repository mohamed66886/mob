import axios from "axios";
import { LoginResponse, User } from "../types/auth";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "https://attendqr.tech/api";
const SOCKET_BASE_URL = BASE_URL.replace(/\/api\/?$/, "");

export const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export const realtimeBaseURL = SOCKET_BASE_URL;

export async function login(username: string, password: string) {
  const response = await api.post<LoginResponse>("/auth/login", {
    username: username.trim(),
    password,
  });

  return response.data;
}

export async function getMe(token: string) {
  const response = await api.get<User>("/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
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
