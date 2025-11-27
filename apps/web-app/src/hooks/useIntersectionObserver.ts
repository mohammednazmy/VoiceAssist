/**
 * Intersection Observer Hook
 * Observes when elements enter or exit the viewport for lazy loading
 * and infinite scroll implementations.
 *
 * Phase 10: Performance & Scalability
 */

import { useState, useEffect, useRef, useCallback } from "react";

export interface UseIntersectionObserverOptions {
  /** Root element for intersection (default: viewport) */
  root?: Element | null;
  /** Margin around root element */
  rootMargin?: string;
  /** Threshold(s) at which to trigger callback (0-1) */
  threshold?: number | number[];
  /** Whether to stop observing after first intersection */
  triggerOnce?: boolean;
  /** Whether to enable the observer */
  enabled?: boolean;
}

export interface UseIntersectionObserverReturn {
  /** Ref to attach to the observed element */
  ref: React.RefObject<HTMLDivElement>;
  /** Whether the element is currently in view */
  isInView: boolean;
  /** The current intersection entry */
  entry: IntersectionObserverEntry | null;
}

const DEFAULT_OPTIONS: UseIntersectionObserverOptions = {
  root: null,
  rootMargin: "0px",
  threshold: 0,
  triggerOnce: false,
  enabled: true,
};

/**
 * Hook to observe when an element enters or exits the viewport
 */
export function useIntersectionObserver(
  options: UseIntersectionObserverOptions = {},
): UseIntersectionObserverReturn {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const { root, rootMargin, threshold, triggerOnce, enabled } = mergedOptions;

  const ref = useRef<HTMLDivElement>(null);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const [isInView, setIsInView] = useState(false);
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (!enabled || !ref.current) return;
    if (triggerOnce && hasTriggeredRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setEntry(entry);
        setIsInView(entry.isIntersecting);

        if (entry.isIntersecting && triggerOnce) {
          hasTriggeredRef.current = true;
          observer.disconnect();
        }
      },
      { root, rootMargin, threshold },
    );

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, [root, rootMargin, threshold, triggerOnce, enabled]);

  return { ref, isInView, entry };
}

/**
 * Hook for lazy loading components when they enter viewport
 */
export function useLazyLoad(
  options: Omit<UseIntersectionObserverOptions, "triggerOnce"> = {},
): UseIntersectionObserverReturn {
  return useIntersectionObserver({
    ...options,
    triggerOnce: true,
    rootMargin: options.rootMargin || "100px", // Pre-load slightly before in view
  });
}

/**
 * Hook for infinite scroll pagination
 */
export function useInfiniteScroll(
  onLoadMore: () => void,
  options: UseIntersectionObserverOptions = {},
): {
  ref: React.RefObject<HTMLDivElement>;
  isLoading: boolean;
} {
  const { ref, isInView } = useIntersectionObserver({
    ...options,
    rootMargin: options.rootMargin || "200px",
  });
  const [isLoading, setIsLoading] = useState(false);
  const loadingRef = useRef(false);

  const handleLoadMore = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsLoading(true);

    try {
      await onLoadMore();
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [onLoadMore]);

  useEffect(() => {
    if (isInView && !loadingRef.current) {
      handleLoadMore();
    }
  }, [isInView, handleLoadMore]);

  return { ref, isLoading };
}
