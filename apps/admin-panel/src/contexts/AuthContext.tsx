import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useRef,
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
  const refreshTimeout = useRef<number | null>(null);

  const deriveRole = (incomingRole?: string): UserRole =>
    incomingRole === "viewer" ? "viewer" : "admin";

  type DecodedToken = {
    sub?: string;
    email?: string;
    role?: string;
    exp?: number;
  };

  const decodeToken = (token?: string): DecodedToken | null => {
    if (!token) return null;
    try {
      const [, payload] = token.split(".");
      return JSON.parse(atob(payload)) as DecodedToken;
    } catch (err) {
      console.warn("Failed to decode token", err);
      return null;
    }
  };

  async function refreshWithStoredToken() {
    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) {
      throw new Error("No refresh token available");
    }

    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      throw new Error(`Refresh failed: ${res.statusText}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      role?: string;
    };

    persistSession(data.access_token, data.refresh_token, data.role);
  }

  const scheduleRefresh = (accessToken: string) => {
    const decoded = decodeToken(accessToken);
    if (!decoded?.exp) return;

    if (refreshTimeout.current) {
      window.clearTimeout(refreshTimeout.current);
    }

    const delay = Math.max(decoded.exp * 1000 - Date.now() - 30_000, 5_000);
    refreshTimeout.current = window.setTimeout(() => {
      refreshWithStoredToken().catch(() => logout());
    }, delay);
  };

  const persistSession = (
    accessToken: string,
    refreshToken: string,
    responseRole?: string,
  ) => {
    const decoded = decodeToken(accessToken);
    const role = deriveRole(
      responseRole || decoded?.role || localStorage.getItem("auth_role") || undefined,
    );

    localStorage.setItem("auth_token", accessToken);
    localStorage.setItem("refresh_token", refreshToken);
    localStorage.setItem("auth_role", role);

    setUser({
      id: decoded?.sub || "temp",
      email: decoded?.email || "admin",
      is_admin: role === "admin",
      is_active: true,
      role,
    });

    scheduleRefresh(accessToken);
  };

  // Check for existing session on mount
  useEffect(() => {
    checkAuth();
    return () => {
      if (refreshTimeout.current) {
        window.clearTimeout(refreshTimeout.current);
      }
    };
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const refreshToken = localStorage.getItem("refresh_token");
      const decoded = decodeToken(token || undefined);

      if (token && decoded?.exp && decoded.exp * 1000 > Date.now()) {
        const role = deriveRole(
          decoded.role || localStorage.getItem("auth_role") || undefined,
        );
        setUser({
          id: decoded?.sub || "temp",
          email: decoded?.email || "admin",
          is_admin: role === "admin",
          is_active: true,
          role,
        });
        scheduleRefresh(token);
        return;
      }

      if (refreshToken) {
        await refreshWithStoredToken();
        return;
      }

      localStorage.removeItem("auth_token");
      localStorage.removeItem("refresh_token");
    } catch (err) {
      console.error("Auth check failed:", err);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setError(null);
      setLoading(true);
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

      persistSession(response.access_token, response.refresh_token, response.role);
    } catch (err: any) {
      setError(err.message || "Login failed");
      logout();
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    if (refreshTimeout.current) {
      window.clearTimeout(refreshTimeout.current);
      refreshTimeout.current = null;
    }
    localStorage.removeItem("auth_token");
    localStorage.removeItem("refresh_token");
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
