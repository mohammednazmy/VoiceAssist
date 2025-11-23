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

      const userData = await fetchAPI<User>('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (userData.is_admin) {
        setUser(userData);
      } else {
        setError('Access denied: Admin privileges required');
        localStorage.removeItem('auth_token');
      }
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

      // Store token first
      localStorage.setItem('auth_token', response.access_token);

      // Fetch user data with the new token
      const userData = await fetchAPI<User>('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${response.access_token}`,
        },
      });

      if (!userData.is_admin) {
        localStorage.removeItem('auth_token');
        throw new Error('Access denied: Admin privileges required');
      }

      setUser(userData);
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
