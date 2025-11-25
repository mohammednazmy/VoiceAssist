/**
 * Authentication Store
 * Manages user authentication state, tokens, and auth operations
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, AuthTokens } from "@voiceassist/types";

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  _hasHydrated: boolean;

  // Actions
  setUser: (user: User | null) => void;
  setTokens: (tokens: AuthTokens | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
  reset: () => void;
  setHasHydrated: (state: boolean) => void;
}

const initialState = {
  user: null,
  tokens: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  _hasHydrated: false,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      ...initialState,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: user !== null,
          error: null,
        }),

      setTokens: (tokens) =>
        set({
          tokens,
        }),

      setLoading: (isLoading) =>
        set({
          isLoading,
        }),

      setError: (error) =>
        set({
          error,
          isLoading: false,
        }),

      logout: () =>
        set({
          ...initialState,
        }),

      reset: () =>
        set({
          ...initialState,
          _hasHydrated: true, // Keep hydrated state on reset
        }),

      setHasHydrated: (state) =>
        set({
          _hasHydrated: state,
        }),
    }),
    {
      name: "voiceassist-auth",
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => {
        // Log what's in localStorage at the start of hydration
        if (typeof window !== "undefined") {
          const stored = window.localStorage.getItem("voiceassist-auth");
          console.log(
            "[AuthStore] Starting hydration, localStorage:",
            stored ? JSON.parse(stored)?.state?.isAuthenticated : "null",
          );
        }
        return (state, error) => {
          // Mark as hydrated after rehydration completes
          if (error) {
            console.error("[AuthStore] Hydration error:", error);
          } else {
            console.log(
              "[AuthStore] Hydration complete, isAuthenticated:",
              state?.isAuthenticated,
            );
          }
          state?.setHasHydrated(true);
        };
      },
    },
  ),
);
