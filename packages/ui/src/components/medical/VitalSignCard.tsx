/**
 * VitalSignCard Component
 * Displays a single vital sign with status indication
 *
 * Features:
 * - Color-coded status (normal, warning, critical)
 * - Trend indicator (up, down, stable)
 * - Accessibility: High contrast, screen reader friendly
 * - Animation: Critical pulse for out-of-range values
 * - Dark mode support
 *
 * @example
 * ```tsx
 * <VitalSignCard
 *   label="Heart Rate"
 *   value={72}
 *   unit="bpm"
 *   status="normal"
 *   trend="stable"
 *   normalRange={{ min: 60, max: 100 }}
 * />
 * ```
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

/**
 * Vital sign status variants
 */
const vitalSignCardVariants = cva(
  "rounded-lg border-2 p-4 transition-all duration-200",
  {
    variants: {
      status: {
        normal:
          "bg-success-50 border-success-200 text-success-900 dark:bg-success-950 dark:border-success-800 dark:text-success-100",
        warning:
          "bg-warning-50 border-warning-200 text-warning-900 dark:bg-warning-950 dark:border-warning-800 dark:text-warning-100",
        critical:
          "bg-error-50 border-error-300 text-error-900 dark:bg-error-950 dark:border-error-700 dark:text-error-100 animate-pulse",
        unknown:
          "bg-neutral-50 border-neutral-200 text-neutral-900 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100",
      },
      size: {
        sm: "p-3",
        md: "p-4",
        lg: "p-5",
      },
    },
    defaultVariants: {
      status: "unknown",
      size: "md",
    },
  },
);

/**
 * Trend icons mapping
 */
const trendConfig = {
  up: {
    icon: "↑",
    label: "increasing",
    className: "text-error-600 dark:text-error-400",
  },
  down: {
    icon: "↓",
    label: "decreasing",
    className: "text-primary-600 dark:text-primary-400",
  },
  stable: {
    icon: "→",
    label: "stable",
    className: "text-neutral-500 dark:text-neutral-400",
  },
} as const;

/**
 * Status label mapping
 */
const statusLabels = {
  normal: "Normal",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
} as const;

export interface VitalSignCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof vitalSignCardVariants> {
  /**
   * Label for the vital sign (e.g., "Heart Rate", "Blood Pressure")
   */
  label: string;

  /**
   * Current value of the vital sign
   */
  value: number | string;

  /**
   * Unit of measurement (e.g., "bpm", "mmHg", "%")
   */
  unit: string;

  /**
   * Current status of the vital sign
   */
  status?: "normal" | "warning" | "critical" | "unknown";

  /**
   * Trend direction
   */
  trend?: "up" | "down" | "stable";

  /**
   * Normal range for reference
   */
  normalRange?: {
    min: number;
    max: number;
  };

  /**
   * Last updated timestamp
   */
  timestamp?: Date;

  /**
   * Secondary value (e.g., diastolic for blood pressure)
   */
  secondaryValue?: number | string;

  /**
   * Secondary unit (if different from primary)
   */
  secondaryUnit?: string;

  /**
   * Whether to show the status badge
   */
  showStatusBadge?: boolean;

  /**
   * Whether the card is loading
   */
  loading?: boolean;

  /**
   * Callback when card is clicked
   */
  onPress?: () => void;
}

/**
 * VitalSignCard Component
 */
const VitalSignCard = React.forwardRef<HTMLDivElement, VitalSignCardProps>(
  (
    {
      className,
      label,
      value,
      unit,
      status = "unknown",
      size,
      trend,
      normalRange,
      timestamp,
      secondaryValue,
      secondaryUnit,
      showStatusBadge = false,
      loading = false,
      onPress,
      ...props
    },
    ref,
  ) => {
    const isInteractive = !!onPress;
    const trendInfo = trend ? trendConfig[trend] : null;

    // Format timestamp if provided
    const formattedTime = timestamp
      ? timestamp.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

    // Combine value display
    const displayValue =
      secondaryValue !== undefined ? `${value}/${secondaryValue}` : value;
    const displayUnit = secondaryUnit || unit;

    // Accessibility label
    const ariaLabel = `${label}: ${displayValue} ${displayUnit}, status: ${statusLabels[status]}${
      trendInfo ? `, trend: ${trendInfo.label}` : ""
    }`;

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (isInteractive && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        onPress?.();
      }
    };

    if (loading) {
      return (
        <div
          ref={ref}
          className={cn(
            vitalSignCardVariants({ status: "unknown", size }),
            "animate-pulse",
            className,
          )}
          aria-busy="true"
          aria-label={`Loading ${label}`}
          {...props}
        >
          <div className="flex items-center justify-between">
            <div className="h-4 w-20 rounded bg-neutral-200 dark:bg-neutral-700" />
            <div className="h-4 w-4 rounded bg-neutral-200 dark:bg-neutral-700" />
          </div>
          <div className="mt-3 h-8 w-24 rounded bg-neutral-200 dark:bg-neutral-700" />
          <div className="mt-2 h-3 w-16 rounded bg-neutral-200 dark:bg-neutral-700" />
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(
          vitalSignCardVariants({ status, size }),
          isInteractive &&
            "cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
          className,
        )}
        role={isInteractive ? "button" : "region"}
        aria-label={ariaLabel}
        tabIndex={isInteractive ? 0 : undefined}
        onClick={onPress}
        onKeyDown={handleKeyDown}
        {...props}
      >
        {/* Header: Label and Trend */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium uppercase tracking-wide opacity-75">
            {label}
          </span>
          <div className="flex items-center gap-2">
            {showStatusBadge && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  status === "normal" &&
                    "bg-success-200 text-success-800 dark:bg-success-800 dark:text-success-200",
                  status === "warning" &&
                    "bg-warning-200 text-warning-800 dark:bg-warning-800 dark:text-warning-200",
                  status === "critical" &&
                    "bg-error-200 text-error-800 dark:bg-error-800 dark:text-error-200",
                  status === "unknown" &&
                    "bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200",
                )}
              >
                {statusLabels[status]}
              </span>
            )}
            {trendInfo && (
              <span
                className={cn("text-lg", trendInfo.className)}
                aria-label={`Trend: ${trendInfo.label}`}
                title={`Trend: ${trendInfo.label}`}
              >
                {trendInfo.icon}
              </span>
            )}
          </div>
        </div>

        {/* Value */}
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-3xl font-bold tabular-nums" aria-hidden="true">
            {displayValue}
          </span>
          <span className="text-sm opacity-75">{displayUnit}</span>
        </div>

        {/* Normal Range */}
        {normalRange && (
          <div className="mt-2 text-xs opacity-60">
            Normal: {normalRange.min}-{normalRange.max} {unit}
          </div>
        )}

        {/* Timestamp */}
        {formattedTime && (
          <div className="mt-1 text-xs opacity-50">
            Updated: {formattedTime}
          </div>
        )}
      </div>
    );
  },
);

VitalSignCard.displayName = "VitalSignCard";

export { VitalSignCard, vitalSignCardVariants };
