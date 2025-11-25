/**
 * Protected Route Component
 * Redirects to login if user is not authenticated
 * Waits for Zustand persist hydration to complete before checking auth
 */

import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, _hasHydrated } = useAuthStore();
  const location = useLocation();

  // Debug logging for E2E tests
  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    console.log("[ProtectedRoute] State:", {
      isAuthenticated,
      isLoading,
      _hasHydrated,
      path: location.pathname,
    });
  }

  // Wait for Zustand persist to hydrate from localStorage
  // This prevents premature redirects before auth state is loaded
  if (!_hasHydrated) {
    console.log("[ProtectedRoute] Waiting for hydration...");
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
      </div>
    );
  }

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
