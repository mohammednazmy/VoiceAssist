/**
 * Main Application Component
 * Performance-optimized with lazy loading and code splitting
 *
 * Phase 9.1: Added i18n and RTL support
 * Phase 9.2: PWA Support
 * Phase 11: Analytics & Observability
 * Phase 12: Accessibility & Compliance
 */

import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./AppRoutes";
import { ToastProvider } from "./contexts/ToastContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { PWAPrompt } from "./components/PWAPrompt";
import { ErrorBoundary } from "./lib/analytics";
import { SkipLinks } from "./lib/accessibility/SkipLinks";
import { AccessibilityProvider } from "./lib/accessibility/AccessibilitySettings";
import { AnnouncerProvider } from "./lib/accessibility/Announcer";
import { LanguageToolbar } from "./components/LanguageToolbar";
import { AnalyticsOptInLayout } from "./components/layout/AnalyticsOptInLayout";

// Analytics configuration - set provider and domain in environment
const analyticsConfig = {
  provider: (import.meta.env.VITE_ANALYTICS_PROVIDER || "none") as
    | "plausible"
    | "fathom"
    | "custom"
    | "none",
  domain: import.meta.env.VITE_ANALYTICS_DOMAIN,
  apiHost: import.meta.env.VITE_ANALYTICS_HOST,
  respectDoNotTrack: true,
  enableAutoPageviews: true,
  trackLocalhost: import.meta.env.DEV,
};

// Skip links for keyboard navigation
const skipLinks = [
  { id: "main-content", label: "Skip to main content" },
  { id: "chat-input", label: "Skip to chat input" },
  { id: "sidebar", label: "Skip to sidebar" },
];

export function App() {
  return (
    <ErrorBoundary showDialog={true}>
      <AnalyticsOptInLayout config={analyticsConfig}>
        <AccessibilityProvider>
          <AnnouncerProvider>
            <BrowserRouter
              future={{
                // Enable React Router v7 future flags to suppress warnings
                // and prepare for v7 compatibility
                v7_startTransition: true,
                v7_relativeSplatPath: true,
              }}
            >
              <SkipLinks links={skipLinks} />
              <LanguageProvider>
                <ThemeProvider>
                  <ToastProvider>
                    <LanguageToolbar />
                    <AppRoutes />
                    <PWAPrompt />
                  </ToastProvider>
                </ThemeProvider>
              </LanguageProvider>
            </BrowserRouter>
          </AnnouncerProvider>
        </AccessibilityProvider>
      </AnalyticsOptInLayout>
    </ErrorBoundary>
  );
}
