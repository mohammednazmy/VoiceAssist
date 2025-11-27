/**
 * Analytics Provider - Phase 11: Analytics & Observability
 *
 * Privacy-respecting analytics with Plausible/Fathom support.
 * Tracks user journeys, feature adoption, and error rates.
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
} from "react";

// Analytics event types
export interface AnalyticsEvent {
  name: string;
  props?: Record<string, string | number | boolean>;
}

// Page view tracking
export interface PageView {
  url: string;
  referrer?: string;
  title?: string;
}

// Analytics configuration
export interface AnalyticsConfig {
  provider: "plausible" | "fathom" | "custom" | "none";
  domain?: string;
  apiHost?: string;
  trackLocalhost?: boolean;
  respectDoNotTrack?: boolean;
  enableAutoPageviews?: boolean;
}

// Analytics context value
interface AnalyticsContextValue {
  trackEvent: (event: AnalyticsEvent) => void;
  trackPageView: (pageView?: Partial<PageView>) => void;
  trackError: (error: Error, context?: Record<string, unknown>) => void;
  trackTiming: (category: string, name: string, duration: number) => void;
  setUserProperties: (props: Record<string, string | number | boolean>) => void;
  isEnabled: boolean;
}

const AnalyticsContext = createContext<AnalyticsContextValue | undefined>(
  undefined,
);

// Default config
const DEFAULT_CONFIG: AnalyticsConfig = {
  provider: "none",
  respectDoNotTrack: true,
  enableAutoPageviews: true,
  trackLocalhost: false,
};

// Plausible script URL
const PLAUSIBLE_SCRIPT = "https://plausible.io/js/script.js";

interface AnalyticsProviderProps {
  children: React.ReactNode;
  config?: Partial<AnalyticsConfig>;
}

export function AnalyticsProvider({
  children,
  config: userConfig,
}: AnalyticsProviderProps) {
  const config = { ...DEFAULT_CONFIG, ...userConfig };
  const scriptLoadedRef = useRef(false);
  const queueRef = useRef<AnalyticsEvent[]>([]);
  const isEnabledRef = useRef(false);

  // Check if analytics should be enabled
  const shouldEnable = useCallback(() => {
    // Respect Do Not Track
    if (config.respectDoNotTrack && navigator.doNotTrack === "1") {
      return false;
    }

    // Don't track localhost unless explicitly enabled
    if (!config.trackLocalhost && window.location.hostname === "localhost") {
      return false;
    }

    return config.provider !== "none" && !!config.domain;
  }, [config]);

  // Load Plausible script
  useEffect(() => {
    if (!shouldEnable() || scriptLoadedRef.current) return;

    if (config.provider === "plausible" && config.domain) {
      const script = document.createElement("script");
      script.src = config.apiHost
        ? `${config.apiHost}/js/script.js`
        : PLAUSIBLE_SCRIPT;
      script.defer = true;
      script.dataset.domain = config.domain;

      if (config.apiHost) {
        script.dataset.api = `${config.apiHost}/api/event`;
      }

      script.onload = () => {
        scriptLoadedRef.current = true;
        isEnabledRef.current = true;

        // Process queued events
        while (queueRef.current.length > 0) {
          const event = queueRef.current.shift();
          if (event) {
            trackEventInternal(event);
          }
        }
      };

      document.head.appendChild(script);

      return () => {
        document.head.removeChild(script);
      };
    }
  }, [config, shouldEnable]);

  // Internal event tracking
  const trackEventInternal = useCallback(
    (event: AnalyticsEvent) => {
      if (config.provider === "plausible" && typeof window !== "undefined") {
        // Plausible custom event
        const plausible = (
          window as Window & {
            plausible?: (
              name: string,
              options?: { props?: Record<string, unknown> },
            ) => void;
          }
        ).plausible;
        if (plausible) {
          plausible(event.name, { props: event.props });
        }
      }
    },
    [config.provider],
  );

  // Track custom event
  const trackEvent = useCallback(
    (event: AnalyticsEvent) => {
      if (!shouldEnable()) return;

      if (!scriptLoadedRef.current) {
        // Queue events if script not loaded yet
        queueRef.current.push(event);
        return;
      }

      trackEventInternal(event);

      // Console log in development
      if (process.env.NODE_ENV === "development") {
        console.log("[Analytics] Event:", event.name, event.props);
      }
    },
    [shouldEnable, trackEventInternal],
  );

  // Track page view
  const trackPageView = useCallback(
    (pageView?: Partial<PageView>) => {
      if (!shouldEnable()) return;

      const url =
        pageView?.url || window.location.pathname + window.location.search;

      if (config.provider === "plausible") {
        // Plausible handles pageviews automatically, but we can track manually
        trackEvent({
          name: "pageview",
          props: {
            url,
            referrer: pageView?.referrer || document.referrer,
            title: pageView?.title || document.title,
          },
        });
      }

      if (process.env.NODE_ENV === "development") {
        console.log("[Analytics] Page View:", url);
      }
    },
    [shouldEnable, config.provider, trackEvent],
  );

  // Track errors
  const trackError = useCallback(
    (error: Error, context?: Record<string, unknown>) => {
      if (!shouldEnable()) return;

      trackEvent({
        name: "Error",
        props: {
          message: error.message,
          stack: error.stack?.slice(0, 500) || "No stack",
          ...(context &&
            Object.fromEntries(
              Object.entries(context).map(([k, v]) => [k, String(v)]),
            )),
        },
      });
    },
    [shouldEnable, trackEvent],
  );

  // Track timing (for performance metrics)
  const trackTiming = useCallback(
    (category: string, name: string, duration: number) => {
      if (!shouldEnable()) return;

      trackEvent({
        name: "Timing",
        props: {
          category,
          name,
          duration: Math.round(duration),
        },
      });
    },
    [shouldEnable, trackEvent],
  );

  // Set user properties (for segmentation)
  const setUserProperties = useCallback(
    (props: Record<string, string | number | boolean>) => {
      // Store in session for event enrichment
      if (typeof window !== "undefined") {
        (
          window as Window & { __analyticsUserProps?: Record<string, unknown> }
        ).__analyticsUserProps = props;
      }

      if (process.env.NODE_ENV === "development") {
        console.log("[Analytics] User Properties:", props);
      }
    },
    [],
  );

  const value: AnalyticsContextValue = {
    trackEvent,
    trackPageView,
    trackError,
    trackTiming,
    setUserProperties,
    isEnabled: shouldEnable(),
  };

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
}

// Hook to use analytics
export function useAnalytics(): AnalyticsContextValue {
  const context = useContext(AnalyticsContext);

  if (!context) {
    // Return no-op functions if used outside provider
    return {
      trackEvent: () => {},
      trackPageView: () => {},
      trackError: () => {},
      trackTiming: () => {},
      setUserProperties: () => {},
      isEnabled: false,
    };
  }

  return context;
}

// Predefined event helpers
export const AnalyticsEvents = {
  // Chat events
  chatStarted: () => ({ name: "Chat Started" }),
  messageSent: (messageLength: number) => ({
    name: "Message Sent",
    props: { messageLength },
  }),
  messageReceived: (responseTime: number) => ({
    name: "Message Received",
    props: { responseTime },
  }),

  // Voice events
  voiceSessionStarted: () => ({ name: "Voice Session Started" }),
  voiceSessionEnded: (duration: number) => ({
    name: "Voice Session Ended",
    props: { duration },
  }),
  voiceError: (errorType: string) => ({
    name: "Voice Error",
    props: { errorType },
  }),

  // Export events
  exportStarted: (format: string) => ({
    name: "Export Started",
    props: { format },
  }),
  exportCompleted: (format: string, size: number) => ({
    name: "Export Completed",
    props: { format, size },
  }),

  // Feature usage
  featureUsed: (feature: string) => ({
    name: "Feature Used",
    props: { feature },
  }),
  settingChanged: (setting: string, value: string | number | boolean) => ({
    name: "Setting Changed",
    props: { setting, value: String(value) },
  }),

  // Auth events
  loginStarted: (method: string) => ({
    name: "Login Started",
    props: { method },
  }),
  loginCompleted: (method: string) => ({
    name: "Login Completed",
    props: { method },
  }),
  loginFailed: (method: string, error: string) => ({
    name: "Login Failed",
    props: { method, error },
  }),
  logout: () => ({ name: "Logout" }),
};

export default AnalyticsProvider;
