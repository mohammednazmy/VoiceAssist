/**
 * Auth Store Unit Tests
 * Tests for authentication state management
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "../authStore";
import type { User, AuthTokens } from "@voiceassist/types";

describe("authStore", () => {
  beforeEach(() => {
    // Reset store before each test
    useAuthStore.setState({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    // Clear localStorage
    localStorage.clear();
  });

  describe("initial state", () => {
    it("should have correct initial state", () => {
      const state = useAuthStore.getState();

      expect(state.user).toBeNull();
      expect(state.tokens).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe("setUser", () => {
    it("should set user and mark as authenticated", () => {
      const mockUser: User = {
        id: "1",
        email: "test@example.com",
        name: "Test User",
        role: "patient",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      useAuthStore.getState().setUser(mockUser);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
    });

    it("should clear authentication when user is null", () => {
      const mockUser: User = {
        id: "1",
        email: "test@example.com",
        name: "Test User",
        role: "patient",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Set user first
      useAuthStore.getState().setUser(mockUser);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);

      // Clear user
      useAuthStore.getState().setUser(null);

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe("setTokens", () => {
    it("should set tokens", () => {
      const mockTokens: AuthTokens = {
        accessToken: "access-token-123",
        refreshToken: "refresh-token-456",
        expiresIn: 3600,
      };

      useAuthStore.getState().setTokens(mockTokens);

      const state = useAuthStore.getState();
      expect(state.tokens).toEqual(mockTokens);
    });

    it("should clear tokens when null", () => {
      const mockTokens: AuthTokens = {
        accessToken: "access-token-123",
        refreshToken: "refresh-token-456",
        expiresIn: 3600,
      };

      // Set tokens first
      useAuthStore.getState().setTokens(mockTokens);
      expect(useAuthStore.getState().tokens).toEqual(mockTokens);

      // Clear tokens
      useAuthStore.getState().setTokens(null);

      const state = useAuthStore.getState();
      expect(state.tokens).toBeNull();
    });
  });

  describe("setLoading", () => {
    it("should set loading state", () => {
      useAuthStore.getState().setLoading(true);
      expect(useAuthStore.getState().isLoading).toBe(true);

      useAuthStore.getState().setLoading(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  describe("setError", () => {
    it("should set error message", () => {
      const errorMessage = "Login failed";

      useAuthStore.getState().setError(errorMessage);
      expect(useAuthStore.getState().error).toBe(errorMessage);
    });

    it("should clear error when null", () => {
      // Set error first
      useAuthStore.getState().setError("Some error");
      expect(useAuthStore.getState().error).toBe("Some error");

      // Clear error
      useAuthStore.getState().setError(null);
      expect(useAuthStore.getState().error).toBeNull();
    });
  });

  describe("logout", () => {
    it("should clear all auth state", () => {
      const mockUser: User = {
        id: "1",
        email: "test@example.com",
        name: "Test User",
        role: "patient",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const mockTokens: AuthTokens = {
        accessToken: "access-token-123",
        refreshToken: "refresh-token-456",
        expiresIn: 3600,
      };

      // Set up authenticated state
      useAuthStore.getState().setUser(mockUser);
      useAuthStore.getState().setTokens(mockTokens);
      useAuthStore.getState().setError("Some error");

      expect(useAuthStore.getState().isAuthenticated).toBe(true);

      // Logout
      useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.tokens).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe("persistence", () => {
    it("should persist auth state to localStorage", () => {
      const mockUser: User = {
        id: "1",
        email: "test@example.com",
        name: "Test User",
        role: "patient",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const mockTokens: AuthTokens = {
        accessToken: "access-token-123",
        refreshToken: "refresh-token-456",
        expiresIn: 3600,
      };

      useAuthStore.getState().setUser(mockUser);
      useAuthStore.getState().setTokens(mockTokens);

      // Check localStorage
      const stored = localStorage.getItem("voiceassist-auth");
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed.state.user).toEqual(mockUser);
      expect(parsed.state.tokens).toEqual(mockTokens);
    });
  });
});
