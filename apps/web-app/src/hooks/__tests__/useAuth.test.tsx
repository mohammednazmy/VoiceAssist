/**
 * useAuth Hook Tests - Phase 4 Auth UX Enhancements
 *
 * Basic tests for OAuth provider status tracking.
 * Complex async error scenarios are tested via E2E tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import type { ReactNode } from "react";

// Use vi.hoisted to ensure mock values are available when vi.mock runs
const {
  mockLogin,
  mockGetOAuthUrl,
  mockGetCurrentUser,
  mockLogout,
  mockRefreshToken,
  mockHandleOAuthCallback,
  mockRegister,
  mockUpdateProfile,
  mockChangePassword,
  mockNavigate,
  mockSetUser,
  mockSetTokens,
  mockSetLoading,
  mockSetError,
  mockLogoutStore,
} = vi.hoisted(() => ({
  mockLogin: vi.fn(),
  mockGetOAuthUrl: vi.fn(),
  mockGetCurrentUser: vi.fn(),
  mockLogout: vi.fn(),
  mockRefreshToken: vi.fn(),
  mockHandleOAuthCallback: vi.fn(),
  mockRegister: vi.fn(),
  mockUpdateProfile: vi.fn(),
  mockChangePassword: vi.fn(),
  mockNavigate: vi.fn(),
  mockSetUser: vi.fn(),
  mockSetTokens: vi.fn(),
  mockSetLoading: vi.fn(),
  mockSetError: vi.fn(),
  mockLogoutStore: vi.fn(),
}));

// Mock react-router-dom navigate
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock the API client
vi.mock("@voiceassist/api-client", () => ({
  VoiceAssistApiClient: class MockVoiceAssistApiClient {
    login = mockLogin;
    getOAuthUrl = mockGetOAuthUrl;
    getCurrentUser = mockGetCurrentUser;
    logout = mockLogout;
    refreshToken = mockRefreshToken;
    handleOAuthCallback = mockHandleOAuthCallback;
    register = mockRegister;
    updateProfile = mockUpdateProfile;
    changePassword = mockChangePassword;
  },
}));

// Mock auth store
vi.mock("../../stores/authStore", () => ({
  useAuthStore: () => ({
    user: null,
    tokens: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    setUser: mockSetUser,
    setTokens: mockSetTokens,
    setLoading: mockSetLoading,
    setError: mockSetError,
    logout: mockLogoutStore,
  }),
}));

// Import after mocks are set up
import { useAuth, type OAuthProviderStatus } from "../useAuth";

// Wrapper component for hooks that need router context
function Wrapper({ children }: { children: ReactNode }) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set default mock implementations
    mockGetOAuthUrl.mockResolvedValue("https://oauth.example.com");
    mockLogin.mockResolvedValue({ accessToken: "test", refreshToken: "test" });
    mockGetCurrentUser.mockResolvedValue({ id: "1", email: "test@test.com" });
  });

  describe("OAuth provider status tracking", () => {
    it("should initialize with unknown status for both providers", () => {
      const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

      expect(result.current.oauthStatus.google).toBe("unknown");
      expect(result.current.oauthStatus.microsoft).toBe("unknown");
    });

    it("should export OAuthProviderStatus type", () => {
      // Type check - if this compiles, the type is exported correctly
      const status: OAuthProviderStatus = "unknown";
      expect(["unknown", "available", "unavailable"]).toContain(status);
    });

    it("should have oauthStatus object with google and microsoft properties", () => {
      const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

      expect(result.current.oauthStatus).toBeDefined();
      expect(result.current.oauthStatus).toHaveProperty("google");
      expect(result.current.oauthStatus).toHaveProperty("microsoft");
    });
  });

  describe("hook structure", () => {
    it("should export all expected functions", () => {
      const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

      expect(typeof result.current.login).toBe("function");
      expect(typeof result.current.loginWithOAuth).toBe("function");
      expect(typeof result.current.register).toBe("function");
      expect(typeof result.current.logout).toBe("function");
      expect(typeof result.current.refreshTokens).toBe("function");
      expect(typeof result.current.handleOAuthCallback).toBe("function");
      expect(typeof result.current.updateProfile).toBe("function");
      expect(typeof result.current.changePassword).toBe("function");
    });

    it("should export all expected state properties", () => {
      const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

      expect(result.current).toHaveProperty("user");
      expect(result.current).toHaveProperty("tokens");
      expect(result.current).toHaveProperty("isAuthenticated");
      expect(result.current).toHaveProperty("isLoading");
      expect(result.current).toHaveProperty("error");
      expect(result.current).toHaveProperty("apiClient");
      expect(result.current).toHaveProperty("oauthStatus");
    });
  });
});
