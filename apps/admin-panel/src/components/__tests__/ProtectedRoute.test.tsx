/**
 * ProtectedRoute Component Tests
 * Tests route protection based on authentication and role
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProtectedRoute } from "../ProtectedRoute";

// Mock useAuth hook
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../../contexts/AuthContext";

const mockUseAuth = vi.mocked(useAuth);

// Test wrapper with router
function renderWithRouter(
  ui: React.ReactElement,
  { route = "/" }: { route?: string } = {},
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/" element={ui} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loading state", () => {
    it("should show loading indicator when auth is loading", () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isAdmin: false,
        isViewer: false,
        loading: true,
        user: null,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        role: "admin",
      });

      renderWithRouter(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>,
      );

      expect(screen.getByText("Loading...")).toBeInTheDocument();
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    });
  });

  describe("unauthenticated access", () => {
    it("should redirect to login when not authenticated", () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isAdmin: false,
        isViewer: false,
        loading: false,
        user: null,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        role: "admin",
      });

      renderWithRouter(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>,
      );

      expect(screen.getByText("Login Page")).toBeInTheDocument();
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    });

    it("should redirect to login when authenticated but not admin or viewer", () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isAdmin: false,
        isViewer: false,
        loading: false,
        user: { id: "1", email: "user@example.com", is_admin: false, is_active: true, role: "viewer" as const },
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        role: "viewer",
      });

      renderWithRouter(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>,
      );

      expect(screen.getByText("Login Page")).toBeInTheDocument();
      expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    });
  });

  describe("authenticated admin access", () => {
    it("should render children when authenticated as admin", () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isAdmin: true,
        isViewer: false,
        loading: false,
        user: { id: "1", email: "admin@example.com", is_admin: true, is_active: true, role: "admin" as const },
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        role: "admin",
      });

      renderWithRouter(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>,
      );

      expect(screen.getByText("Protected Content")).toBeInTheDocument();
      expect(screen.queryByText("Login Page")).not.toBeInTheDocument();
    });
  });

  describe("authenticated viewer access", () => {
    it("should render children when authenticated as viewer", () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isAdmin: false,
        isViewer: true,
        loading: false,
        user: { id: "2", email: "viewer@example.com", is_admin: false, is_active: true, role: "viewer" as const },
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        role: "viewer",
      });

      renderWithRouter(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>,
      );

      expect(screen.getByText("Protected Content")).toBeInTheDocument();
      expect(screen.queryByText("Login Page")).not.toBeInTheDocument();
    });
  });

  describe("both admin and viewer", () => {
    it("should render children when user has both roles", () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isAdmin: true,
        isViewer: true,
        loading: false,
        user: { id: "3", email: "superuser@example.com", is_admin: true, is_active: true, role: "admin" as const },
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        role: "admin",
      });

      renderWithRouter(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>,
      );

      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });
  });

  describe("complex children", () => {
    it("should render nested components correctly", () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isAdmin: true,
        isViewer: false,
        loading: false,
        user: { id: "1", email: "admin@example.com", is_admin: true, is_active: true, role: "admin" as const },
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        role: "admin",
      });

      renderWithRouter(
        <ProtectedRoute>
          <div>
            <header>Admin Header</header>
            <main>
              <section>Dashboard Content</section>
            </main>
          </div>
        </ProtectedRoute>,
      );

      expect(screen.getByText("Admin Header")).toBeInTheDocument();
      expect(screen.getByText("Dashboard Content")).toBeInTheDocument();
    });
  });
});
