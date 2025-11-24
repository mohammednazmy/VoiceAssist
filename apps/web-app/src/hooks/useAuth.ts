/**
 * useAuth Hook
 * Provides authentication operations and manages tokens
 */

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { VoiceAssistApiClient } from "@voiceassist/api-client";
import type { LoginRequest } from "@voiceassist/types";
import { useAuthStore } from "../stores/authStore";

// Initialize API client
const apiClient = new VoiceAssistApiClient({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api",
  getAccessToken: () => {
    const state = useAuthStore.getState();
    return state.tokens?.accessToken || null;
  },
  onUnauthorized: () => {
    const state = useAuthStore.getState();
    state.logout();
    window.location.href = "/login";
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
        setError(err instanceof Error ? err.message : "Login failed");
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
      console.error("Logout error:", err);
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
      try {
        setLoading(true);
        setError(null);

        // Get OAuth authorization URL from backend
        const authUrl = await apiClient.getOAuthUrl(provider);

        // Redirect to OAuth provider
        window.location.href = authUrl;
      } catch (err) {
        setLoading(false);
        setError(
          err instanceof Error ? err.message : "OAuth initialization failed",
        );
        throw err;
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
  };
}
