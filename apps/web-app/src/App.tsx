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
    <BrowserRouter
      future={{
        // Enable React Router v7 future flags to suppress warnings
        // and prepare for v7 compatibility
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <ThemeProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
