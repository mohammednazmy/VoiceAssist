/**
 * AuthContext Tests
 * Tests authentication state management, login/logout, and token refresh
 */

import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AuthProvider, useAuth } from "../AuthContext";

// Mock functions
const mockLogin = vi.fn();
const mockGetCurrentUser = vi.fn();
const mockRefreshToken = vi.fn();
const mockPersistTokens = vi.fn();
const mockPersistRole = vi.fn();
const mockClearTokens = vi.fn();
const mockGetStoredRole = vi.fn();

vi.mock("../../lib/apiClient", () => ({
  getApiClient: () => ({
    login: mockLogin,
    getCurrentUser: mockGetCurrentUser,
    refreshToken: mockRefreshToken,
  }),
  persistTokens: (...args: unknown[]) => mockPersistTokens(...args),
  persistRole: (...args: unknown[]) => mockPersistRole(...args),
  clearTokens: () => mockClearTokens(),
  getStoredRole: () => mockGetStoredRole(),
}));

// Helper to create a valid JWT with expiry
function createMockToken(expiresInSeconds: number = 3600): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      sub: "user-123",
      email: "test@example.com",
      role: "admin",
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    }),
  );
  return `${header}.${payload}.signature`;
}

// Store for localStorage mock
let mockLocalStorage: Record<string, string> = {};

// Helper component to test useAuth hook
function TestComponent({
  onAuth,
}: {
  onAuth?: (auth: ReturnType<typeof useAuth>) => void;
}) {
  const auth = useAuth();
  if (onAuth) onAuth(auth);
  return (
    <div>
      <span data-testid="loading">{auth.loading.toString()}</span>
      <span data-testid="authenticated">{auth.isAuthenticated.toString()}</span>
      <span data-testid="isAdmin">{auth.isAdmin.toString()}</span>
      <span data-testid="isViewer">{auth.isViewer.toString()}</span>
      <span data-testid="role">{auth.role}</span>
      <span data-testid="email">{auth.user?.email || "none"}</span>
      <span data-testid="error">{auth.error || "none"}</span>
    </div>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage = {};
    mockGetStoredRole.mockReturnValue(null);

    // Mock localStorage
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(
      (key: string) => mockLocalStorage[key] || null,
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(
      (key: string, value: string) => {
        mockLocalStorage[key] = value;
      },
    );
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(
      (key: string) => {
        delete mockLocalStorage[key];
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("useAuth hook", () => {
    it("should throw error when used outside AuthProvider", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow("useAuth must be used within an AuthProvider");

      consoleSpy.mockRestore();
    });
  });

  describe("initial state without token", () => {
    it("should complete loading and be unauthenticated", async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      });

      expect(screen.getByTestId("authenticated").textContent).toBe("false");
      expect(screen.getByTestId("email").textContent).toBe("none");
    });
  });

  describe("session restoration with valid token", () => {
    it("should restore session from valid token", async () => {
      mockLocalStorage["auth_token"] = createMockToken(3600);
      mockGetCurrentUser.mockResolvedValueOnce({
        id: "user-123",
        email: "restored@example.com",
        name: "Restored User",
        role: "admin",
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("authenticated").textContent).toBe("true");
      });

      expect(screen.getByTestId("email").textContent).toBe(
        "restored@example.com",
      );
      expect(screen.getByTestId("isAdmin").textContent).toBe("true");
      expect(mockGetCurrentUser).toHaveBeenCalled();
    });

    it("should set viewer role when user has viewer role", async () => {
      mockLocalStorage["auth_token"] = createMockToken(3600);
      mockGetCurrentUser.mockResolvedValueOnce({
        id: "user-456",
        email: "viewer@example.com",
        name: "Viewer User",
        role: "viewer",
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("authenticated").textContent).toBe("true");
      });

      expect(screen.getByTestId("role").textContent).toBe("viewer");
      expect(screen.getByTestId("isViewer").textContent).toBe("true");
      expect(screen.getByTestId("isAdmin").textContent).toBe("false");
    });
  });

  describe("token refresh on expired token", () => {
    it("should refresh token when auth token is expired", async () => {
      // Set an expired token but valid refresh token
      mockLocalStorage["auth_token"] = createMockToken(-3600); // Expired
      mockLocalStorage["refresh_token"] = "valid-refresh-token";

      mockRefreshToken.mockResolvedValueOnce({
        accessToken: createMockToken(3600),
        refreshToken: "new-refresh-token",
      });
      mockGetCurrentUser.mockResolvedValueOnce({
        id: "user-123",
        email: "refreshed@example.com",
        name: "Refreshed User",
        role: "admin",
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("authenticated").textContent).toBe("true");
      });

      expect(mockRefreshToken).toHaveBeenCalledWith("valid-refresh-token");
      expect(screen.getByTestId("email").textContent).toBe(
        "refreshed@example.com",
      );
    });

    it("should clear session when refresh fails", async () => {
      mockLocalStorage["auth_token"] = createMockToken(-3600);
      mockLocalStorage["refresh_token"] = "invalid-refresh-token";

      mockRefreshToken.mockRejectedValueOnce(new Error("Refresh failed"));

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      });

      expect(screen.getByTestId("authenticated").textContent).toBe("false");
      expect(mockClearTokens).toHaveBeenCalled();
    });
  });

  describe("login", () => {
    it("should authenticate user on successful login", async () => {
      let authContext: ReturnType<typeof useAuth> | null = null;

      mockLogin.mockResolvedValueOnce({
        accessToken: createMockToken(3600),
        refreshToken: "refresh-token",
      });
      mockGetCurrentUser.mockResolvedValueOnce({
        id: "user-123",
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });

      render(
        <AuthProvider>
          <TestComponent
            onAuth={(auth) => {
              authContext = auth;
            }}
          />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      });

      // Call login
      await act(async () => {
        await authContext!.login("admin@example.com", "password123");
      });

      expect(screen.getByTestId("authenticated").textContent).toBe("true");
      expect(screen.getByTestId("email").textContent).toBe("admin@example.com");
      expect(screen.getByTestId("isAdmin").textContent).toBe("true");
      expect(mockLogin).toHaveBeenCalledWith({
        email: "admin@example.com",
        password: "password123",
      });
    });

    it("should set error and throw on failed login", async () => {
      let authContext: ReturnType<typeof useAuth> | null = null;

      mockLogin.mockRejectedValueOnce(new Error("Invalid credentials"));

      render(
        <AuthProvider>
          <TestComponent
            onAuth={(auth) => {
              authContext = auth;
            }}
          />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      });

      // Call login and expect it to throw
      let loginError: Error | null = null;
      await act(async () => {
        try {
          await authContext!.login("wrong@example.com", "wrongpass");
        } catch (err) {
          loginError = err as Error;
        }
      });

      expect(loginError?.message).toBe("Invalid credentials");

      // Wait for error state to be reflected in UI
      await waitFor(() => {
        expect(screen.getByTestId("error").textContent).toBe(
          "Invalid credentials",
        );
      });

      expect(screen.getByTestId("authenticated").textContent).toBe("false");
      expect(mockClearTokens).toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("should clear user on logout", async () => {
      let authContext: ReturnType<typeof useAuth> | null = null;

      mockLocalStorage["auth_token"] = createMockToken(3600);
      mockGetCurrentUser.mockResolvedValueOnce({
        id: "user-123",
        email: "admin@example.com",
        role: "admin",
      });

      render(
        <AuthProvider>
          <TestComponent
            onAuth={(auth) => {
              authContext = auth;
            }}
          />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("authenticated").textContent).toBe("true");
      });

      // Call logout
      act(() => {
        authContext!.logout();
      });

      expect(screen.getByTestId("authenticated").textContent).toBe("false");
      expect(screen.getByTestId("email").textContent).toBe("none");
      expect(mockClearTokens).toHaveBeenCalled();
    });
  });

  describe("role derivation", () => {
    it("should default to admin role for non-viewer roles", async () => {
      mockLocalStorage["auth_token"] = createMockToken(3600);
      mockGetCurrentUser.mockResolvedValueOnce({
        id: "user-789",
        email: "manager@example.com",
        role: "manager", // Not viewer, should default to admin
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("authenticated").textContent).toBe("true");
      });

      expect(screen.getByTestId("role").textContent).toBe("admin");
      expect(screen.getByTestId("isAdmin").textContent).toBe("true");
    });
  });

  describe("computed properties", () => {
    it("should default role to admin when no user", async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      });

      expect(screen.getByTestId("role").textContent).toBe("admin");
      expect(screen.getByTestId("isAdmin").textContent).toBe("false"); // isAdmin depends on user
      expect(screen.getByTestId("isViewer").textContent).toBe("false");
    });
  });
});
