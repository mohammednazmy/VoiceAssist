/**
 * IconButton Component
 * A button component specifically for icons
 *
 * Features:
 * - All button variants from Button component
 * - Multiple sizes optimized for icons
 * - Circular and square shapes
 * - Loading state
 * - Accessible with aria-label
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const iconButtonVariants = cva(
  "inline-flex items-center justify-center font-medium transition-all duration-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 focus-visible:ring-primary-500 dark:bg-primary-600 dark:hover:bg-primary-500",
        secondary:
          "bg-secondary-600 text-white hover:bg-secondary-700 active:bg-secondary-800 focus-visible:ring-secondary-500 dark:bg-secondary-600 dark:hover:bg-secondary-500",
        outline:
          "border-2 border-neutral-300 bg-transparent hover:bg-neutral-50 active:bg-neutral-100 focus-visible:ring-neutral-500 dark:border-neutral-600 dark:hover:bg-neutral-800 dark:active:bg-neutral-700",
        ghost:
          "bg-transparent hover:bg-neutral-100 active:bg-neutral-200 focus-visible:ring-neutral-500 dark:hover:bg-neutral-800 dark:active:bg-neutral-700",
        danger:
          "bg-error-600 text-white hover:bg-error-700 active:bg-error-800 focus-visible:ring-error-500 dark:bg-error-600 dark:hover:bg-error-500",
        success:
          "bg-success-600 text-white hover:bg-success-700 active:bg-success-800 focus-visible:ring-success-500 dark:bg-success-600 dark:hover:bg-success-500",
      },
      size: {
        xs: "h-6 w-6 text-xs",
        sm: "h-8 w-8 text-sm",
        md: "h-10 w-10 text-base",
        lg: "h-12 w-12 text-lg",
        xl: "h-14 w-14 text-xl",
      },
      shape: {
        circle: "rounded-full",
        square: "rounded-md",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      shape: "circle",
    },
  },
);

/**
 * Spinner for loading state
 */
const Spinner = ({ className }: { className?: string }) => (
  <svg
    className={cn("animate-spin h-4 w-4", className)}
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

export interface IconButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  /**
   * Icon to display (React node)
   */
  icon?: React.ReactNode;

  /**
   * Accessible label (required for icon-only buttons)
   */
  "aria-label": string;

  /**
   * Show loading spinner
   */
  loading?: boolean;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      className,
      variant,
      size,
      shape,
      icon,
      loading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        className={cn(iconButtonVariants({ variant, size, shape, className }))}
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading}
        {...props}
      >
        {loading ? <Spinner /> : icon || children}
      </button>
    );
  },
);

IconButton.displayName = "IconButton";

export { IconButton, iconButtonVariants };
