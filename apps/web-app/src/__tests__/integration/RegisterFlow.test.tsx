/**
 * Registration Flow Integration Tests
 * Tests the complete registration flow with component interaction
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { RegisterPage } from "../../pages/RegisterPage";
import { useAuthStore } from "../../stores/authStore";

// Mock the API client
vi.mock("@voiceassist/api-client", () => {
  return {
    VoiceAssistApiClient: class MockApiClient {
      register = vi.fn().mockResolvedValue({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresIn: 3600,
      });
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

describe("Registration Flow Integration", () => {
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

  it("should render registration form", () => {
    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /create an account/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create account/i }),
    ).toBeInTheDocument();
  });

  it("should show validation errors for empty fields", async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>,
    );

    const submitButton = screen.getByRole("button", {
      name: /create account/i,
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeInTheDocument();
      expect(screen.getByText("Email is required")).toBeInTheDocument();
      expect(screen.getByText("Password is required")).toBeInTheDocument();
    });
  });

  it("should validate name length", async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>,
    );

    const nameInput = screen.getByLabelText(/full name/i);
    const submitButton = screen.getByRole("button", {
      name: /create account/i,
    });

    // Test name too short
    await user.type(nameInput, "A");
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/name must be at least 2 characters/i),
      ).toBeInTheDocument();
    });

    // Clear and test name too long
    await user.clear(nameInput);
    await user.type(nameInput, "a".repeat(101));
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/name must not exceed 100 characters/i),
      ).toBeInTheDocument();
    });
  });

  it("should validate password strength requirements", async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>,
    );

    const nameInput = screen.getByLabelText(/full name/i);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password/i);
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
    const submitButton = screen.getByRole("button", {
      name: /create account/i,
    });

    await user.type(nameInput, "John Doe");
    await user.type(emailInput, "john@example.com");
    await user.type(passwordInput, "weakpass");
    await user.type(confirmPasswordInput, "weakpass");
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/must contain at least one uppercase letter/i),
      ).toBeInTheDocument();
    });
  });

  it("should show password strength indicator", async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>,
    );

    const passwordInput = screen.getByLabelText(/^password/i);

    // Type weak password
    await user.type(passwordInput, "pass");
    await waitFor(() => {
      expect(screen.getByText(/weak/i)).toBeInTheDocument();
    });

    // Type stronger password
    await user.clear(passwordInput);
    await user.type(passwordInput, "Password123!");
    await waitFor(() => {
      expect(screen.getByText(/strong|very strong/i)).toBeInTheDocument();
    });
  });

  it("should validate password confirmation match", async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>,
    );

    const nameInput = screen.getByLabelText(/full name/i);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password/i);
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
    const submitButton = screen.getByRole("button", {
      name: /create account/i,
    });

    await user.type(nameInput, "John Doe");
    await user.type(emailInput, "john@example.com");
    await user.type(passwordInput, "Password123");
    await user.type(confirmPasswordInput, "Password456");
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });

  it("should toggle password visibility", async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>,
    );

    const passwordInput = screen.getByLabelText(
      /^password/i,
    ) as HTMLInputElement;
    const toggleButtons = screen.getAllByRole("button", {
      name: /show password/i,
    });

    expect(passwordInput.type).toBe("password");

    await user.click(toggleButtons[0]);
    expect(passwordInput.type).toBe("text");

    await user.click(toggleButtons[0]);
    expect(passwordInput.type).toBe("password");
  });

  it("should render OAuth buttons", () => {
    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>,
    );

    expect(
      screen.getByRole("button", { name: /continue with google/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /continue with microsoft/i }),
    ).toBeInTheDocument();
  });

  it("should have link to login page", () => {
    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>,
    );

    const signInLink = screen.getByRole("link", { name: /sign in/i });
    expect(signInLink).toBeInTheDocument();
    expect(signInLink).toHaveAttribute("href", "/login");
  });

  it("should successfully register with valid data", async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <RegisterPage />
      </BrowserRouter>,
    );

    const nameInput = screen.getByLabelText(/full name/i);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password/i);
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
    const submitButton = screen.getByRole("button", {
      name: /create account/i,
    });

    await user.type(nameInput, "John Doe");
    await user.type(emailInput, "john@example.com");
    await user.type(passwordInput, "Password123");
    await user.type(confirmPasswordInput, "Password123");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });
});
