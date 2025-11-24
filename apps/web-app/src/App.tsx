/**
 * Main Application Component
 * Performance-optimized with lazy loading and code splitting
 */

import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./AppRoutes";
import { ToastProvider } from "./contexts/ToastContext";
import { ThemeProvider } from "./contexts/ThemeContext";

export function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
