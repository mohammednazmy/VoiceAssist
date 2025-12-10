/**
 * useAuth Hook
 * Provides authentication operations and manages tokens
 *
 * Phase 4 enhancements:
 * - Better error messages based on HTTP status codes
 * - OAuth provider availability detection (503 = not configured)
 * - No rethrow in OAuth to prevent uncaught promise rejections
 */

import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { VoiceAssistApiClient } from "@voiceassist/api-client";
import type { LoginRequest } from "@voiceassist/types";
import { useAuthStore } from "../stores/authStore";
import type { AxiosError } from "axios";
import { authLog } from "../lib/logger";

/** OAuth provider availability status */
export type OAuthProviderStatus = "unknown" | "available" | "unavailable";

/** Helper to extract HTTP status from axios error */
function getErrorStatus(err: unknown): number | undefined {
  return (err as AxiosError)?.response?.status;
}

/** Helper to get user-friendly login error message based on status */
function getLoginErrorMessage(err: unknown): string {
  const status = getErrorStatus(err);
  if (status === 401 || status === 403) {
    return "Invalid email or password. Please try again.";
  }
  if (status === 429) {
    return "Too many login attempts. Please wait a moment and try again.";
  }
  if (status && status >= 500) {
    return "Unexpected error logging in. Please try again later.";
  }
  // Fallback to error message or generic
  return err instanceof Error ? err.message : "Login failed";
}

/** Helper to get user-friendly OAuth error message based on status */
function getOAuthErrorMessage(provider: string, err: unknown): string {
  const status = getErrorStatus(err);
  const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);

  if (status === 503) {
    return `${providerName} login is not available in this environment.`;
  }
  if (status === 429) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (status && status >= 500) {
    return `${providerName} login is temporarily unavailable. Please try again later.`;
  }
  return `${providerName} login failed. Please try again.`;
}

// Initialize API client
// Use VITE_API_URL if set, otherwise use current page origin.
// This is a client-side SPA so window is always available at runtime.
// Empty string fallback allows relative API calls to work correctly.
const resolvedApiBase =
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

/**
 * Helper to get access token, with fallback to localStorage for race condition
 * during Zustand hydration. This ensures tokens are available immediately
 * even before the persist middleware completes hydration.
 */
function getAccessTokenWithFallback(): string | null {
  const state = useAuthStore.getState();

  // If store has hydrated and has tokens, use them
  if (state._hasHydrated && state.tokens?.accessToken) {
    console.log("[Auth] getAccessToken: using hydrated store token");
    return state.tokens.accessToken;
  }

  // If store has tokens even without hydration flag, use them
  if (state.tokens?.accessToken) {
    console.log("[Auth] getAccessToken: using store token (pre-hydration)");
    return state.tokens.accessToken;
  }

  // Fallback: read directly from localStorage for pre-hydration requests
  try {
    const authData = localStorage.getItem("voiceassist-auth");
    if (authData) {
      const parsed = JSON.parse(authData);
      const token = parsed.state?.tokens?.accessToken;
      if (token) {
        console.log("[Auth] getAccessToken: using localStorage fallback");
        return token;
      } else {
        console.log("[Auth] getAccessToken: localStorage has no accessToken, keys:", Object.keys(parsed.state?.tokens || {}));
      }
    } else {
      console.log("[Auth] getAccessToken: localStorage is empty");
    }
  } catch (e) {
    console.log("[Auth] getAccessToken: localStorage parse error", e);
  }

  console.log("[Auth] getAccessToken: returning null, _hasHydrated=", state._hasHydrated);
  return null;
}

const apiClient = new VoiceAssistApiClient({
  // Fallback to current origin so dev/e2e proxied /api requests work without VITE_API_URL
  baseURL: resolvedApiBase,
  getAccessToken: getAccessTokenWithFallback,
  onUnauthorized: () => {
    const state = useAuthStore.getState();
    // Only trigger logout if store has hydrated - avoids race condition
    // where 401 during hydration clears the store prematurely
    if (state._hasHydrated) {
      state.logout();
      window.location.href = "/login";
    } else {
      authLog.debug("[onUnauthorized] Ignoring 401 - store not hydrated yet");
    }
  },
});

export function useAuth() {
  const navigate = useNavigate();
  const {
    user,
    tokens,
    isAuthenticated,
    isLoading,
    error,
    setUser,
    setTokens,
    setLoading,
    setError,
    logout: logoutStore,
  } = useAuthStore();

  // Track OAuth provider availability (503 = not configured)
  const [googleStatus, setGoogleStatus] =
    useState<OAuthProviderStatus>("unknown");
  const [microsoftStatus, setMicrosoftStatus] =
    useState<OAuthProviderStatus>("unknown");

  const login = useCallback(
    async (credentials: LoginRequest) => {
      try {
        setLoading(true);
        setError(null);

        // Step 1: Get tokens from login endpoint
        const tokens = await apiClient.login(credentials);
        setTokens(tokens);

        // Step 2: Fetch user profile using the access token
        const user = await apiClient.getCurrentUser();
        setUser(user);

        setLoading(false);
        navigate("/");
      } catch (err) {
        setLoading(false);
        setError(getLoginErrorMessage(err));
        throw err;
      }
    },
    [navigate, setUser, setTokens, setLoading, setError],
  );

  const register = useCallback(
    async (data: { email: string; password: string; name: string }) => {
      try {
        setLoading(true);
        setError(null);

        // Register the user with the backend
        await apiClient.register({
          email: data.email,
          password: data.password,
          full_name: data.name,
        });

        // Auto-login after successful registration
        await login({ email: data.email, password: data.password });
      } catch (err) {
        setLoading(false);
        setError(err instanceof Error ? err.message : "Registration failed");
        throw err;
      }
    },
    [login, setLoading, setError],
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch (err) {
      authLog.error("Logout error:", err);
    } finally {
      logoutStore();
      navigate("/login");
    }
  }, [logoutStore, navigate]);

  const refreshTokens = useCallback(async () => {
    if (!tokens?.refreshToken) {
      throw new Error("No refresh token available");
    }

    try {
      const newTokens = await apiClient.refreshToken(tokens.refreshToken);
      setTokens(newTokens);
      // User data doesn't change on token refresh, no need to fetch again
    } catch (err) {
      logoutStore();
      throw err;
    }
  }, [tokens, setTokens, logoutStore]);

  const loginWithOAuth = useCallback(
    async (provider: "google" | "microsoft") => {
      const setProviderStatus =
        provider === "google" ? setGoogleStatus : setMicrosoftStatus;

      try {
        setLoading(true);
        setError(null);

        // Get OAuth authorization URL from backend
        const authUrl = await apiClient.getOAuthUrl(provider);

        // Mark provider as available (we got a valid URL)
        setProviderStatus("available");

        // Redirect to OAuth provider
        window.location.href = authUrl;
      } catch (err) {
        setLoading(false);

        // Check if provider is not configured (503)
        const status = getErrorStatus(err);
        if (status === 503) {
          setProviderStatus("unavailable");
        }

        // Set user-friendly error message
        setError(getOAuthErrorMessage(provider, err));
        // Note: intentionally NOT rethrowing to prevent uncaught promise rejections
        // The error state is set above for the UI to display
      }
    },
    [setLoading, setError],
  );

  const handleOAuthCallback = useCallback(
    async (provider: "google" | "microsoft", code: string) => {
      try {
        setLoading(true);
        setError(null);

        // Step 1: Get tokens from OAuth callback
        const tokens = await apiClient.handleOAuthCallback(provider, code);
        setTokens(tokens);

        // Step 2: Fetch user profile using the access token
        const user = await apiClient.getCurrentUser();
        setUser(user);

        setLoading(false);
        navigate("/");
      } catch (err) {
        setLoading(false);
        setError(err instanceof Error ? err.message : "OAuth callback failed");
        throw err;
      }
    },
    [navigate, setUser, setTokens, setLoading, setError],
  );

  const updateProfile = useCallback(
    async (updates: { name?: string; email?: string }) => {
      try {
        setLoading(true);
        setError(null);

        const updatedUser = await apiClient.updateProfile(updates);
        setUser(updatedUser);
        setLoading(false);
      } catch (err) {
        setLoading(false);
        setError(
          err instanceof Error ? err.message : "Failed to update profile",
        );
        throw err;
      }
    },
    [setUser, setLoading, setError],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      try {
        setLoading(true);
        setError(null);

        await apiClient.changePassword(currentPassword, newPassword);
        setLoading(false);
      } catch (err) {
        setLoading(false);
        setError(
          err instanceof Error ? err.message : "Failed to change password",
        );
        throw err;
      }
    },
    [setLoading, setError],
  );

  return {
    user,
    tokens,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    logout,
    refreshTokens,
    loginWithOAuth,
    handleOAuthCallback,
    updateProfile,
    changePassword,
    apiClient,
    // OAuth provider availability status
    oauthStatus: {
      google: googleStatus,
      microsoft: microsoftStatus,
    },
  };
}
