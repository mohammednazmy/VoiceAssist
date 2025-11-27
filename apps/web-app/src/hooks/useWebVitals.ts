/**
 * Web Vitals Hook - Phase 11: Analytics & Observability
 *
 * Monitors Core Web Vitals (LCP, FID, CLS) and custom performance metrics.
 * Reports to analytics and provides real-time monitoring.
 */

import { useEffect, useCallback, useState, useRef } from "react";
import { useAnalytics } from "../lib/analytics/AnalyticsProvider";

// Core Web Vitals metrics
export interface WebVitalsMetrics {
  // Core Web Vitals
  lcp?: number; // Largest Contentful Paint (ms)
  fid?: number; // First Input Delay (ms)
  cls?: number; // Cumulative Layout Shift (score)
  fcp?: number; // First Contentful Paint (ms)
  ttfb?: number; // Time to First Byte (ms)
  inp?: number; // Interaction to Next Paint (ms)

  // Custom metrics
  navigationStart?: number;
  domContentLoaded?: number;
  loadComplete?: number;
  firstPaint?: number;
}

// Web Vitals thresholds (from Google's guidelines)
const THRESHOLDS = {
  lcp: { good: 2500, needsImprovement: 4000 },
  fid: { good: 100, needsImprovement: 300 },
  cls: { good: 0.1, needsImprovement: 0.25 },
  fcp: { good: 1800, needsImprovement: 3000 },
  ttfb: { good: 800, needsImprovement: 1800 },
  inp: { good: 200, needsImprovement: 500 },
};

// Get rating for a metric
function getRating(
  name: keyof typeof THRESHOLDS,
  value: number,
): "good" | "needs-improvement" | "poor" {
  const threshold = THRESHOLDS[name];
  if (value <= threshold.good) return "good";
  if (value <= threshold.needsImprovement) return "needs-improvement";
  return "poor";
}

export interface UseWebVitalsOptions {
  onReport?: (metric: { name: string; value: number; rating: string }) => void;
  reportToAnalytics?: boolean;
}

export interface UseWebVitalsReturn {
  metrics: WebVitalsMetrics;
  isSupported: boolean;
  refresh: () => void;
  getRating: (name: keyof typeof THRESHOLDS, value: number) => string;
}

export function useWebVitals(
  options: UseWebVitalsOptions = {},
): UseWebVitalsReturn {
  const { onReport, reportToAnalytics = true } = options;
  const { trackTiming, trackEvent } = useAnalytics();

  const [metrics, setMetrics] = useState<WebVitalsMetrics>({});
  const observersRef = useRef<PerformanceObserver[]>([]);
  const [isSupported, setIsSupported] = useState(false);

  // Report metric to analytics and callback
  const reportMetric = useCallback(
    (
      name: string,
      value: number,
      rating: "good" | "needs-improvement" | "poor",
    ) => {
      if (reportToAnalytics) {
        trackTiming("web-vitals", name, value);
        trackEvent({
          name: "Web Vital",
          props: { metric: name, value: Math.round(value), rating },
        });
      }

      onReport?.({ name, value, rating });
    },
    [trackTiming, trackEvent, onReport, reportToAnalytics],
  );

  // Initialize observers
  const initObservers = useCallback(() => {
    if (typeof window === "undefined" || !("PerformanceObserver" in window)) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);

    // Clean up existing observers
    observersRef.current.forEach((obs) => obs.disconnect());
    observersRef.current = [];

    try {
      // LCP Observer
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        const value = lastEntry.startTime;

        setMetrics((prev) => ({ ...prev, lcp: value }));
        reportMetric("LCP", value, getRating("lcp", value));
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
      observersRef.current.push(lcpObserver);

      // FID Observer
      const fidObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const firstEntry = entries[0] as PerformanceEventTiming;
        const value = firstEntry.processingStart - firstEntry.startTime;

        setMetrics((prev) => ({ ...prev, fid: value }));
        reportMetric("FID", value, getRating("fid", value));
      });
      fidObserver.observe({ type: "first-input", buffered: true });
      observersRef.current.push(fidObserver);

      // CLS Observer
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        })[];
        entries.forEach((entry) => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        });

        setMetrics((prev) => ({ ...prev, cls: clsValue }));
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
      observersRef.current.push(clsObserver);

      // FCP Observer
      const fcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const fcpEntry = entries.find(
          (e) => e.name === "first-contentful-paint",
        );
        if (fcpEntry) {
          const value = fcpEntry.startTime;
          setMetrics((prev) => ({ ...prev, fcp: value }));
          reportMetric("FCP", value, getRating("fcp", value));
        }
      });
      fcpObserver.observe({ type: "paint", buffered: true });
      observersRef.current.push(fcpObserver);

      // INP Observer (Interaction to Next Paint)
      const inpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries() as PerformanceEventTiming[];
        let maxDuration = 0;

        entries.forEach((entry) => {
          const duration = entry.processingEnd - entry.startTime;
          if (duration > maxDuration) {
            maxDuration = duration;
          }
        });

        if (maxDuration > 0) {
          setMetrics((prev) => ({
            ...prev,
            inp: Math.max(prev.inp || 0, maxDuration),
          }));
        }
      });
      inpObserver.observe({ type: "event", buffered: true });
      observersRef.current.push(inpObserver);

      // Navigation timing
      if (performance.timing) {
        const timing = performance.timing;
        const ttfb = timing.responseStart - timing.requestStart;

        setMetrics((prev) => ({
          ...prev,
          ttfb,
          navigationStart: timing.navigationStart,
          domContentLoaded:
            timing.domContentLoadedEventEnd - timing.navigationStart,
          loadComplete: timing.loadEventEnd - timing.navigationStart,
        }));

        if (ttfb > 0) {
          reportMetric("TTFB", ttfb, getRating("ttfb", ttfb));
        }
      }

      // Report CLS on page hide
      const reportCLS = () => {
        if (clsValue > 0) {
          reportMetric("CLS", clsValue, getRating("cls", clsValue));
        }
      };

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          reportCLS();
        }
      });
    } catch (error) {
      console.warn("Failed to initialize Web Vitals observers:", error);
    }
  }, [reportMetric]);

  // Initialize on mount
  useEffect(() => {
    initObservers();

    return () => {
      observersRef.current.forEach((obs) => obs.disconnect());
      observersRef.current = [];
    };
  }, [initObservers]);

  // Refresh metrics
  const refresh = useCallback(() => {
    setMetrics({});
    initObservers();
  }, [initObservers]);

  return {
    metrics,
    isSupported,
    refresh,
    getRating: (name, value) => getRating(name, value),
  };
}

// Performance timing hook for custom measurements
export function usePerformanceTiming() {
  const { trackTiming } = useAnalytics();
  const marksRef = useRef<Map<string, number>>(new Map());

  const mark = useCallback((name: string) => {
    marksRef.current.set(name, performance.now());
    if (performance.mark) {
      performance.mark(name);
    }
  }, []);

  const measure = useCallback(
    (name: string, startMark?: string): number | null => {
      const startTime = startMark
        ? marksRef.current.get(startMark)
        : marksRef.current.get(`${name}_start`);

      if (startTime === undefined) {
        console.warn(
          `Performance mark '${startMark || `${name}_start`}' not found`,
        );
        return null;
      }

      const duration = performance.now() - startTime;

      trackTiming("custom", name, duration);

      if (performance.measure) {
        try {
          performance.measure(name, startMark || `${name}_start`);
        } catch {
          // Ignore if marks don't exist
        }
      }

      return duration;
    },
    [trackTiming],
  );

  const clearMarks = useCallback(() => {
    marksRef.current.clear();
    if (performance.clearMarks) {
      performance.clearMarks();
    }
  }, []);

  return { mark, measure, clearMarks };
}

export default useWebVitals;
