/**
 * Skeleton Component
 * Loading placeholder with animation
 *
 * Features:
 * - Multiple shapes: text, circle, rectangle
 * - Customizable width and height
 * - Pulse animation
 * - Accessible (aria-busy, aria-live)
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const skeletonVariants = cva(
  'animate-pulse bg-neutral-200 dark:bg-neutral-700',
  {
    variants: {
      variant: {
        text: 'rounded h-4',
        circle: 'rounded-full',
        rectangle: 'rounded-md',
      },
    },
    defaultVariants: {
      variant: 'rectangle',
    },
  }
);

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {
  /**
   * Width of the skeleton (CSS value)
   */
  width?: string | number;

  /**
   * Height of the skeleton (CSS value)
   */
  height?: string | number;

  /**
   * Number of lines (for text variant)
   */
  lines?: number;
}

function Skeleton({
  className,
  variant,
  width,
  height,
  lines,
  style,
  ...props
}: SkeletonProps) {
  // If lines is specified, render multiple text lines
  if (lines && variant === 'text') {
    return (
      <div className="space-y-2" role="status" aria-busy="true" aria-live="polite">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              skeletonVariants({ variant, className }),
              i === lines - 1 && 'w-4/5' // Last line slightly shorter
            )}
            style={{
              width: i === lines - 1 ? '80%' : width,
              ...style,
            }}
          />
        ))}
        <span className="sr-only">Loading content...</span>
      </div>
    );
  }

  return (
    <div
      className={cn(skeletonVariants({ variant, className }))}
      style={{
        width: width,
        height: height,
        ...style,
      }}
      role="status"
      aria-busy="true"
      aria-live="polite"
      {...props}
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

/**
 * Skeleton for Avatar
 */
function SkeletonAvatar({ className, ...props }: Omit<SkeletonProps, 'variant'>) {
  return (
    <Skeleton
      variant="circle"
      width="40px"
      height="40px"
      className={className}
      {...props}
    />
  );
}

/**
 * Skeleton for Card
 */
function SkeletonCard({ className, ...props }: Omit<SkeletonProps, 'variant'>) {
  return (
    <div className={cn('space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-700', className)} {...props}>
      <Skeleton variant="rectangle" height="120px" />
      <Skeleton variant="text" />
      <Skeleton variant="text" width="80%" />
    </div>
  );
}

/**
 * Skeleton for Table Row
 */
function SkeletonTableRow({ columns = 4, ...props }: Omit<SkeletonProps, 'variant'> & { columns?: number }) {
  return (
    <tr {...props}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="p-2">
          <Skeleton variant="text" />
        </td>
      ))}
    </tr>
  );
}

export { Skeleton, SkeletonAvatar, SkeletonCard, SkeletonTableRow, skeletonVariants };
