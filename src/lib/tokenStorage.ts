import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "attendqr_token";

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function saveToken(token: string) {
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken() {
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}
