/**
 * Input Component
 * A styled input field with support for different states and sizes
 */

import * as React from 'react';
import { cn } from '../lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  fullWidth?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, fullWidth, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm',
          'ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'placeholder:text-neutral-400',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error && 'border-error-500 focus-visible:ring-error-500',
          fullWidth && 'w-full',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export { Input };
