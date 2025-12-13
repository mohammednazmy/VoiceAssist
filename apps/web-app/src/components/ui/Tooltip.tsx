/**
 * Tooltip Component - Accessible tooltip with keyboard support
 *
 * A simple, accessible tooltip component that can wrap any element.
 * Shows on hover/focus with configurable placement.
 */

import { useState, useRef, useCallback, ReactNode } from "react";
import { cn } from "../../lib/utils";

type TooltipPlacement = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  /** The content to show in the tooltip */
  content: ReactNode;
  /** The element to attach the tooltip to */
  children: ReactNode;
  /** Tooltip placement relative to children */
  placement?: TooltipPlacement;
  /** Delay before showing tooltip (ms) */
  delay?: number;
  /** Custom class name for tooltip */
  className?: string;
  /** Disable the tooltip */
  disabled?: boolean;
}

export function Tooltip({
  content,
  children,
  placement = "top",
  delay = 200,
  className,
  disabled = false,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showTooltip = useCallback(() => {
    if (disabled) return;
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  }, [delay, disabled]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  }, []);

  const placementClasses: Record<TooltipPlacement, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  const arrowClasses: Record<TooltipPlacement, string> = {
    top: "top-full left-1/2 -translate-x-1/2 border-t-neutral-800 dark:border-t-neutral-200 border-x-transparent border-b-transparent",
    bottom:
      "bottom-full left-1/2 -translate-x-1/2 border-b-neutral-800 dark:border-b-neutral-200 border-x-transparent border-t-transparent",
    left: "left-full top-1/2 -translate-y-1/2 border-l-neutral-800 dark:border-l-neutral-200 border-y-transparent border-r-transparent",
    right:
      "right-full top-1/2 -translate-y-1/2 border-r-neutral-800 dark:border-r-neutral-200 border-y-transparent border-l-transparent",
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {isVisible && content && (
        <div
          role="tooltip"
          className={cn(
            "absolute z-50 px-2 py-1 text-xs font-medium",
            "bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900",
            "rounded shadow-lg whitespace-nowrap",
            "animate-in fade-in-0 zoom-in-95 duration-100",
            placementClasses[placement],
            className,
          )}
        >
          {content}
          {/* Arrow */}
          <span
            className={cn("absolute w-0 h-0 border-4", arrowClasses[placement])}
          />
        </div>
      )}
    </div>
  );
}

export default Tooltip;
