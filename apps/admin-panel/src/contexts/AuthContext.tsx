import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
// import { fetchAPI } from '../lib/api'; // TODO: Use when implementing real auth

type UserRole = "admin" | "viewer";

interface User {
  id: string;
  email: string;
  full_name?: string;
  is_admin: boolean;
  is_active: boolean;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const deriveRole = useCallback(
    (incomingRole?: string): UserRole =>
      incomingRole === "viewer" ? "viewer" : "admin",
    [],
  );

  const checkAuth = useCallback(async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const storedRole = deriveRole(localStorage.getItem("auth_role") || undefined);
      if (!token) {
        setLoading(false);
        return;
      }

      // If we have a token, assume it's valid
      // The backend will reject invalid tokens on API calls anyway
      // Note: /api/auth/me endpoint has serialization issues, so we skip it for now
      setUser({
        id: "temp",
        email: "admin",
        is_admin: storedRole === "admin",
        is_active: true,
        role: storedRole,
      });
    } catch (err) {
      console.error("Auth check failed:", err);
      localStorage.removeItem("auth_token");
    } finally {
      setLoading(false);
    }
  }, [deriveRole]);

  // Check for existing session on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email: string, password: string) => {
    try {
      setError(null);
      // Auth endpoints return flat responses, not wrapped in APIEnvelope
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        throw new Error(`Login failed: ${res.statusText}`);
      }

      const response = (await res.json()) as {
        access_token: string;
        refresh_token: string;
        token_type: string;
        role?: string;
      };

      // Store token
      localStorage.setItem("auth_token", response.access_token);
      const role = deriveRole(response.role);
      localStorage.setItem("auth_role", role);

      // Set a temporary user object (admin panel requires admin login at backend level)
      // The backend validates admin status during login, so if we got tokens, user is admin
      setUser({
        id: "temp",
        email: email,
        is_admin: role === "admin",
        is_active: true,
        role,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      localStorage.removeItem("auth_token");
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_role");
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
