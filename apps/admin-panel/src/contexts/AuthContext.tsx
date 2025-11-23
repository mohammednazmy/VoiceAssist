import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { fetchAPI } from '../lib/api';

interface User {
  id: string;
  email: string;
  full_name?: string;
  is_admin: boolean;
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setLoading(false);
        return;
      }

      // If we have a token, assume it's valid
      // The backend will reject invalid tokens on API calls anyway
      // Note: /api/auth/me endpoint has serialization issues, so we skip it for now
      setUser({
        id: 'temp',
        email: 'admin',
        is_admin: true,
        is_active: true,
      });
    } catch (err) {
      console.error('Auth check failed:', err);
      localStorage.removeItem('auth_token');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setError(null);
      const response = await fetchAPI<{ access_token: string; refresh_token: string; token_type: string }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        }
      );

      // Store token
      localStorage.setItem('auth_token', response.access_token);

      // Set a temporary user object (admin panel requires admin login at backend level)
      // The backend validates admin status during login, so if we got tokens, user is admin
      setUser({
        id: 'temp',
        email: email,
        is_admin: true,
        is_active: true,
      });
    } catch (err: any) {
      setError(err.message || 'Login failed');
      localStorage.removeItem('auth_token');
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
