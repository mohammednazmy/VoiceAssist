/**
 * Slider Component
 * A styled slider/range input built on Radix UI Slider primitive
 *
 * Features:
 * - Single or multiple thumbs (range selection)
 * - Min/max bounds
 * - Step intervals
 * - Keyboard navigation
 * - Full accessibility
 */

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "../lib/utils";

export interface SliderProps extends React.ComponentPropsWithoutRef<
  typeof SliderPrimitive.Root
> {
  /** Additional class names for the slider track */
  trackClassName?: string;
  /** Additional class names for the slider range (filled portion) */
  rangeClassName?: string;
  /** Additional class names for the slider thumb(s) */
  thumbClassName?: string;
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(
  (
    { className, trackClassName, rangeClassName, thumbClassName, ...props },
    ref,
  ) => (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        className={cn(
          "relative h-2 w-full grow overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700",
          trackClassName,
        )}
      >
        <SliderPrimitive.Range
          className={cn(
            "absolute h-full bg-primary-500 dark:bg-primary-400",
            rangeClassName,
          )}
        />
      </SliderPrimitive.Track>
      {(props.value ?? props.defaultValue ?? [0]).map((_, index) => (
        <SliderPrimitive.Thumb
          key={index}
          className={cn(
            "block h-5 w-5 rounded-full border-2 border-primary-500 bg-white shadow-md ring-offset-white transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
            "hover:border-primary-600 hover:bg-neutral-50",
            "disabled:pointer-events-none disabled:opacity-50",
            "dark:border-primary-400 dark:bg-neutral-900 dark:ring-offset-neutral-900 dark:hover:bg-neutral-800",
            thumbClassName,
          )}
        />
      ))}
    </SliderPrimitive.Root>
  ),
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
