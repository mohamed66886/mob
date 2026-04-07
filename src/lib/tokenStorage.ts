import * as SecureStore from "expo-secure-store";

const LEGACY_TOKEN_KEY = "attendqr_token";
const REFRESH_TOKEN_KEY = "attendqr_refresh_token";
const DEVICE_ID_KEY = "attendqr_device_id";

export async function getRefreshToken() {
  const direct = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  if (direct) return direct;

  // Backward compatibility for previously stored single token sessions.
  return SecureStore.getItemAsync(LEGACY_TOKEN_KEY);
}

export async function saveRefreshToken(token: string) {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  await SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY);
}

export async function clearRefreshToken() {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY);
}

export async function getOrCreateDeviceId() {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;

  const created = `mobile_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
  return created;
}
