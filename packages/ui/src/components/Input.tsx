/**
 * Input Component
 * A styled input field with support for different states, sizes, and icons
 *
 * Features:
 * - Multiple sizes: sm, md, lg
 * - States: default, error, disabled, focused
 * - Icon support (prefix/suffix)
 * - Label and helper text
 * - Error message display
 * - Dark mode support
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const inputVariants = cva(
  'flex w-full rounded-md border border-border-default bg-surface-input px-3 py-2 text-sm text-text-primary shadow-sm transition-colors duration-normal file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background-primary hover:border-border-strong focus-visible:bg-surface-input-focus disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default: '',
        error:
          'border-border-error focus-visible:ring-border-error focus-visible:bg-surface-input',
      },
      inputSize: {
        sm: 'h-8 text-xs',
        md: 'h-10 text-sm',
        lg: 'h-12 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      inputSize: 'md',
    },
  }
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  /**
   * Show error state
   */
  error?: boolean;

  /**
   * Error message to display
   */
  errorMessage?: string;

  /**
   * Helper text to display below input
   */
  helperText?: string;

  /**
   * Label for the input
   */
  label?: string;

  /**
   * Icon to display at the start of the input
   */
  iconLeft?: React.ReactNode;

  /**
   * Icon to display at the end of the input
   */
  iconRight?: React.ReactNode;

  /**
   * Make the input full width
   */
  fullWidth?: boolean;

  /**
   * Whether the field is required
   */
  required?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      variant,
      inputSize,
      error,
      errorMessage,
      helperText,
      label,
      iconLeft,
      iconRight,
      fullWidth,
      required,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || `input-${React.useId()}`;
    const helperTextId = `${inputId}-helper`;
    const errorMessageId = `${inputId}-error`;

    const finalVariant = error ? 'error' : variant;

    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-text-primary"
          >
            {label}
            {required && <span className="text-text-error ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          {iconLeft && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
              {iconLeft}
            </div>
          )}

          <input
            id={inputId}
            type={type}
            className={cn(
              inputVariants({ variant: finalVariant, inputSize, className }),
              iconLeft && 'pl-10',
              iconRight && 'pr-10'
            )}
            ref={ref}
            aria-invalid={error}
            aria-describedby={
              error && errorMessage
                ? errorMessageId
                : helperText
                ? helperTextId
                : undefined
            }
            aria-required={required}
            {...props}
          />

          {iconRight && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary">
              {iconRight}
            </div>
          )}
        </div>

        {error && errorMessage && (
          <p
            id={errorMessageId}
            className="text-sm text-text-error"
            role="alert"
          >
            {errorMessage}
          </p>
        )}

        {!error && helperText && (
          <p id={helperTextId} className="text-sm text-text-tertiary">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input, inputVariants };
