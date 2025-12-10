/**
 * Login Flow Integration Tests
 * Tests the complete login flow with component interaction
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { LoginPage } from "../../pages/LoginPage";
import { useAuthStore } from "../../stores/authStore";

// Mock the API client
vi.mock("@voiceassist/api-client", () => {
  return {
    VoiceAssistApiClient: class MockApiClient {
      login = vi.fn().mockResolvedValue({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresIn: 3600,
      });
      getCurrentUser = vi.fn().mockResolvedValue({
        id: "1",
        email: "test@example.com",
        name: "Test User",
        role: "user",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      getOAuthUrl = vi
        .fn()
        .mockResolvedValue("https://oauth.example.com/authorize");
      logout = vi.fn().mockResolvedValue(undefined);
    },
  };
});

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("Login Flow Integration", () => {
  beforeEach(() => {
    // Clear store
    useAuthStore.setState({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    localStorage.clear();
    mockNavigate.mockClear();
  });

  it("should render login form", () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /welcome back/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it("should show validation errors for empty fields", async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    const submitButton = screen.getByRole("button", { name: /sign in/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Email is required")).toBeInTheDocument();
      expect(screen.getByText("Password is required")).toBeInTheDocument();
    });
  });

  it("should show validation error for invalid email", async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    const emailInput = screen.getByLabelText(/email/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await user.type(emailInput, "not-an-email");
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Invalid email address")).toBeInTheDocument();
    });
  });

  it("should show validation error for short password", async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await user.type(emailInput, "test@example.com");
    await user.type(passwordInput, "short");
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText("Password must be at least 8 characters"),
      ).toBeInTheDocument();
    });
  });

  it("should toggle password visibility", async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    const passwordInput = screen.getByLabelText(
      /^password/i,
    ) as HTMLInputElement;
    const toggleButton = screen.getByRole("button", { name: /show password/i });

    expect(passwordInput.type).toBe("password");

    await user.click(toggleButton);
    expect(passwordInput.type).toBe("text");

    await user.click(toggleButton);
    expect(passwordInput.type).toBe("password");
  });

  it("should successfully log in with valid credentials", async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await user.type(emailInput, "test@example.com");
    await user.type(passwordInput, "Password123");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.email).toBe("test@example.com");
  });

  it("should render OAuth buttons", () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    expect(
      screen.getByRole("button", { name: /continue with google/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /continue with microsoft/i }),
    ).toBeInTheDocument();
  });

  it("should have link to registration page", () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    const signUpLink = screen.getByRole("link", { name: /sign up/i });
    expect(signUpLink).toBeInTheDocument();
    expect(signUpLink).toHaveAttribute("href", "/register");
  });
});
