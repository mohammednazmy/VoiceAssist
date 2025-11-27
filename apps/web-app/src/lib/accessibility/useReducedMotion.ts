/**
 * Reduced Motion Hook - Phase 12: Accessibility & Compliance
 *
 * Detects user's motion preferences and provides utilities
 * for respecting prefers-reduced-motion settings.
 */

import { useState, useEffect, useCallback } from "react";

/**
 * Hook to detect if user prefers reduced motion
 *
 * @returns Whether the user prefers reduced motion
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    return query.matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    // Modern browsers
    if (query.addEventListener) {
      query.addEventListener("change", handleChange);
      return () => query.removeEventListener("change", handleChange);
    }
    // Legacy browsers
    query.addListener(handleChange);
    return () => query.removeListener(handleChange);
  }, []);

  return prefersReducedMotion;
}

/**
 * Hook to get animation duration based on motion preference
 *
 * @param normalDuration - Duration in ms for normal motion
 * @param reducedDuration - Duration in ms for reduced motion (default: 0)
 * @returns The appropriate duration based on user preference
 */
export function useAnimationDuration(
  normalDuration: number,
  reducedDuration: number = 0,
): number {
  const prefersReducedMotion = useReducedMotion();
  return prefersReducedMotion ? reducedDuration : normalDuration;
}

/**
 * Hook to get animation style based on motion preference
 *
 * @param normalStyle - CSS style object for normal motion
 * @param reducedStyle - CSS style object for reduced motion
 * @returns The appropriate style based on user preference
 */
export function useMotionStyle<T extends Record<string, unknown>>(
  normalStyle: T,
  reducedStyle: Partial<T> = {},
): T {
  const prefersReducedMotion = useReducedMotion();
  return prefersReducedMotion
    ? { ...normalStyle, ...reducedStyle }
    : normalStyle;
}

/**
 * Returns a function to conditionally apply animations
 */
export function useConditionalAnimation() {
  const prefersReducedMotion = useReducedMotion();

  const animate = useCallback(
    <T>(normalValue: T, reducedValue: T): T => {
      return prefersReducedMotion ? reducedValue : normalValue;
    },
    [prefersReducedMotion],
  );

  return { prefersReducedMotion, animate };
}

export default useReducedMotion;
