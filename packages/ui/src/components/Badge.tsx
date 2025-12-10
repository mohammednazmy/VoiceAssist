/**
 * Badge Component
 * Small count and labeling component
 *
 * Features:
 * - Multiple variants: default, primary, secondary, success, warning, error
 * - Two sizes: sm, md
 * - Dot variant for status indicators
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100",
        primary:
          "bg-primary-100 text-primary-900 dark:bg-primary-900 dark:text-primary-100",
        secondary:
          "bg-secondary-100 text-secondary-900 dark:bg-secondary-900 dark:text-secondary-100",
        success:
          "bg-success-100 text-success-900 dark:bg-success-900 dark:text-success-100",
        warning:
          "bg-warning-100 text-warning-900 dark:bg-warning-900 dark:text-warning-100",
        error:
          "bg-error-100 text-error-900 dark:bg-error-900 dark:text-error-100",
        outline:
          "border-2 border-neutral-300 bg-transparent text-neutral-900 dark:border-neutral-600 dark:text-neutral-100",
      },
      size: {
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-1 text-sm",
      },
      dot: {
        true: "gap-1.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

/**
 * Dot indicator for status
 */
const DotIndicator = ({ className }: { className?: string }) => (
  <span
    className={cn("h-2 w-2 rounded-full bg-current", className)}
    aria-hidden="true"
  />
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /**
   * Show a dot indicator
   */
  dot?: boolean;

  /**
   * Show count badge (displays number up to 99+)
   */
  count?: number;

  /**
   * Show count even when it's 0
   */
  showZero?: boolean;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    { className, variant, size, dot, count, showZero, children, ...props },
    ref,
  ) => {
    // Determine what to display for count
    const displayCount = count !== undefined && (count > 0 || showZero);
    const countText =
      count !== undefined && count > 99 ? "99+" : count?.toString();

    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant, size, dot, className }))}
        {...props}
      >
        {dot && <DotIndicator />}
        {displayCount ? countText : children}
      </span>
    );
  },
);

Badge.displayName = "Badge";

export { Badge, badgeVariants };
