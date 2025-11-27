/**
 * Throttle Hook
 * Limits the rate at which a value can be updated or a callback can be invoked.
 *
 * Phase 10: Performance & Scalability
 */

import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Returns a throttled version of the provided value
 * @param value - The value to throttle
 * @param interval - The minimum interval between updates in milliseconds (default: 300)
 * @returns The throttled value
 */
export function useThrottle<T>(value: T, interval: number = 300): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastUpdatedRef = useRef<number>(Date.now());

  useEffect(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdatedRef.current;

    if (timeSinceLastUpdate >= interval) {
      lastUpdatedRef.current = now;
      setThrottledValue(value);
    } else {
      const timeoutId = setTimeout(() => {
        lastUpdatedRef.current = Date.now();
        setThrottledValue(value);
      }, interval - timeSinceLastUpdate);

      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [value, interval]);

  return throttledValue;
}

/**
 * Returns a throttled callback function
 * @param callback - The callback to throttle
 * @param interval - The minimum interval between invocations in milliseconds (default: 300)
 * @returns The throttled callback
 */
export function useThrottledCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  interval: number = 300,
): T {
  const lastCalledRef = useRef<number>(0);
  const lastArgsRef = useRef<Parameters<T> | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const throttledCallback = useCallback(
    ((...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCalledRef.current;

      lastArgsRef.current = args;

      if (timeSinceLastCall >= interval) {
        lastCalledRef.current = now;
        callback(...args);
      } else {
        // Schedule a trailing call
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          lastCalledRef.current = Date.now();
          if (lastArgsRef.current) {
            callback(...lastArgsRef.current);
          }
        }, interval - timeSinceLastCall);
      }
    }) as T,
    [callback, interval],
  );

  return throttledCallback;
}
