import { VoiceAssistApiClient } from "@voiceassist/api-client";

const ACCESS_TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "auth_refresh_token";
const ROLE_KEY = "auth_role";

// DEBUG: Log environment on load
console.log("[apiClient] === INITIALIZATION ===");
console.log("[apiClient] window.location.origin:", typeof window !== "undefined" ? window.location.origin : "N/A");
console.log("[apiClient] window.location.href:", typeof window !== "undefined" ? window.location.href : "N/A");
console.log("[apiClient] VITE_ADMIN_API_URL:", import.meta.env.VITE_ADMIN_API_URL);
console.log("[apiClient] VITE_API_URL:", import.meta.env.VITE_API_URL);

// Base URL should NOT include /api prefix - API client paths include it
// Use current origin for local development, production uses VITE_API_URL
const FALLBACK_GATEWAY = typeof window !== "undefined" ? window.location.origin : "";
console.log("[apiClient] FALLBACK_GATEWAY:", FALLBACK_GATEWAY);

let cachedClient: VoiceAssistApiClient | null = null;

function buildClient() {
  const baseURL =
    import.meta.env.VITE_ADMIN_API_URL ||
    import.meta.env.VITE_API_URL ||
    FALLBACK_GATEWAY;
  console.log("[apiClient] buildClient() - Final baseURL:", baseURL);
  console.log("[apiClient] buildClient() - Selection path:",
    import.meta.env.VITE_ADMIN_API_URL ? "VITE_ADMIN_API_URL" :
    import.meta.env.VITE_API_URL ? "VITE_API_URL" : "FALLBACK_GATEWAY");
  return new VoiceAssistApiClient({
    baseURL,
    getAccessToken: () => localStorage.getItem(ACCESS_TOKEN_KEY),
    onUnauthorized: () => {
      console.log("[apiClient] onUnauthorized triggered - redirecting to /admin/login");
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(ROLE_KEY);
      window.location.href = "/admin/login";
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
