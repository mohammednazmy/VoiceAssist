---
title: "Web App Feature Specs"
slug: "client-implementation/web-app-feature-specs"
summary: "**Date:** 2025-11-21"
status: stable
stability: production
owner: frontend
lastUpdated: "2025-11-27"
audience: ["frontend"]
tags: ["web", "app", "feature", "specs"]
category: planning
---

# VoiceAssist Web App - Comprehensive Feature Specifications

**Version:** 1.0
**Date:** 2025-11-21
**Application:** Main User-Facing Medical AI Assistant
**URL:** https://voiceassist.asimo.io

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Authentication & User Management](#authentication--user-management) (5 features)
3. [Chat Interface](#chat-interface) (12 features)
4. [Voice Mode](#voice-mode) (8 features)
5. [Clinical Context](#clinical-context) (6 features)
6. [File Management](#file-management) (4 features)
7. [Citations & Sources](#citations--sources) (5 features)
8. [Conversation Management](#conversation-management) (5 features)
9. [Advanced Features](#advanced-features) (10 features)
10. [Technical Implementation](#technical-implementation)
11. [Testing Strategy](#testing-strategy)

**Total Features:** 55 (expanded from original 45)

---

## 🎯 Overview

The VoiceAssist Web App is a React-based single-page application that provides medical professionals with an AI-powered assistant for clinical decision support, medical literature queries, and patient care workflows.

### Core Technology Stack

- **Framework:** React 18.2+ with TypeScript 5.0+
- **Build Tool:** Vite 5.0+
- **Routing:** React Router 6.20+
- **State Management:** Zustand 4.4+
- **UI Components:** shadcn/ui + Radix UI
- **Styling:** Tailwind CSS 3.4+
- **Forms:** React Hook Form 7.48+ with Zod validation
- **Real-time:** Native WebSocket + Socket.io client
- **Audio:** Web Audio API + MediaRecorder API
- **Markdown:** React Markdown + remark-gfm + rehype-katex
- **Charts:** Recharts 2.10+
- **Testing:** Vitest + React Testing Library + Playwright

### Design Principles

1. **Speed First** - Every interaction feels instant
2. **Medical Professionalism** - Trust-building design
3. **Accessibility** - WCAG 2.1 AA compliant
4. **Mobile-Ready** - Responsive from 320px to 4K
5. **Offline Capable** - Service worker with smart caching

---

## 1. Authentication & User Management

### 1.1 Email/Password Login

**Priority:** P0 (Critical)
**Effort:** 5 days
**Dependencies:** Backend auth API

#### Specification

A clean, professional login interface with email and password fields, validation, and error handling.

**User Flow:**

1. User navigates to `/login`
2. Enters email and password
3. Clicks "Sign In" or presses Enter
4. System validates credentials
5. On success: Redirects to chat interface
6. On failure: Shows inline error message

**Features:**

- Real-time validation
- Password visibility toggle
- "Remember me" checkbox
- Forgot password link
- Social login options (Google, Microsoft)
- Rate limiting (5 attempts per 15 minutes)
- Loading states during authentication

#### Component Structure

```tsx
// File: apps/web-app/src/pages/auth/LoginPage.tsx

import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@voiceassist/ui";
import { Input } from "@voiceassist/ui";
import { Label } from "@voiceassist/ui";
import { useAuth } from "@/hooks/useAuth";
import { GoogleIcon, MicrosoftIcon } from "@/components/icons";

// Validation schema
const loginSchema = z.object({
  email: z.string().email("Invalid email address").min(1, "Email is required"),
  password: z.string().min(8, "Password must be at least 8 characters").max(100, "Password is too long"),
  rememberMe: z.boolean().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { login, loginWithOAuth } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      rememberMe: false,
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setApiError(null);
      await login(data.email, data.password, data.rememberMe);
      navigate("/chat");
    } catch (error: any) {
      if (error.response?.status === 401) {
        setApiError("Invalid email or password");
      } else if (error.response?.status === 429) {
        setApiError("Too many login attempts. Please try again later.");
      } else {
        setApiError("An error occurred. Please try again.");
      }
    }
  };

  const handleOAuthLogin = async (provider: "google" | "microsoft") => {
    try {
      await loginWithOAuth(provider);
    } catch (error) {
      setApiError(`Failed to sign in with ${provider}`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="VoiceAssist" className="h-12 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Welcome Back</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Sign in to your VoiceAssist account</p>
        </div>

        {/* Login Form Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Email Field */}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="doctor@hospital.com"
                error={errors.email?.message}
                {...register("email")}
              />
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  error={errors.password?.message}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center">
              <input
                id="rememberMe"
                type="checkbox"
                className="h-4 w-4 text-blue-600 rounded border-gray-300"
                {...register("rememberMe")}
              />
              <label htmlFor="rememberMe" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Remember me for 30 days
              </label>
            </div>

            {/* API Error */}
            {apiError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                <p className="text-sm text-red-800 dark:text-red-200">{apiError}</p>
              </div>
            )}

            {/* Submit Button */}
            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          {/* OAuth Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-600" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-gray-800 text-gray-500">Or continue with</span>
            </div>
          </div>

          {/* OAuth Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => handleOAuthLogin("google")} className="w-full">
              <GoogleIcon className="w-5 h-5 mr-2" />
              Google
            </Button>
            <Button variant="outline" onClick={() => handleOAuthLogin("microsoft")} className="w-full">
              <MicrosoftIcon className="w-5 h-5 mr-2" />
              Microsoft
            </Button>
          </div>

          {/* Sign Up Link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Don't have an account?{" "}
              <Link to="/register" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium">
                Sign up
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            By signing in, you agree to our{" "}
            <a href="/terms" className="underline hover:text-gray-700">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" className="underline hover:text-gray-700">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
```

#### Authentication Hook

```tsx
// File: apps/web-app/src/hooks/useAuth.ts

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi } from "@voiceassist/api-client";
import type { User, AuthTokens } from "@voiceassist/types";

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  loginWithOAuth: (provider: "google" | "microsoft") => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email: string, password: string, rememberMe = false) => {
        set({ isLoading: true });
        try {
          const response = await authApi.login({ email, password, rememberMe });
          set({
            user: response.user,
            tokens: response.tokens,
            isAuthenticated: true,
            isLoading: false,
          });

          // Set up token refresh
          scheduleTokenRefresh(response.tokens.expiresIn);
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      loginWithOAuth: async (provider) => {
        set({ isLoading: true });
        try {
          // Redirect to OAuth provider
          const authUrl = await authApi.getOAuthUrl(provider);
          window.location.href = authUrl;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        const { tokens } = get();
        if (tokens) {
          try {
            await authApi.logout(tokens.refreshToken);
          } catch (error) {
            console.error("Logout failed:", error);
          }
        }
        set({
          user: null,
          tokens: null,
          isAuthenticated: false,
        });
      },

      refreshToken: async () => {
        const { tokens } = get();
        if (!tokens?.refreshToken) {
          throw new Error("No refresh token available");
        }

        try {
          const response = await authApi.refresh(tokens.refreshToken);
          set({
            tokens: response.tokens,
          });
          scheduleTokenRefresh(response.tokens.expiresIn);
        } catch (error) {
          // Refresh failed, logout user
          get().logout();
          throw error;
        }
      },

      updateProfile: async (updates) => {
        const { user } = get();
        if (!user) throw new Error("No user logged in");

        const updatedUser = await authApi.updateProfile(user.id, updates);
        set({ user: updatedUser });
      },
    }),
    {
      name: "voiceassist-auth",
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

// Helper function to schedule token refresh
let refreshTimeout: NodeJS.Timeout | null = null;

function scheduleTokenRefresh(expiresIn: number) {
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
  }

  // Refresh 5 minutes before expiry
  const refreshIn = (expiresIn - 300) * 1000;

  refreshTimeout = setTimeout(() => {
    useAuth.getState().refreshToken();
  }, refreshIn);
}
```

#### Protected Route Component

```tsx
// File: apps/web-app/src/components/auth/ProtectedRoute.tsx

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Spinner } from "@voiceassist/ui";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { isAuthenticated, user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login with return URL
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && user?.role !== "admin") {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
```

#### API Client (Auth Module)

```tsx
// File: packages/api-client/src/auth.ts

import { apiClient } from "./client";
import type { User, AuthTokens } from "@voiceassist/types";

interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  specialty?: string;
}

export const authApi = {
  /**
   * Login with email and password
   */
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>("/api/auth/login", data);
    return response.data;
  },

  /**
   * Register new user account
   */
  register: async (data: RegisterRequest): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>("/api/auth/register", data);
    return response.data;
  },

  /**
   * Get OAuth authorization URL
   */
  getOAuthUrl: async (provider: "google" | "microsoft"): Promise<string> => {
    const response = await apiClient.get<{ url: string }>(`/api/auth/oauth/${provider}`);
    return response.data.url;
  },

  /**
   * Exchange OAuth code for tokens
   */
  oauthCallback: async (provider: string, code: string): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>(`/api/auth/oauth/${provider}/callback`, {
      code,
    });
    return response.data;
  },

  /**
   * Refresh access token
   */
  refresh: async (refreshToken: string): Promise<{ tokens: AuthTokens }> => {
    const response = await apiClient.post<{ tokens: AuthTokens }>("/api/auth/refresh", {
      refreshToken,
    });
    return response.data;
  },

  /**
   * Logout and revoke tokens
   */
  logout: async (refreshToken: string): Promise<void> => {
    await apiClient.post("/api/auth/logout", { refreshToken });
  },

  /**
   * Request password reset email
   */
  requestPasswordReset: async (email: string): Promise<void> => {
    await apiClient.post("/api/auth/forgot-password", { email });
  },

  /**
   * Reset password with token
   */
  resetPassword: async (token: string, newPassword: string): Promise<void> => {
    await apiClient.post("/api/auth/reset-password", { token, newPassword });
  },

  /**
   * Update user profile
   */
  updateProfile: async (userId: string, updates: Partial<User>): Promise<User> => {
    const response = await apiClient.patch<User>(`/api/users/${userId}`, updates);
    return response.data;
  },

  /**
   * Get current user
   */
  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get<User>("/api/auth/me");
    return response.data;
  },
};
```

#### Testing

```tsx
// File: apps/web-app/src/pages/auth/__tests__/LoginPage.test.tsx

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { LoginPage } from "../LoginPage";
import { useAuth } from "@/hooks/useAuth";

// Mock auth hook
vi.mock("@/hooks/useAuth");

describe("LoginPage", () => {
  const mockLogin = vi.fn();
  const mockLoginWithOAuth = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      login: mockLogin,
      loginWithOAuth: mockLoginWithOAuth,
    });
  });

  it("renders login form", () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("validates email format", async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    const emailInput = screen.getByLabelText(/email/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await user.type(emailInput, "invalid-email");
    await user.click(submitButton);

    expect(await screen.findByText(/invalid email address/i)).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("validates password length", async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await user.type(emailInput, "test@example.com");
    await user.type(passwordInput, "short");
    await user.click(submitButton);

    expect(await screen.findByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("submits valid credentials", async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue(undefined);

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await user.type(emailInput, "doctor@hospital.com");
    await user.type(passwordInput, "SecurePass123!");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("doctor@hospital.com", "SecurePass123!", false);
    });
  });

  it("handles login error", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValue({
      response: { status: 401 },
    });

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await user.type(emailInput, "doctor@hospital.com");
    await user.type(passwordInput, "WrongPassword");
    await user.click(submitButton);

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;
    const toggleButton = screen.getByRole("button", { name: /toggle password/i });

    expect(passwordInput.type).toBe("password");

    await user.click(toggleButton);
    expect(passwordInput.type).toBe("text");

    await user.click(toggleButton);
    expect(passwordInput.type).toBe("password");
  });

  it("handles OAuth login", async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>,
    );

    const googleButton = screen.getByRole("button", { name: /google/i });
    await user.click(googleButton);

    expect(mockLoginWithOAuth).toHaveBeenCalledWith("google");
  });
});
```

---

### 1.2 User Registration

**Priority:** P0 (Critical)
**Effort:** 5 days
**Dependencies:** Backend auth API, email service

#### Specification

Registration page for new users with comprehensive validation, email verification, and specialty selection.

**User Flow:**

1. User navigates to `/register`
2. Fills in required information
3. Selects medical specialty
4. Agrees to terms and conditions
5. Submits form
6. Receives verification email
7. Clicks verification link
8. Account activated

**Features:**

- Real-time validation
- Password strength meter
- Email availability check
- Specialty dropdown with search
- Terms acceptance checkbox
- Email verification workflow
- Auto-login after verification

#### Component Implementation

```tsx
// File: apps/web-app/src/pages/auth/RegisterPage.tsx

import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Input, Label, Select } from "@voiceassist/ui";
import { useAuth } from "@/hooks/useAuth";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { medicalSpecialties } from "@/constants/specialties";

const registerSchema = z
  .object({
    firstName: z.string().min(1, "First name is required").max(50),
    lastName: z.string().min(1, "Last name is required").max(50),
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain uppercase letter")
      .regex(/[a-z]/, "Password must contain lowercase letter")
      .regex(/[0-9]/, "Password must contain number")
      .regex(/[^A-Za-z0-9]/, "Password must contain special character"),
    confirmPassword: z.string(),
    specialty: z.string().optional(),
    licenseNumber: z.string().optional(),
    institution: z.string().optional(),
    agreeToTerms: z.boolean().refine((val) => val === true, {
      message: "You must agree to the terms and conditions",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const { register: registerUser } = useAuth();
  const [apiError, setApiError] = useState<string | null>(null);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const password = watch("password");
  const email = watch("email");

  // Check email availability with debounce
  const checkEmailAvailability = useDebouncedCallback(async (email: string) => {
    if (!email || !z.string().email().safeParse(email).success) {
      setEmailAvailable(null);
      return;
    }

    try {
      const available = await authApi.checkEmailAvailability(email);
      setEmailAvailable(available);
    } catch (error) {
      console.error("Failed to check email:", error);
    }
  }, 500);

  useEffect(() => {
    checkEmailAvailability(email);
  }, [email]);

  const onSubmit = async (data: RegisterFormData) => {
    try {
      setApiError(null);
      await registerUser({
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        specialty: data.specialty,
        licenseNumber: data.licenseNumber,
        institution: data.institution,
      });

      // Show verification email sent message
      navigate("/verify-email", {
        state: { email: data.email },
      });
    } catch (error: any) {
      if (error.response?.data?.message) {
        setApiError(error.response.data.message);
      } else {
        setApiError("Registration failed. Please try again.");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="VoiceAssist" className="h-12 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Create Your Account</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Join VoiceAssist to enhance your clinical practice</p>
        </div>

        {/* Registration Form Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name *</Label>
                <Input id="firstName" placeholder="John" error={errors.firstName?.message} {...register("firstName")} />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name *</Label>
                <Input id="lastName" placeholder="Doe" error={errors.lastName?.message} {...register("lastName")} />
              </div>
            </div>

            {/* Email Field */}
            <div>
              <Label htmlFor="email">Email Address *</Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  placeholder="doctor@hospital.com"
                  error={errors.email?.message}
                  {...register("email")}
                />
                {emailAvailable === false && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="text-red-500 text-sm">Already taken</span>
                  </div>
                )}
                {emailAvailable === true && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                  </div>
                )}
              </div>
            </div>

            {/* Password Field */}
            <div>
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                error={errors.password?.message}
                {...register("password")}
              />
              {password && <PasswordStrengthMeter password={password} />}
            </div>

            {/* Confirm Password */}
            <div>
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                error={errors.confirmPassword?.message}
                {...register("confirmPassword")}
              />
            </div>

            {/* Professional Information */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-medium mb-4">Professional Information</h3>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="specialty">Medical Specialty</Label>
                  <Select
                    id="specialty"
                    options={medicalSpecialties}
                    placeholder="Select your specialty"
                    {...register("specialty")}
                  />
                </div>

                <div>
                  <Label htmlFor="licenseNumber">Medical License Number</Label>
                  <Input id="licenseNumber" placeholder="e.g., MD123456" {...register("licenseNumber")} />
                </div>

                <div>
                  <Label htmlFor="institution">Institution/Hospital</Label>
                  <Input id="institution" placeholder="e.g., Memorial Hospital" {...register("institution")} />
                </div>
              </div>
            </div>

            {/* Terms Agreement */}
            <div className="flex items-start">
              <input
                id="agreeToTerms"
                type="checkbox"
                className="h-4 w-4 text-blue-600 rounded border-gray-300 mt-1"
                {...register("agreeToTerms")}
              />
              <label htmlFor="agreeToTerms" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                I agree to the{" "}
                <a href="/terms" target="_blank" className="text-blue-600 hover:underline">
                  Terms of Service
                </a>
                ,{" "}
                <a href="/privacy" target="_blank" className="text-blue-600 hover:underline">
                  Privacy Policy
                </a>
                , and{" "}
                <a href="/hipaa" target="_blank" className="text-blue-600 hover:underline">
                  HIPAA Agreement
                </a>
              </label>
            </div>
            {errors.agreeToTerms && <p className="text-sm text-red-600">{errors.agreeToTerms.message}</p>}

            {/* API Error */}
            {apiError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                <p className="text-sm text-red-800 dark:text-red-200">{apiError}</p>
              </div>
            )}

            {/* Submit Button */}
            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting || emailAvailable === false}>
              {isSubmitting ? "Creating Account..." : "Create Account"}
            </Button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Already have an account?{" "}
              <Link to="/login" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

#### Password Strength Component

```tsx
// File: apps/web-app/src/components/auth/PasswordStrengthMeter.tsx

interface PasswordStrengthMeterProps {
  password: string;
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const strength = calculatePasswordStrength(password);

  const getColor = () => {
    if (strength < 30) return "bg-red-500";
    if (strength < 60) return "bg-yellow-500";
    if (strength < 80) return "bg-blue-500";
    return "bg-green-500";
  };

  const getLabel = () => {
    if (strength < 30) return "Weak";
    if (strength < 60) return "Fair";
    if (strength < 80) return "Good";
    return "Strong";
  };

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 mb-1">
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full transition-all duration-300 ${getColor()}`} style={{ width: `${strength}%` }} />
        </div>
        <span className="text-xs font-medium text-gray-600">{getLabel()}</span>
      </div>
      <ul className="text-xs text-gray-500 space-y-1 mt-2">
        <li className={password.length >= 8 ? "text-green-600" : ""}>✓ At least 8 characters</li>
        <li className={/[A-Z]/.test(password) ? "text-green-600" : ""}>✓ Contains uppercase letter</li>
        <li className={/[a-z]/.test(password) ? "text-green-600" : ""}>✓ Contains lowercase letter</li>
        <li className={/[0-9]/.test(password) ? "text-green-600" : ""}>✓ Contains number</li>
        <li className={/[^A-Za-z0-9]/.test(password) ? "text-green-600" : ""}>✓ Contains special character</li>
      </ul>
    </div>
  );
}

function calculatePasswordStrength(password: string): number {
  let strength = 0;

  // Length
  if (password.length >= 8) strength += 20;
  if (password.length >= 12) strength += 10;
  if (password.length >= 16) strength += 10;

  // Character variety
  if (/[a-z]/.test(password)) strength += 15;
  if (/[A-Z]/.test(password)) strength += 15;
  if (/[0-9]/.test(password)) strength += 15;
  if (/[^A-Za-z0-9]/.test(password)) strength += 15;

  return Math.min(strength, 100);
}
```

---

### 1.3 User Profile Management

**Priority:** P1 (High)
**Effort:** 3 days
**Dependencies:** Auth system

#### Specification

Comprehensive user profile page where users can view and edit their personal and professional information.

**Features:**

- View profile information
- Edit personal details
- Update professional information
- Change password
- Upload profile picture
- Manage notification preferences
- View account activity
- Delete account (with confirmation)

#### Component Implementation

```tsx
// File: apps/web-app/src/pages/settings/ProfilePage.tsx

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Input, Label, Select, Avatar, Tabs, TabsList, TabsTrigger, TabsContent } from "@voiceassist/ui";
import { useAuth } from "@/hooks/useAuth";
import { medicalSpecialties } from "@/constants/specialties";

const profileSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  specialty: z.string().optional(),
  licenseNumber: z.string().optional(),
  institution: z.string().optional(),
  phone: z.string().optional(),
  bio: z.string().max(500).optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      specialty: user?.specialty || "",
      licenseNumber: user?.licenseNumber || "",
      institution: user?.institution || "",
      phone: user?.phone || "",
      bio: user?.bio || "",
    },
  });

  const onSubmit = async (data: ProfileFormData) => {
    setIsSaving(true);
    try {
      await updateProfile(data);
      setIsEditing(false);
      toast.success("Profile updated successfully");
    } catch (error) {
      toast.error("Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    reset();
    setIsEditing(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <Tabs defaultValue="profile">
          <TabsList className="border-b">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <Avatar src={user?.avatarUrl} alt={user?.firstName} size="xl" />
                <div>
                  <h2 className="text-2xl font-bold">
                    {user?.firstName} {user?.lastName}
                  </h2>
                  <p className="text-gray-600">{user?.email}</p>
                  <p className="text-sm text-gray-500">{user?.specialty}</p>
                </div>
              </div>

              {!isEditing && <Button onClick={() => setIsEditing(true)}>Edit Profile</Button>}
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Personal Information */}
              <div>
                <h3 className="text-lg font-medium mb-4">Personal Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      disabled={!isEditing}
                      error={errors.firstName?.message}
                      {...register("firstName")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      disabled={!isEditing}
                      error={errors.lastName?.message}
                      {...register("lastName")}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      disabled={!isEditing}
                      placeholder="+1 (555) 000-0000"
                      {...register("phone")}
                    />
                  </div>
                </div>
              </div>

              {/* Professional Information */}
              <div>
                <h3 className="text-lg font-medium mb-4">Professional Information</h3>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="specialty">Medical Specialty</Label>
                    <Select
                      id="specialty"
                      disabled={!isEditing}
                      options={medicalSpecialties}
                      {...register("specialty")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="licenseNumber">Medical License Number</Label>
                    <Input id="licenseNumber" disabled={!isEditing} {...register("licenseNumber")} />
                  </div>
                  <div>
                    <Label htmlFor="institution">Institution/Hospital</Label>
                    <Input id="institution" disabled={!isEditing} {...register("institution")} />
                  </div>
                  <div>
                    <Label htmlFor="bio">Bio</Label>
                    <textarea
                      id="bio"
                      disabled={!isEditing}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="Tell us about yourself..."
                      {...register("bio")}
                    />
                    <p className="text-xs text-gray-500 mt-1">Maximum 500 characters</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              {isEditing && (
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!isDirty || isSaving}>
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              )}
            </form>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="p-6">
            <ChangePasswordForm />
            <div className="mt-8 pt-8 border-t">
              <TwoFactorAuthSetup />
            </div>
            <div className="mt-8 pt-8 border-t border-red-200">
              <DangerZone />
            </div>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="p-6">
            <NotificationPreferences />
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="p-6">
            <AccountActivity />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
```

---

_This document continues with detailed specifications for all 55 features. Due to length constraints, I'm showing the format and depth. Would you like me to continue with the remaining features in this document, or shall I proceed to create the other planning documents (Admin Panel, Docs Site, Technical Architecture, etc.)?_

**Current Progress:**

- ✅ MASTER_IMPLEMENTATION_PLAN.md (Complete - 20,000+ words)
- ⏳ WEB_APP_FEATURE_SPECS.md (In progress - showing 3 of 55 features with full code examples)

**Next Steps:**

1. Complete remaining 52 web app features (estimated 40,000+ more words)
2. Create ADMIN_PANEL_FEATURE_SPECS.md
3. Create DOCS_SITE_FEATURE_SPECS.md
4. Create TECHNICAL_ARCHITECTURE.md
5. Create INTEGRATION_GUIDE.md
6. Create CODE_EXAMPLES.md
7. Create DEVELOPMENT_WORKFLOW.md
8. Update existing README files
9. Prepare GitHub commit

Should I continue with Option A (complete all documents), or would you like to review what I've created so far and provide feedback before I continue?
