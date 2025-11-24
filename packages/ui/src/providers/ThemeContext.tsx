/**
 * Theme Context
 * Provides theme state and controls to the entire application
 */
import { createContext } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeContextValue {
  /**
   * Current theme setting (can be 'system')
   */
  theme: Theme;

  /**
   * Resolved theme (actual theme being used, never 'system')
   */
  resolvedTheme: ResolvedTheme;

  /**
   * Set the theme
   */
  setTheme: (theme: Theme) => void;

  /**
   * Toggle between light and dark mode
   */
  toggleTheme: () => void;

  /**
   * Whether system preference is being used
   */
  isSystemTheme: boolean;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(
  undefined
);
