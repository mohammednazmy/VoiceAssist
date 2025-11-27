/**
 * Performance Metrics Hook
 * Tracks and reports performance metrics for monitoring and optimization.
 *
 * Phase 10: Performance & Scalability
 */

import { useEffect, useRef, useCallback, useState } from "react";

export interface PerformanceMetrics {
  /** Time to first render (ms) */
  timeToFirstRender: number | null;
  /** Time from start to interactive (ms) */
  timeToInteractive: number | null;
  /** Total render count */
  renderCount: number;
  /** Average render time (ms) */
  averageRenderTime: number | null;
  /** Last render time (ms) */
  lastRenderTime: number | null;
  /** Memory usage (bytes) if available */
  memoryUsage: number | null;
}

/**
 * Hook to track render performance of a component
 */
export function useRenderMetrics(componentName: string): {
  metrics: PerformanceMetrics;
  markInteractive: () => void;
} {
  const startTimeRef = useRef<number>(performance.now());
  const renderTimesRef = useRef<number[]>([]);
  const lastRenderStartRef = useRef<number>(performance.now());
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    timeToFirstRender: null,
    timeToInteractive: null,
    renderCount: 0,
    averageRenderTime: null,
    lastRenderTime: null,
    memoryUsage: null,
  });

  // Track each render
  useEffect(() => {
    const renderTime = performance.now() - lastRenderStartRef.current;
    renderTimesRef.current.push(renderTime);

    const totalRenders = renderTimesRef.current.length;
    const averageTime =
      renderTimesRef.current.reduce((a, b) => a + b, 0) / totalRenders;

    // Get memory usage if available
    let memoryUsage: number | null = null;
    if ("memory" in performance) {
      const memory = (
        performance as unknown as { memory: { usedJSHeapSize: number } }
      ).memory;
      memoryUsage = memory.usedJSHeapSize;
    }

    setMetrics((prev) => ({
      ...prev,
      timeToFirstRender:
        prev.timeToFirstRender ?? performance.now() - startTimeRef.current,
      renderCount: totalRenders,
      averageRenderTime: averageTime,
      lastRenderTime: renderTime,
      memoryUsage,
    }));

    // Reset for next render
    lastRenderStartRef.current = performance.now();

    // Log metrics in development
    if (process.env.NODE_ENV === "development" && totalRenders === 1) {
      console.debug(
        `[Performance] ${componentName} first render: ${renderTime.toFixed(2)}ms`,
      );
    }
  });

  const markInteractive = useCallback(() => {
    setMetrics((prev) => ({
      ...prev,
      timeToInteractive: performance.now() - startTimeRef.current,
    }));
  }, []);

  return { metrics, markInteractive };
}

/**
 * Hook to measure function execution time
 */
export function useMeasure(): {
  measure: <T>(name: string, fn: () => T) => T;
  measureAsync: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
  getMeasurements: () => Record<string, number[]>;
} {
  const measurementsRef = useRef<Record<string, number[]>>({});

  const measure = useCallback(<T>(name: string, fn: () => T): T => {
    const start = performance.now();
    try {
      return fn();
    } finally {
      const duration = performance.now() - start;
      if (!measurementsRef.current[name]) {
        measurementsRef.current[name] = [];
      }
      measurementsRef.current[name].push(duration);

      if (process.env.NODE_ENV === "development") {
        console.debug(`[Measure] ${name}: ${duration.toFixed(2)}ms`);
      }
    }
  }, []);

  const measureAsync = useCallback(
    async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
      const start = performance.now();
      try {
        return await fn();
      } finally {
        const duration = performance.now() - start;
        if (!measurementsRef.current[name]) {
          measurementsRef.current[name] = [];
        }
        measurementsRef.current[name].push(duration);

        if (process.env.NODE_ENV === "development") {
          console.debug(`[Measure] ${name}: ${duration.toFixed(2)}ms`);
        }
      }
    },
    [],
  );

  const getMeasurements = useCallback(() => {
    return { ...measurementsRef.current };
  }, []);

  return { measure, measureAsync, getMeasurements };
}

/**
 * Hook to track Web Vitals metrics
 */
export function useWebVitals(
  onReport?: (metrics: Record<string, number>) => void,
) {
  useEffect(() => {
    const metrics: Record<string, number> = {};

    // Largest Contentful Paint (LCP)
    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        metrics.lcp = lastEntry.startTime;
        if (process.env.NODE_ENV === "development") {
          console.debug(`[WebVitals] LCP: ${lastEntry.startTime.toFixed(2)}ms`);
        }
      }
    });

    // First Input Delay (FID)
    const fidObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const firstEntry = entries[0] as PerformanceEventTiming;
      if (firstEntry) {
        metrics.fid = firstEntry.processingStart - firstEntry.startTime;
        if (process.env.NODE_ENV === "development") {
          console.debug(`[WebVitals] FID: ${metrics.fid.toFixed(2)}ms`);
        }
      }
    });

    // Cumulative Layout Shift (CLS)
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (
          !(entry as PerformanceEntry & { hadRecentInput?: boolean })
            .hadRecentInput
        ) {
          clsValue +=
            (entry as PerformanceEntry & { value?: number }).value || 0;
          metrics.cls = clsValue;
        }
      }
      if (process.env.NODE_ENV === "development") {
        console.debug(`[WebVitals] CLS: ${clsValue.toFixed(4)}`);
      }
    });

    try {
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
      fidObserver.observe({ type: "first-input", buffered: true });
      clsObserver.observe({ type: "layout-shift", buffered: true });
    } catch {
      // Some browsers don't support these observers
    }

    // Report metrics on page unload
    const handleUnload = () => {
      onReport?.(metrics);
    };

    window.addEventListener("beforeunload", handleUnload);

    return () => {
      lcpObserver.disconnect();
      fidObserver.disconnect();
      clsObserver.disconnect();
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [onReport]);
}
