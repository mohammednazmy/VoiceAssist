/**
 * Theme Provider
 * Manages theme state and applies theme to the document
 *
 * Features:
 * - Light/Dark/System theme support
 * - localStorage persistence
 * - System preference detection
 * - No flash of wrong theme on load
 * - Smooth transitions between themes
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ThemeContext, Theme, ResolvedTheme } from './ThemeContext';

const STORAGE_KEY = 'voiceassist-theme';
const THEME_ATTRIBUTE = 'data-theme';

interface ThemeProviderProps {
  /**
   * Default theme (defaults to 'system')
   */
  defaultTheme?: Theme;

  /**
   * Children to render
   */
  children: React.ReactNode;

  /**
   * Force a specific theme (for testing/storybook)
   */
  forcedTheme?: ResolvedTheme;
}

/**
 * Get the system theme preference
 */
function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

/**
 * Get the stored theme from localStorage
 */
function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch (error) {
    // localStorage might be blocked
    console.warn('Failed to read theme from localStorage:', error);
  }

  return null;
}

/**
 * Store the theme in localStorage
 */
function storeTheme(theme: Theme): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (error) {
    // localStorage might be blocked
    console.warn('Failed to write theme to localStorage:', error);
  }
}

/**
 * Apply the theme to the document
 */
function applyTheme(theme: ResolvedTheme): void {
  if (typeof window === 'undefined') {
    return;
  }

  const root = document.documentElement;

  // Remove existing theme class/attribute
  root.removeAttribute(THEME_ATTRIBUTE);

  // Add new theme
  root.setAttribute(THEME_ATTRIBUTE, theme);

  // Also add as class for Tailwind dark mode
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
}

/**
 * Theme Provider Component
 */
export function ThemeProvider({
  defaultTheme = 'system',
  children,
  forcedTheme,
}: ThemeProviderProps) {
  // Initialize theme from storage or default
  const [theme, setThemeState] = useState<Theme>(() => {
    if (forcedTheme) {
      return forcedTheme;
    }
    return getStoredTheme() ?? defaultTheme;
  });

  // System theme (updated when system preference changes)
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  // Resolved theme (never 'system')
  const resolvedTheme: ResolvedTheme = useMemo(() => {
    if (forcedTheme) {
      return forcedTheme;
    }
    return theme === 'system' ? systemTheme : theme;
  }, [theme, systemTheme, forcedTheme]);

  // Set theme and persist to storage
  const setTheme = useCallback(
    (newTheme: Theme) => {
      if (forcedTheme) {
        console.warn('Theme is forced, cannot change');
        return;
      }

      setThemeState(newTheme);
      storeTheme(newTheme);
    },
    [forcedTheme]
  );

  // Toggle between light and dark
  const toggleTheme = useCallback(() => {
    if (forcedTheme) {
      console.warn('Theme is forced, cannot toggle');
      return;
    }

    setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
  }, [resolvedTheme, setTheme, forcedTheme]);

  // Apply theme to document when resolved theme changes
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  // Listen for system theme changes
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      const newSystemTheme = e.matches ? 'dark' : 'light';
      setSystemTheme(newSystemTheme);
    };

    // Initial check
    handleChange(mediaQuery);

    // Listen for changes
    // Use addEventListener if available (modern browsers)
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  // Context value
  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
      isSystemTheme: theme === 'system',
    }),
    [theme, resolvedTheme, setTheme, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
