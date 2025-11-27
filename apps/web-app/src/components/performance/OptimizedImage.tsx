/**
 * Optimized Image Component
 * Provides lazy loading, placeholder, and error handling for images
 *
 * Phase 10: Performance & Scalability
 */

import { useState, useEffect } from "react";
import { useLazyLoad } from "../../hooks/useIntersectionObserver";

export interface OptimizedImageProps {
  /** Image source URL */
  src: string;
  /** Alt text for accessibility */
  alt: string;
  /** Width of the image */
  width?: number | string;
  /** Height of the image */
  height?: number | string;
  /** Low-quality placeholder image URL */
  placeholder?: string;
  /** Use blur-up effect with placeholder */
  blurPlaceholder?: boolean;
  /** Fallback image on error */
  fallbackSrc?: string;
  /** Loading strategy */
  loading?: "lazy" | "eager";
  /** Object fit style */
  objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  /** Additional class names */
  className?: string;
  /** Callback when image loads */
  onLoad?: () => void;
  /** Callback when image fails to load */
  onError?: () => void;
}

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  placeholder,
  blurPlaceholder = false,
  fallbackSrc,
  loading = "lazy",
  objectFit = "cover",
  className = "",
  onLoad,
  onError,
}: OptimizedImageProps) {
  const { ref, isInView } = useLazyLoad();
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);

  // Determine which source to use
  useEffect(() => {
    if (!isInView && loading === "lazy") {
      setCurrentSrc(null);
      return;
    }

    if (hasError && fallbackSrc) {
      setCurrentSrc(fallbackSrc);
    } else {
      setCurrentSrc(src);
    }
  }, [isInView, loading, src, hasError, fallbackSrc]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();

    if (fallbackSrc && currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
    }
  };

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden ${className}`}
      style={{ width, height }}
    >
      {/* Placeholder */}
      {!isLoaded && (
        <div className="absolute inset-0">
          {placeholder ? (
            <img
              src={placeholder}
              alt=""
              className={`w-full h-full ${blurPlaceholder ? "blur-sm scale-105" : ""}`}
              style={{ objectFit }}
              aria-hidden="true"
            />
          ) : (
            <div className="w-full h-full bg-neutral-200 animate-pulse" />
          )}
        </div>
      )}

      {/* Main image */}
      {currentSrc && (
        <img
          src={currentSrc}
          alt={alt}
          width={width}
          height={height}
          loading={loading}
          onLoad={handleLoad}
          onError={handleError}
          className={`w-full h-full transition-opacity duration-300 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
          style={{ objectFit }}
        />
      )}

      {/* Error state */}
      {hasError && !fallbackSrc && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-100">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-8 h-8 text-neutral-400"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

/**
 * Avatar-specific optimized image with circular crop
 */
export function OptimizedAvatar({
  src,
  alt,
  size = 40,
  fallback,
  className = "",
}: {
  src?: string | null;
  alt: string;
  size?: number;
  fallback?: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);

  const showFallback = !src || hasError;
  const initials =
    fallback ||
    alt
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  return (
    <div
      className={`relative rounded-full overflow-hidden bg-primary-100 ${className}`}
      style={{ width: size, height: size }}
    >
      {showFallback ? (
        <div className="w-full h-full flex items-center justify-center bg-primary-500 text-white font-medium text-sm">
          {initials}
        </div>
      ) : (
        <img
          src={src!}
          alt={alt}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          onError={() => setHasError(true)}
        />
      )}
    </div>
  );
}
