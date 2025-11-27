/**
 * Theme Context
 * Provides theme state and toggle functionality
 */

import React, { createContext, useContext, useState, useEffect } from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    // Check localStorage for saved theme
    const savedTheme = localStorage.getItem("voiceassist-theme");
    if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
      return savedTheme;
    }
    return "system";
  });

  // Resolve "system" to actual light/dark based on OS preference
  const getResolvedTheme = (): ResolvedTheme => {
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return theme;
  };

  useEffect(() => {
    const resolved = getResolvedTheme();
    // Update document class
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(resolved);
    // Save to localStorage
    localStorage.setItem("voiceassist-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
