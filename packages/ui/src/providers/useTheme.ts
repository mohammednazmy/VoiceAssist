/**
 * useTheme Hook
 * Access theme context from any component
 */
import { useContext } from "react";
import { ThemeContext, ThemeContextValue } from "./ThemeContext";

/**
 * Hook to access theme context
 * Must be used within a ThemeProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { theme, setTheme, toggleTheme } = useTheme();
 *
 *   return (
 *     <div>
 *       <p>Current theme: {theme}</p>
 *       <button onClick={toggleTheme}>Toggle Theme</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
