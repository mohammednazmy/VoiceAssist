import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useRef,
} from "react";
import {
  getApiClient,
  persistRole,
  persistTokens,
  clearTokens,
  getStoredRole,
} from "../lib/apiClient";
import { isTwoFactorRequired } from "@voiceassist/api-client";

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
    // JWT payload is base64url encoded (not base64)
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as DecodedToken;
  } catch (err) {
    console.warn("Failed to decode token", err);
    return null;
  }
};

type CurrentUserProfile = {
  id: string;
  email: string;
  full_name?: string;
  name?: string;
  is_active?: boolean;
  is_admin?: boolean;
  admin_role?: string;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  console.log("[AuthContext] AuthProvider mounting");
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshTimeout = useRef<number | null>(null);

  const deriveRole = useCallback((input?: {
    tokenRole?: string;
    adminRole?: string;
    isAdmin?: boolean;
    storedRole?: string | null;
  }): UserRole => {
    const normalize = (role?: string | null) => role?.trim().toLowerCase();
    const tokenRole = normalize(input?.tokenRole);
    const adminRole = normalize(input?.adminRole);
    const storedRole = normalize(input?.storedRole);

    const isAdminRole = (role?: string) => role === "admin" || role === "super_admin";
    const isViewerRole = (role?: string) => role === "viewer";

    if (isAdminRole(tokenRole) || isAdminRole(adminRole) || input?.isAdmin) return "admin";
    if (isViewerRole(tokenRole) || isViewerRole(adminRole) || isViewerRole(storedRole)) return "viewer";
    return "viewer";
  }, []);

  console.log("[AuthContext] Getting API client...");
  const apiClient = getApiClient();
  console.log("[AuthContext] API client obtained, baseURL:", apiClient.getBaseUrl());

  const scheduleRefresh = useCallback(
    (accessToken: string) => {
      const decoded = decodeToken(accessToken);
      if (!decoded?.exp) return;

      if (refreshTimeout.current) {
        window.clearTimeout(refreshTimeout.current);
      }

      // Refresh 30 seconds before expiry, minimum 5 seconds
      const delay = Math.max(decoded.exp * 1000 - Date.now() - 30_000, 5_000);
      refreshTimeout.current = window.setTimeout(async () => {
        try {
          const refreshToken = localStorage.getItem("auth_refresh_token");
          if (refreshToken) {
            const tokens = await apiClient.refreshToken(refreshToken);
            persistTokens(tokens.accessToken, tokens.refreshToken);
            scheduleRefresh(tokens.accessToken);
          }
        } catch {
          clearTokens();
          setUser(null);
        }
      }, delay);
    },
    [apiClient],
  );

  const checkAuth = useCallback(async () => {
    console.log("[AuthContext] checkAuth() starting...");
    console.log("[AuthContext] Current URL:", window.location.href);
    try {
      const storedRole = getStoredRole();
      const token = localStorage.getItem("auth_token");
      console.log("[AuthContext] Stored role:", storedRole || "none");
      console.log("[AuthContext] Has token:", !!token);

      if (!token) {
        console.log("[AuthContext] No token found, setting loading=false");
        setLoading(false);
        return;
      }

      const buildUser = (profile: CurrentUserProfile, role: UserRole): AdminUser => ({
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name || profile.name,
        is_admin: role === "admin",
        is_active: profile.is_active ?? true,
        role,
      });

      const fetchAndSetUser = async (accessTokenForRefresh?: string) => {
        const profile = (await apiClient.getCurrentUser()) as unknown as CurrentUserProfile;
        const role = deriveRole({
          tokenRole: decodeToken(accessTokenForRefresh || token)?.role,
          adminRole: profile.admin_role,
          isAdmin: profile.is_admin,
          storedRole,
        });
        persistRole(role);
        setUser(buildUser(profile, role));
        scheduleRefresh(accessTokenForRefresh || token);
      };

      try {
        await fetchAndSetUser();
        return;
      } catch (profileErr) {
        // Try to refresh if the access token is rejected/expired
        const refreshToken = localStorage.getItem("auth_refresh_token");
        if (!refreshToken) throw profileErr;

        const tokens = await apiClient.refreshToken(refreshToken);
        persistTokens(tokens.accessToken, tokens.refreshToken);
        await fetchAndSetUser(tokens.accessToken);
        return;
      }
    } catch (err) {
      console.error("Auth check failed:", err);
      clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [deriveRole, apiClient, scheduleRefresh]);

  // Check for existing session on mount
  useEffect(() => {
    checkAuth();
    return () => {
      if (refreshTimeout.current) {
        window.clearTimeout(refreshTimeout.current);
      }
    };
  }, [checkAuth]);

  const login = async (email: string, password: string) => {
    try {
      setError(null);
      setLoading(true);

      const response = await apiClient.login({ email, password });

      // Check if 2FA is required
      if (isTwoFactorRequired(response)) {
        // TODO: Handle 2FA flow - redirect to 2FA verification page
        setError("Two-factor authentication required");
        throw new Error("Two-factor authentication required");
      }

      // response is now narrowed to AuthTokens
      persistTokens(response.accessToken, response.refreshToken);

      const profile = (await apiClient.getCurrentUser()) as unknown as CurrentUserProfile;
      const role = deriveRole({
        tokenRole: decodeToken(response.accessToken)?.role,
        adminRole: profile.admin_role,
        isAdmin: profile.is_admin,
        storedRole: null,
      });
      persistRole(role);

      setUser({
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name || profile.name,
        is_admin: role === "admin",
        is_active: profile.is_active ?? true,
        role,
      });

      scheduleRefresh(response.accessToken);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      clearTokens();
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
        role: user?.role || "viewer",
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
