/**
 * Analytics Hooks
 *
 * React hooks for analytics and telemetry tracking.
 *
 * @example
 * ```typescript
 * // Track page views automatically
 * usePageView();
 *
 * // Track events
 * const { trackEvent } = useAnalytics();
 * trackEvent('button_click', 'send_message', { category: 'chat' });
 *
 * // Track Web Vitals
 * useWebVitals();
 *
 * // Get analytics summary
 * const { summary, isLoading } = useAnalyticsSummary();
 * ```
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  analyticsService,
  type AnalyticsEventType,
  type WebVitalName,
  type AnalyticsSummary,
} from "../services/analytics";

/**
 * Options for analytics hooks
 */
export interface UseAnalyticsOptions {
  /** User ID for attribution */
  userId?: string;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Return type for useAnalytics
 */
export interface UseAnalyticsReturn {
  /** Track a custom event */
  trackEvent: (
    type: AnalyticsEventType,
    name: string,
    options?: {
      category?: string;
      label?: string;
      value?: number;
      properties?: Record<string, unknown>;
    },
  ) => void;
  /** Track an error */
  trackError: (
    error: Error | string,
    options?: {
      component?: string;
      severity?: "low" | "medium" | "high" | "critical";
      handled?: boolean;
    },
  ) => void;
  /** Track a timing measurement */
  trackTiming: (
    name: string,
    duration: number,
    details?: Record<string, unknown>,
  ) => void;
  /** Start a user flow */
  startFlow: (flowName: string) => void;
  /** Record a flow step */
  recordFlowStep: (
    flowName: string,
    stepName: string,
    location: string,
    completed?: boolean,
  ) => void;
  /** Complete a user flow */
  completeFlow: (flowName: string, completed?: boolean) => void;
  /** Get session ID */
  sessionId: string;
}

/**
 * Main analytics hook
 */
export function useAnalytics(
  options: UseAnalyticsOptions = {},
): UseAnalyticsReturn {
  const { userId } = options;

  // Set user ID when it changes
  useEffect(() => {
    if (userId) {
      analyticsService.setUserId(userId);
    }
  }, [userId]);

  const trackEvent = useCallback(
    (
      type: AnalyticsEventType,
      name: string,
      eventOptions?: {
        category?: string;
        label?: string;
        value?: number;
        properties?: Record<string, unknown>;
      },
    ) => {
      analyticsService.trackEvent(type, name, eventOptions);
    },
    [],
  );

  const trackError = useCallback(
    (
      error: Error | string,
      errorOptions?: {
        component?: string;
        severity?: "low" | "medium" | "high" | "critical";
        handled?: boolean;
      },
    ) => {
      analyticsService.trackError(error, errorOptions);
    },
    [],
  );

  const trackTiming = useCallback(
    (name: string, duration: number, details?: Record<string, unknown>) => {
      analyticsService.trackTiming(name, duration, details);
    },
    [],
  );

  const startFlow = useCallback((flowName: string) => {
    analyticsService.startFlow(flowName);
  }, []);

  const recordFlowStep = useCallback(
    (
      flowName: string,
      stepName: string,
      location: string,
      completed?: boolean,
    ) => {
      analyticsService.recordFlowStep(flowName, stepName, location, completed);
    },
    [],
  );

  const completeFlow = useCallback((flowName: string, completed?: boolean) => {
    analyticsService.completeFlow(flowName, completed);
  }, []);

  return {
    trackEvent,
    trackError,
    trackTiming,
    startFlow,
    recordFlowStep,
    completeFlow,
    sessionId: analyticsService.getSessionId(),
  };
}

/**
 * Hook for automatic page view tracking
 * Can optionally accept a path override for use without react-router
 */
export function usePageView(
  options: { title?: string; path?: string } = {},
): void {
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    const pathname =
      options.path ||
      (typeof window !== "undefined" ? window.location.pathname : "/");

    // Only track if path has changed
    if (prevPathRef.current !== pathname) {
      const title =
        options.title ||
        (typeof document !== "undefined" ? document.title : pathname);

      analyticsService.trackPageView(
        pathname,
        title,
        prevPathRef.current ?? undefined,
      );

      prevPathRef.current = pathname;
    }
  }, [options.path, options.title]);
}

/**
 * Hook for Core Web Vitals tracking
 */
export function useWebVitals(): void {
  useEffect(() => {
    // Dynamically import web-vitals for code splitting
    const trackVitals = async () => {
      try {
        const webVitals = await import("web-vitals");

        const handleVital = (metric: {
          name: WebVitalName;
          value: number;
          delta: number;
        }) => {
          analyticsService.trackWebVital(
            metric.name,
            metric.value,
            metric.delta,
          );
        };

        // Track all Core Web Vitals
        if (webVitals.onLCP) webVitals.onLCP(handleVital);
        if (webVitals.onFID) webVitals.onFID(handleVital);
        if (webVitals.onCLS) webVitals.onCLS(handleVital);
        if (webVitals.onTTFB) webVitals.onTTFB(handleVital);
        if (webVitals.onFCP) webVitals.onFCP(handleVital);
        if (webVitals.onINP) webVitals.onINP(handleVital);
      } catch {
        // web-vitals not available, skip
        console.debug("[useWebVitals] web-vitals package not available");
      }
    };

    trackVitals();
  }, []);
}

/**
 * Hook for tracking component render performance
 */
export function useRenderTracking(componentName: string): void {
  const renderStartRef = useRef(Date.now());
  const renderCountRef = useRef(0);

  useEffect(() => {
    const renderDuration = Date.now() - renderStartRef.current;
    renderCountRef.current++;

    if (renderCountRef.current === 1) {
      analyticsService.trackTiming(
        `${componentName}_first_render`,
        renderDuration,
        {
          component: componentName,
          renderCount: renderCountRef.current,
        },
      );
    } else if (renderDuration > 100) {
      // Only track slow re-renders
      analyticsService.trackTiming(
        `${componentName}_slow_render`,
        renderDuration,
        {
          component: componentName,
          renderCount: renderCountRef.current,
        },
      );
    }

    renderStartRef.current = Date.now();
  });
}

/**
 * Hook for tracking API call performance
 */
export function useApiTracking() {
  const trackApiCall = useCallback(
    (endpoint: string, method: string, duration: number, status?: number) => {
      analyticsService.trackTiming("api_call", duration, {
        endpoint,
        method,
        status,
        success: status ? status >= 200 && status < 400 : undefined,
      });
    },
    [],
  );

  const trackApiError = useCallback(
    (endpoint: string, method: string, error: Error | string) => {
      analyticsService.trackError(error, {
        component: `api:${endpoint}`,
        severity: "medium",
        handled: true,
      });
    },
    [],
  );

  return {
    trackApiCall,
    trackApiError,
  };
}

/**
 * Return type for useAnalyticsSummary
 */
export interface UseAnalyticsSummaryReturn {
  /** Analytics summary data */
  summary: AnalyticsSummary | null;
  /** Whether data is loading */
  isLoading: boolean;
  /** Error if any */
  error: Error | null;
  /** Refresh the data */
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching analytics summary
 */
export function useAnalyticsSummary(
  period?: { start: number; end: number },
  refreshInterval?: number,
): UseAnalyticsSummaryReturn {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSummary = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await analyticsService.getSummary(period);
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [period?.start, period?.end]);

  useEffect(() => {
    fetchSummary();

    if (refreshInterval) {
      const intervalId = setInterval(fetchSummary, refreshInterval);
      return () => clearInterval(intervalId);
    }
  }, [fetchSummary, refreshInterval]);

  return {
    summary,
    isLoading,
    error,
    refresh: fetchSummary,
  };
}

/**
 * Hook for tracking user flows
 */
export function useUserFlow(flowName: string) {
  const flowRef = useRef<string | null>(null);

  useEffect(() => {
    // Start flow on mount
    analyticsService.startFlow(flowName);
    flowRef.current = flowName;

    // Complete flow on unmount (as abandoned if not explicitly completed)
    return () => {
      if (flowRef.current) {
        analyticsService.completeFlow(flowRef.current, false);
      }
    };
  }, [flowName]);

  const recordStep = useCallback(
    (stepName: string, location: string, completed: boolean = true) => {
      if (flowRef.current) {
        analyticsService.recordFlowStep(
          flowRef.current,
          stepName,
          location,
          completed,
        );
      }
    },
    [],
  );

  const complete = useCallback((success: boolean = true) => {
    if (flowRef.current) {
      analyticsService.completeFlow(flowRef.current, success);
      flowRef.current = null; // Prevent double completion on unmount
    }
  }, []);

  return {
    recordStep,
    complete,
    flowName,
  };
}
