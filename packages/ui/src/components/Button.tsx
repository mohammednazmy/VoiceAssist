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

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 focus-visible:ring-primary-500 dark:bg-primary-600 dark:hover:bg-primary-500',
        secondary:
          'bg-secondary-600 text-white hover:bg-secondary-700 active:bg-secondary-800 focus-visible:ring-secondary-500 dark:bg-secondary-600 dark:hover:bg-secondary-500',
        outline:
          'border-2 border-neutral-300 bg-transparent hover:bg-neutral-50 active:bg-neutral-100 focus-visible:ring-neutral-500 dark:border-neutral-600 dark:hover:bg-neutral-800 dark:active:bg-neutral-700',
        ghost:
          'bg-transparent hover:bg-neutral-100 active:bg-neutral-200 focus-visible:ring-neutral-500 dark:hover:bg-neutral-800 dark:active:bg-neutral-700',
        danger:
          'bg-error-600 text-white hover:bg-error-700 active:bg-error-800 focus-visible:ring-error-500 dark:bg-error-600 dark:hover:bg-error-500',
        success:
          'bg-success-600 text-white hover:bg-success-700 active:bg-success-800 focus-visible:ring-success-500 dark:bg-success-600 dark:hover:bg-success-500',
        link: 'text-primary-600 underline-offset-4 hover:underline focus-visible:ring-primary-500 dark:text-primary-400',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 py-2 text-base',
        lg: 'h-12 px-6 text-lg',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

/**
 * Spinner component for loading state
 */
const Spinner = ({ className }: { className?: string }) => (
  <svg
    className={cn('animate-spin h-4 w-4', className)}
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

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
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
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading}
        aria-live={loading ? 'polite' : undefined}
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
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants };
