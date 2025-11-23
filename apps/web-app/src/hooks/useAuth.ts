/**
 * useAuth Hook
 * Provides authentication operations and manages tokens
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { VoiceAssistApiClient } from '@voiceassist/api-client';
import type { LoginRequest } from '@voiceassist/types';
import { useAuthStore } from '../stores/authStore';

// Initialize API client
const apiClient = new VoiceAssistApiClient({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  getAccessToken: () => {
    const state = useAuthStore.getState();
    return state.tokens?.accessToken || null;
  },
  onUnauthorized: () => {
    const state = useAuthStore.getState();
    state.logout();
    window.location.href = '/login';
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

        const response = await apiClient.login(credentials);

        setUser(response.user);
        setTokens(response.tokens);
        setLoading(false);

        navigate('/');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Login failed');
        throw err;
      }
    },
    [navigate, setUser, setTokens, setLoading, setError]
  );

  const register = useCallback(
    async (data: { email: string; password: string; name: string }) => {
      try {
        setLoading(true);
        setError(null);

        // TODO: Add register endpoint to API client
        // const response = await apiClient.register(data);
        console.log('Register:', data);

        // For now, auto-login after successful registration
        await login({ email: data.email, password: data.password });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Registration failed');
        throw err;
      }
    },
    [login, setLoading, setError]
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      logoutStore();
      navigate('/login');
    }
  }, [logoutStore, navigate]);

  const refreshTokens = useCallback(async () => {
    if (!tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await apiClient.refreshToken(tokens.refreshToken);
      setTokens(response.tokens);
      setUser(response.user);
    } catch (err) {
      logoutStore();
      throw err;
    }
  }, [tokens, setTokens, setUser, logoutStore]);

  const loginWithOAuth = useCallback(
    async (provider: 'google' | 'microsoft') => {
      try {
        setLoading(true);
        setError(null);

        // Get OAuth authorization URL from backend
        const authUrl = await apiClient.getOAuthUrl(provider);

        // Redirect to OAuth provider
        window.location.href = authUrl;
      } catch (err) {
        setLoading(false);
        setError(err instanceof Error ? err.message : 'OAuth initialization failed');
        throw err;
      }
    },
    [setLoading, setError]
  );

  const handleOAuthCallback = useCallback(
    async (provider: 'google' | 'microsoft', code: string) => {
      try {
        setLoading(true);
        setError(null);

        const response = await apiClient.handleOAuthCallback(provider, code);

        setUser(response.user);
        setTokens(response.tokens);
        setLoading(false);

        navigate('/');
      } catch (err) {
        setLoading(false);
        setError(err instanceof Error ? err.message : 'OAuth callback failed');
        throw err;
      }
    },
    [navigate, setUser, setTokens, setLoading, setError]
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
        setError(err instanceof Error ? err.message : 'Failed to update profile');
        throw err;
      }
    },
    [setUser, setLoading, setError]
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
        setError(err instanceof Error ? err.message : 'Failed to change password');
        throw err;
      }
    },
    [setLoading, setError]
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
