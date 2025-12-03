/**
 * Spinner Component
 * Loading indicator with multiple sizes
 *
 * Features:
 * - Three sizes: sm, md, lg
 * - Color variants
 * - Accessible with aria-label
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const spinnerVariants = cva("animate-spin", {
  variants: {
    size: {
      sm: "h-4 w-4",
      md: "h-6 w-6",
      lg: "h-8 w-8",
    },
    color: {
      primary: "text-primary-600",
      secondary: "text-secondary-600",
      neutral: "text-neutral-600",
      white: "text-white",
      current: "text-current",
    },
  },
  defaultVariants: {
    size: "md",
    color: "primary",
  },
});

export interface SpinnerProps
  extends
    Omit<React.SVGAttributes<SVGSVGElement>, "color">,
    VariantProps<typeof spinnerVariants> {
  /**
   * Accessible label for screen readers
   */
  label?: string;
}

function Spinner({
  className,
  size,
  color,
  label = "Loading",
  ...props
}: SpinnerProps) {
  return (
    <svg
      className={cn(spinnerVariants({ size, color, className }))}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      role="status"
      aria-label={label}
      {...props}
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
}

/**
 * Spinner with overlay
 * Useful for loading states that cover content
 */
export interface SpinnerOverlayProps extends SpinnerProps {
  /**
   * Show overlay background
   */
  show?: boolean;

  /**
   * Text to display below spinner
   */
  text?: string;
}

function SpinnerOverlay({
  show = true,
  text,
  size = "lg",
  ...props
}: SpinnerOverlayProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background-overlay">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={size} color="white" {...props} />
        {text && <p className="text-sm text-white">{text}</p>}
      </div>
    </div>
  );
}

export { Spinner, SpinnerOverlay, spinnerVariants };
