/**
 * Lazy Component Wrapper
 * Defers rendering of components until they enter the viewport
 *
 * Phase 10: Performance & Scalability
 */

import {
  Suspense,
  lazy,
  ComponentType,
  ReactNode,
  useState,
  useEffect,
} from "react";
import { useLazyLoad } from "../../hooks/useIntersectionObserver";

interface LazyComponentProps {
  /** Fallback to show while loading */
  fallback?: ReactNode;
  /** Custom placeholder while not in view */
  placeholder?: ReactNode;
  /** Height of placeholder (for layout stability) */
  placeholderHeight?: string | number;
  /** Additional className for wrapper */
  className?: string;
  /** Children to render when in view */
  children: ReactNode;
}

/**
 * Wrapper that only renders children when they enter the viewport
 */
export function LazyComponent({
  fallback: _fallback = null,
  placeholder,
  placeholderHeight = "auto",
  className = "",
  children,
}: LazyComponentProps) {
  const { ref, isInView } = useLazyLoad();

  return (
    <div
      ref={ref}
      className={className}
      style={{
        minHeight:
          !isInView && placeholderHeight ? placeholderHeight : undefined,
      }}
    >
      {isInView
        ? children
        : placeholder || (
            <div
              style={{ height: placeholderHeight }}
              className="bg-neutral-100 animate-pulse rounded"
            />
          )}
    </div>
  );
}

/**
 * Create a lazy-loaded component that loads when in viewport
 */
export function createLazyComponent<P extends object>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  options: {
    fallback?: ReactNode;
    preloadDelay?: number;
  } = {},
): ComponentType<P> {
  const LazyComp = lazy(importFn);
  const { fallback = <LoadingSpinner />, preloadDelay } = options;

  // Preload after delay if specified
  if (preloadDelay !== undefined) {
    setTimeout(() => {
      importFn();
    }, preloadDelay);
  }

  return function LazyWrapper(props: P) {
    const { ref, isInView } = useLazyLoad();
    const [hasBeenVisible, setHasBeenVisible] = useState(false);

    useEffect(() => {
      if (isInView && !hasBeenVisible) {
        setHasBeenVisible(true);
      }
    }, [isInView, hasBeenVisible]);

    return (
      <div ref={ref}>
        {hasBeenVisible ? (
          <Suspense fallback={fallback}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <LazyComp {...(props as any)} />
          </Suspense>
        ) : (
          fallback
        )}
      </div>
    );
  };
}

/**
 * Simple loading spinner component
 */
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-4">
      <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/**
 * Skeleton placeholder for lazy components
 */
export function LazyPlaceholder({
  height = 100,
  className = "",
}: {
  height?: number | string;
  className?: string;
}) {
  return (
    <div
      className={`bg-neutral-100 animate-pulse rounded ${className}`}
      style={{ height }}
      role="presentation"
      aria-hidden="true"
    />
  );
}
