/**
 * LoginPage Component Tests
 * Tests authentication flow including 2FA
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LoginPage } from "../LoginPage";

// Mock dependencies
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockLogin = vi.fn();
const mockVerify2FALogin = vi.fn();
const mockGetCurrentUser = vi.fn();

vi.mock("../../lib/apiClient", () => ({
  getApiClient: () => ({
    login: mockLogin,
    verify2FALogin: mockVerify2FALogin,
    getCurrentUser: mockGetCurrentUser,
  }),
  persistTokens: vi.fn(),
  persistRole: vi.fn(),
}));

vi.mock("@voiceassist/api-client", () => ({
  isTwoFactorRequired: (result: unknown) => {
    return (
      result &&
      typeof result === "object" &&
      "requires_2fa" in result &&
      (result as { requires_2fa: boolean }).requires_2fa === true
    );
  },
}));

// Mock window.location
const originalLocation = window.location;
beforeEach(() => {
  Object.defineProperty(window, "location", {
    value: { href: "" },
    writable: true,
  });
});
afterEach(() => {
  Object.defineProperty(window, "location", {
    value: originalLocation,
    writable: true,
  });
});

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial render", () => {
    it("should render login form", () => {
      renderLoginPage();

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /sign in/i }),
      ).toBeInTheDocument();
    });

    it("should show VoiceAssist Admin branding", () => {
      renderLoginPage();

      expect(screen.getByText(/VoiceAssist Admin/i)).toBeInTheDocument();
    });
  });

  describe("form validation", () => {
    it("should have required email field", () => {
      renderLoginPage();

      const emailInput = screen.getByLabelText(/email/i);
      expect(emailInput).toHaveAttribute("type", "email");
      expect(emailInput).toBeRequired();
    });

    it("should have required password field", () => {
      renderLoginPage();

      const passwordInput = screen.getByLabelText(/password/i);
      expect(passwordInput).toHaveAttribute("type", "password");
      expect(passwordInput).toBeRequired();
    });
  });

  describe("successful login without 2FA", () => {
    it("should redirect to dashboard on successful login", async () => {
      mockLogin.mockResolvedValueOnce({
        accessToken: "access-token",
        refreshToken: "refresh-token",
      });
      mockGetCurrentUser.mockResolvedValueOnce({
        id: "1",
        email: "admin@example.com",
        role: "admin",
      });

      renderLoginPage();

      await userEvent.type(
        screen.getByLabelText(/email/i),
        "admin@example.com",
      );
      await userEvent.type(screen.getByLabelText(/password/i), "password123");
      await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

      await waitFor(() => {
        expect(window.location.href).toBe("/admin/dashboard");
      });
    });

    it("should call login API with email and password", async () => {
      mockLogin.mockResolvedValueOnce({
        accessToken: "access-token",
        refreshToken: "refresh-token",
      });
      mockGetCurrentUser.mockResolvedValueOnce({
        id: "1",
        email: "test@example.com",
        role: "admin",
      });

      renderLoginPage();

      await userEvent.type(screen.getByLabelText(/email/i), "test@example.com");
      await userEvent.type(screen.getByLabelText(/password/i), "testpass");
      await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          email: "test@example.com",
          password: "testpass",
        });
      });
    });
  });

  describe("login error handling", () => {
    it("should display error message on failed login", async () => {
      mockLogin.mockRejectedValueOnce(new Error("Invalid credentials"));

      renderLoginPage();

      await userEvent.type(
        screen.getByLabelText(/email/i),
        "wrong@example.com",
      );
      await userEvent.type(screen.getByLabelText(/password/i), "wrongpass");
      await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument();
      });
    });

    it("should show generic error for non-Error exceptions", async () => {
      mockLogin.mockRejectedValueOnce("Unknown error");

      renderLoginPage();

      await userEvent.type(screen.getByLabelText(/email/i), "test@example.com");
      await userEvent.type(screen.getByLabelText(/password/i), "pass");
      await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText(/Login failed/i)).toBeInTheDocument();
      });
    });
  });

  describe("2FA flow", () => {
    it("should show 2FA form when required", async () => {
      mockLogin.mockResolvedValueOnce({
        requires_2fa: true,
        user_id: "user-123",
      });

      renderLoginPage();

      await userEvent.type(screen.getByLabelText(/email/i), "user@example.com");
      await userEvent.type(screen.getByLabelText(/password/i), "password");
      await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/Two-Factor Authentication/i),
        ).toBeInTheDocument();
      });
    });

    it("should show verification code input in 2FA form", async () => {
      mockLogin.mockResolvedValueOnce({
        requires_2fa: true,
        user_id: "user-123",
      });

      renderLoginPage();

      await userEvent.type(screen.getByLabelText(/email/i), "user@example.com");
      await userEvent.type(screen.getByLabelText(/password/i), "password");
      await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText(/000000|Enter.*code/i),
        ).toBeInTheDocument();
      });
    });

    it("should have backup code toggle option", async () => {
      mockLogin.mockResolvedValueOnce({
        requires_2fa: true,
        user_id: "user-123",
      });

      renderLoginPage();

      await userEvent.type(screen.getByLabelText(/email/i), "user@example.com");
      await userEvent.type(screen.getByLabelText(/password/i), "password");
      await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/use a backup code/i)).toBeInTheDocument();
      });
    });

    it("should have back to login button in 2FA form", async () => {
      mockLogin.mockResolvedValueOnce({
        requires_2fa: true,
        user_id: "user-123",
      });

      renderLoginPage();

      await userEvent.type(screen.getByLabelText(/email/i), "user@example.com");
      await userEvent.type(screen.getByLabelText(/password/i), "password");
      await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Back to login/i }),
        ).toBeInTheDocument();
      });
    });
  });

  describe("loading states", () => {
    it("should disable form during login", async () => {
      // Make login hang
      mockLogin.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000)),
      );

      renderLoginPage();

      await userEvent.type(screen.getByLabelText(/email/i), "user@example.com");
      await userEvent.type(screen.getByLabelText(/password/i), "password");

      const submitButton = screen.getByRole("button", { name: /sign in/i });
      await userEvent.click(submitButton);

      // Button should be disabled while loading
      await waitFor(() => {
        expect(submitButton).toBeDisabled();
      });
    });
  });

  describe("accessibility", () => {
    it("should have accessible form labels", () => {
      renderLoginPage();

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);

      expect(emailInput).toHaveAccessibleName();
      expect(passwordInput).toHaveAccessibleName();
    });

    it("should have submit button with accessible name", () => {
      renderLoginPage();

      const submitButton = screen.getByRole("button", { name: /sign in/i });
      expect(submitButton).toHaveAccessibleName();
    });
  });
});
