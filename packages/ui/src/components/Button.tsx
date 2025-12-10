/**
 * Button Component
 * A versatile button component with multiple variants, sizes, and states
 *
 * Features:
 * - Multiple variants: primary, secondary, outline, ghost, danger
 * - Three sizes: sm, md, lg
 * - Loading state with spinner
 * - Icon support (left/right)
 * - Full width option
 * - Disabled state
 * - ARIA attributes
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-border-focus focus-visible:ring-offset-background-primary disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-surface-button-primary text-text-inverse hover:bg-surface-button-primary-hover active:bg-primary-700 dark:active:bg-primary-600 shadow-sm",
        secondary:
          "bg-surface-button-secondary text-text-inverse hover:bg-surface-button-secondary-hover active:bg-secondary-700 shadow-sm",
        outline:
          "border-2 border-border-default bg-surface-button-outline text-text-primary hover:bg-surface-button-outline-hover hover:border-border-strong active:bg-surface-button-outline-hover",
        ghost:
          "bg-surface-button-ghost text-text-primary hover:bg-surface-button-ghost-hover active:bg-neutral-200 dark:active:bg-neutral-700",
        danger:
          "bg-surface-button-danger text-text-inverse hover:bg-surface-button-danger-hover active:bg-error-700 shadow-sm",
        success:
          "bg-success-600 text-text-inverse hover:bg-success-700 active:bg-success-800 shadow-sm",
        link: "text-text-link underline-offset-4 hover:text-text-link-hover focus-visible:ring-border-focus dark:text-primary-400",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 py-2 text-base",
        lg: "h-12 px-6 text-lg",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

/**
 * Spinner component for loading state
 */
const Spinner = ({ className }: { className?: string }) => (
  <svg
    className={cn("animate-spin h-4 w-4", className)}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    role="status"
    aria-label="Loading"
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

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * Render as a child component (e.g., Next.js Link)
   */
  asChild?: boolean;

  /**
   * Show loading spinner and disable button
   */
  loading?: boolean;

  /**
   * Icon to display before the button text
   */
  iconLeft?: React.ReactNode;

  /**
   * Icon to display after the button text
   */
  iconRight?: React.ReactNode;

  /**
   * Loading text to display when button is loading
   */
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      loading = false,
      disabled,
      iconLeft,
      iconRight,
      loadingText,
      type = "button",
      children,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading}
        aria-live={loading ? "polite" : undefined}
        {...props}
      >
        {loading ? (
          <>
            <Spinner />
            {loadingText || children}
          </>
        ) : (
          <>
            {iconLeft && <span className="inline-flex">{iconLeft}</span>}
            {children}
            {iconRight && <span className="inline-flex">{iconRight}</span>}
          </>
        )}
      </button>
    );
  },
);

Button.displayName = "Button";

export { Button, buttonVariants };
