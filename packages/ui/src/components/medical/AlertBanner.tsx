/**
 * AlertBanner Component
 * Clinical alert banner for important notifications and warnings
 *
 * Features:
 * - Multiple severity levels (info, warning, critical, success)
 * - Dismissible with optional callback
 * - Auto-dismiss option with countdown
 * - Icon support
 * - Action buttons
 * - Accessibility: ARIA live regions, screen reader announcements
 * - Dark mode support
 *
 * @example
 * ```tsx
 * <AlertBanner
 *   severity="critical"
 *   title="Drug Interaction Alert"
 *   message="Warfarin and Aspirin may increase bleeding risk."
 *   onDismiss={() => {}}
 * />
 * ```
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

/**
 * Alert severity variants
 */
const alertBannerVariants = cva(
  "relative rounded-lg border-l-4 p-4 transition-all duration-200",
  {
    variants: {
      severity: {
        info: "border-l-primary-500 bg-primary-50 text-primary-900 dark:border-l-primary-400 dark:bg-primary-950 dark:text-primary-100",
        success:
          "border-l-success-500 bg-success-50 text-success-900 dark:border-l-success-400 dark:bg-success-950 dark:text-success-100",
        warning:
          "border-l-warning-500 bg-warning-50 text-warning-900 dark:border-l-warning-400 dark:bg-warning-950 dark:text-warning-100",
        critical:
          "border-l-error-500 bg-error-50 text-error-900 dark:border-l-error-400 dark:bg-error-950 dark:text-error-100",
      },
      variant: {
        default: "",
        subtle: "bg-opacity-50 dark:bg-opacity-50",
        solid: "border-l-0 rounded-lg",
      },
    },
    compoundVariants: [
      {
        severity: "info",
        variant: "solid",
        className: "bg-primary-600 text-white dark:bg-primary-700",
      },
      {
        severity: "success",
        variant: "solid",
        className: "bg-success-600 text-white dark:bg-success-700",
      },
      {
        severity: "warning",
        variant: "solid",
        className: "bg-warning-600 text-white dark:bg-warning-700",
      },
      {
        severity: "critical",
        variant: "solid",
        className: "bg-error-600 text-white dark:bg-error-700",
      },
    ],
    defaultVariants: {
      severity: "info",
      variant: "default",
    },
  },
);

/**
 * Icon variants for each severity
 */
const severityIcons = {
  info: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
        clipRule="evenodd"
      />
    </svg>
  ),
  success: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </svg>
  ),
  warning: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  ),
  critical: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  ),
};

/**
 * Close button component
 */
const CloseButton = ({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "absolute right-2 top-2 rounded-md p-1.5 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current",
      className,
    )}
    aria-label="Dismiss alert"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
    >
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  </button>
);

/**
 * Action button interface
 */
export interface AlertAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}

export interface AlertBannerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertBannerVariants> {
  /**
   * Alert title (bold heading)
   */
  title?: string;

  /**
   * Alert message (body text)
   */
  message?: string;

  /**
   * Alert severity level
   */
  severity?: "info" | "success" | "warning" | "critical";

  /**
   * Whether the alert can be dismissed
   */
  dismissible?: boolean;

  /**
   * Callback when alert is dismissed
   */
  onDismiss?: () => void;

  /**
   * Auto-dismiss after specified milliseconds
   */
  autoDismiss?: number;

  /**
   * Whether to show the severity icon
   */
  showIcon?: boolean;

  /**
   * Custom icon element
   */
  icon?: React.ReactNode;

  /**
   * Action buttons
   */
  actions?: AlertAction[];

  /**
   * Additional content to render below the message
   */
  children?: React.ReactNode;

  /**
   * ARIA live politeness for screen readers
   */
  ariaLive?: "polite" | "assertive" | "off";
}

/**
 * AlertBanner Component
 */
const AlertBanner = React.forwardRef<HTMLDivElement, AlertBannerProps>(
  (
    {
      className,
      severity = "info",
      variant,
      title,
      message,
      dismissible = false,
      onDismiss,
      autoDismiss,
      showIcon = true,
      icon,
      actions,
      children,
      ariaLive = "polite",
      ...props
    },
    ref,
  ) => {
    const [isVisible, setIsVisible] = React.useState(true);
    const [countdown, setCountdown] = React.useState<number | null>(null);

    // Handle auto-dismiss
    React.useEffect(() => {
      if (autoDismiss && autoDismiss > 0) {
        setCountdown(Math.ceil(autoDismiss / 1000));

        const countdownInterval = setInterval(() => {
          setCountdown((prev) => {
            if (prev === null || prev <= 1) {
              clearInterval(countdownInterval);
              return null;
            }
            return prev - 1;
          });
        }, 1000);

        const dismissTimeout = setTimeout(() => {
          handleDismiss();
        }, autoDismiss);

        return () => {
          clearInterval(countdownInterval);
          clearTimeout(dismissTimeout);
        };
      }
    }, [autoDismiss]);

    const handleDismiss = () => {
      setIsVisible(false);
      onDismiss?.();
    };

    // Use assertive for critical alerts
    const effectiveAriaLive = severity === "critical" ? "assertive" : ariaLive;

    if (!isVisible) {
      return null;
    }

    const iconElement = icon ?? (showIcon ? severityIcons[severity] : null);

    return (
      <div
        ref={ref}
        className={cn(alertBannerVariants({ severity, variant }), className)}
        role="alert"
        aria-live={effectiveAriaLive}
        {...props}
      >
        {dismissible && <CloseButton onClick={handleDismiss} />}

        <div className="flex gap-3">
          {/* Icon */}
          {iconElement && <div className="flex-shrink-0">{iconElement}</div>}

          {/* Content */}
          <div className="flex-1 min-w-0">
            {title && (
              <h4 className="font-semibold">
                {title}
                {countdown !== null && (
                  <span className="ml-2 text-sm font-normal opacity-75">
                    ({countdown}s)
                  </span>
                )}
              </h4>
            )}

            {message && (
              <p className={cn("text-sm", title && "mt-1")}>{message}</p>
            )}

            {children && (
              <div className={cn("text-sm", (title || message) && "mt-2")}>
                {children}
              </div>
            )}

            {/* Actions */}
            {actions && actions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {actions.map((action, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={action.onClick}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                      action.variant === "secondary"
                        ? "bg-white/20 hover:bg-white/30 focus-visible:ring-white"
                        : severity === "critical"
                          ? "bg-error-700 text-white hover:bg-error-800 focus-visible:ring-error-500 dark:bg-error-600 dark:hover:bg-error-500"
                          : severity === "warning"
                            ? "bg-warning-700 text-white hover:bg-warning-800 focus-visible:ring-warning-500 dark:bg-warning-600 dark:hover:bg-warning-500"
                            : severity === "success"
                              ? "bg-success-700 text-white hover:bg-success-800 focus-visible:ring-success-500 dark:bg-success-600 dark:hover:bg-success-500"
                              : "bg-primary-700 text-white hover:bg-primary-800 focus-visible:ring-primary-500 dark:bg-primary-600 dark:hover:bg-primary-500",
                    )}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);

AlertBanner.displayName = "AlertBanner";

export { AlertBanner, alertBannerVariants };
