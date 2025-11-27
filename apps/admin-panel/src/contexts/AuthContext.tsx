import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  getApiClient,
  persistRole,
  persistTokens,
  clearTokens,
  getStoredRole,
} from "../lib/apiClient";
import type { User as ApiUser } from "@voiceassist/types";

type UserRole = "admin" | "viewer";

interface AdminUser {
  id: string;
  email: string;
  full_name?: string;
  is_admin: boolean;
  is_active: boolean;
  role: UserRole;
}

interface AuthContextType {
  user: AdminUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  role: UserRole;
  isViewer: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const deriveRole = (incomingRole?: string): UserRole =>
    incomingRole === "viewer" ? "viewer" : "admin";

  const apiClient = getApiClient();

  // Check for existing session on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const storedRole = deriveRole(getStoredRole() || undefined);
      const token = localStorage.getItem("auth_token");
      if (!token) {
        setLoading(false);
        return;
      }

      const profile: ApiUser = await apiClient.getCurrentUser();
      const role = deriveRole(profile.role || storedRole);
      persistRole(role);

      setUser({
        id: profile.id,
        email: profile.email,
        full_name: profile.name,
        is_admin: role === "admin",
        is_active: true,
        role,
      });
    } catch (err) {
      console.error("Auth check failed:", err);
      clearTokens();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setError(null);
      const tokens = await apiClient.login({ email, password });
      persistTokens(tokens.accessToken, tokens.refreshToken);

      const profile = await apiClient.getCurrentUser();
      const role = deriveRole(profile.role);
      persistRole(role);

      setUser({
        id: profile.id,
        email: profile.email,
        full_name: profile.name,
        is_admin: role === "admin",
        is_active: true,
        role,
      });
    } catch (err: any) {
      setError(err.message || "Login failed");
      clearTokens();
      throw err;
    }
  };

  const logout = () => {
    clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        logout,
        isAuthenticated: !!user,
        isAdmin: user?.is_admin || false,
        role: user?.role || "admin",
        isViewer: user?.role === "viewer",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
