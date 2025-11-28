import { VoiceAssistApiClient } from "@voiceassist/api-client";

const ACCESS_TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "auth_refresh_token";
const ROLE_KEY = "auth_role";

// Base URL should NOT include /api prefix - API endpoints already include the path
const FALLBACK_GATEWAY = "https://admin.asimo.io";

let cachedClient: VoiceAssistApiClient | null = null;

function buildClient() {
  const baseURL = import.meta.env.VITE_API_URL || FALLBACK_GATEWAY;
  return new VoiceAssistApiClient({
    baseURL,
    getAccessToken: () => localStorage.getItem(ACCESS_TOKEN_KEY),
    onUnauthorized: () => {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(ROLE_KEY);
      window.location.href = "/login";
    },
  });
}

export function getApiClient() {
  if (!cachedClient) {
    cachedClient = buildClient();
  }
  return cachedClient;
}

export function persistTokens(accessToken: string, refreshToken?: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
}

export function persistRole(role: string) {
  localStorage.setItem(ROLE_KEY, role);
}

export function getStoredRole(): string | null {
  return localStorage.getItem(ROLE_KEY);
}

export function getAccessTokenKey() {
  return ACCESS_TOKEN_KEY;
}
