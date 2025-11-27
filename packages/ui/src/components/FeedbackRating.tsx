/**
 * Feedback Rating Component
 *
 * A thumbs up/down component for quick feedback on AI responses.
 * Supports customizable icons, labels, and states.
 *
 * @example
 * ```tsx
 * <FeedbackRating
 *   value={rating}
 *   onChange={(newRating) => setRating(newRating)}
 * />
 * ```
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const ratingButtonVariants = cva(
  "inline-flex items-center justify-center rounded-md transition-all duration-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        ghost:
          "bg-transparent hover:bg-neutral-100 active:bg-neutral-200 dark:hover:bg-neutral-800 dark:active:bg-neutral-700",
        outline:
          "border border-neutral-300 bg-transparent hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-800",
      },
      size: {
        sm: "h-7 w-7 p-1",
        md: "h-9 w-9 p-2",
        lg: "h-11 w-11 p-2.5",
      },
      active: {
        positive:
          "bg-success-100 text-success-700 hover:bg-success-200 dark:bg-success-900/30 dark:text-success-400",
        negative:
          "bg-error-100 text-error-700 hover:bg-error-200 dark:bg-error-900/30 dark:text-error-400",
        neutral: "",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "md",
    },
  },
);

/**
 * Rating value type
 */
export type FeedbackRatingValue = "positive" | "negative" | "neutral" | null;

/**
 * Props for the FeedbackRating component
 */
export interface FeedbackRatingProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange">,
    VariantProps<typeof ratingButtonVariants> {
  /** Current rating value */
  value?: FeedbackRatingValue;
  /** Callback when rating changes */
  onChange?: (value: FeedbackRatingValue) => void;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Show labels next to icons */
  showLabels?: boolean;
  /** Custom positive label */
  positiveLabel?: string;
  /** Custom negative label */
  negativeLabel?: string;
  /** Whether to allow toggling off (clicking again to deselect) */
  allowToggle?: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** ARIA label */
  "aria-label"?: string;
}

/**
 * Thumbs Up Icon
 */
const ThumbsUpIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
  </svg>
);

/**
 * Thumbs Down Icon
 */
const ThumbsDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
  </svg>
);

/**
 * Spinner Icon
 */
const SpinnerIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={cn("animate-spin", className)}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

/**
 * FeedbackRating Component
 */
export const FeedbackRating = React.forwardRef<
  HTMLDivElement,
  FeedbackRatingProps
>(
  (
    {
      className,
      value,
      onChange,
      variant = "ghost",
      size = "md",
      disabled = false,
      showLabels = false,
      positiveLabel = "Helpful",
      negativeLabel = "Not helpful",
      allowToggle = true,
      isLoading = false,
      "aria-label": ariaLabel = "Rate this response",
      ...props
    },
    ref,
  ) => {
    const handlePositiveClick = () => {
      if (disabled || isLoading) return;
      if (allowToggle && value === "positive") {
        onChange?.(null);
      } else {
        onChange?.("positive");
      }
    };

    const handleNegativeClick = () => {
      if (disabled || isLoading) return;
      if (allowToggle && value === "negative") {
        onChange?.(null);
      } else {
        onChange?.("negative");
      }
    };

    const iconSize =
      size === "sm" ? "h-4 w-4" : size === "lg" ? "h-6 w-6" : "h-5 w-5";

    return (
      <div
        ref={ref}
        role="group"
        aria-label={ariaLabel}
        className={cn("inline-flex items-center gap-2", className)}
        {...props}
      >
        {/* Positive (Thumbs Up) Button */}
        <button
          type="button"
          onClick={handlePositiveClick}
          disabled={disabled || isLoading}
          aria-pressed={value === "positive"}
          aria-label={positiveLabel}
          className={cn(
            ratingButtonVariants({
              variant,
              size,
              active: value === "positive" ? "positive" : undefined,
            }),
          )}
        >
          {isLoading && value === "positive" ? (
            <SpinnerIcon className={iconSize} />
          ) : (
            <ThumbsUpIcon
              className={cn(iconSize, value === "positive" && "fill-current")}
            />
          )}
          {showLabels && <span className="ml-1 text-sm">{positiveLabel}</span>}
        </button>

        {/* Negative (Thumbs Down) Button */}
        <button
          type="button"
          onClick={handleNegativeClick}
          disabled={disabled || isLoading}
          aria-pressed={value === "negative"}
          aria-label={negativeLabel}
          className={cn(
            ratingButtonVariants({
              variant,
              size,
              active: value === "negative" ? "negative" : undefined,
            }),
          )}
        >
          {isLoading && value === "negative" ? (
            <SpinnerIcon className={iconSize} />
          ) : (
            <ThumbsDownIcon
              className={cn(iconSize, value === "negative" && "fill-current")}
            />
          )}
          {showLabels && <span className="ml-1 text-sm">{negativeLabel}</span>}
        </button>
      </div>
    );
  },
);

FeedbackRating.displayName = "FeedbackRating";

export { ratingButtonVariants };
