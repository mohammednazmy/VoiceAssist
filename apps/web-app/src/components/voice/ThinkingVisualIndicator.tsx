/**
 * ThinkingVisualIndicator Component
 * Provides visual feedback for thinking/processing states.
 *
 * Part of Voice Mode Enhancement Plan v4.1
 * Reference: /home/asimo/.claude/plans/noble-bubbling-trinket.md#thinking-tone-ux-improvements
 */

import React from "react";

export type ThinkingVisualStyle = "dots" | "pulse" | "spinner" | "progress";

interface ThinkingVisualIndicatorProps {
  style: ThinkingVisualStyle;
  className?: string;
  size?: "sm" | "md" | "lg";
  color?: string;
}

/**
 * Animated dots indicator
 */
function DotsIndicator({
  size,
  color,
}: {
  size: "sm" | "md" | "lg";
  color: string;
}) {
  const dotSize =
    size === "sm" ? "w-1.5 h-1.5" : size === "md" ? "w-2 h-2" : "w-3 h-3";
  const gap = size === "sm" ? "gap-1" : size === "md" ? "gap-1.5" : "gap-2";

  return (
    <div className={`flex items-center ${gap}`}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`${dotSize} rounded-full animate-bounce`}
          style={{
            backgroundColor: color,
            animationDelay: `${i * 0.15}s`,
            animationDuration: "0.6s",
          }}
        />
      ))}
    </div>
  );
}

/**
 * Pulsing circle indicator
 */
function PulseIndicator({
  size,
  color,
}: {
  size: "sm" | "md" | "lg";
  color: string;
}) {
  const circleSize =
    size === "sm" ? "w-4 h-4" : size === "md" ? "w-6 h-6" : "w-8 h-8";

  return (
    <div className="relative flex items-center justify-center">
      <div
        className={`${circleSize} rounded-full animate-ping absolute opacity-50`}
        style={{ backgroundColor: color }}
      />
      <div
        className={`${circleSize} rounded-full`}
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

/**
 * Spinning loader indicator
 */
function SpinnerIndicator({
  size,
  color,
}: {
  size: "sm" | "md" | "lg";
  color: string;
}) {
  const spinnerSize =
    size === "sm" ? "w-4 h-4" : size === "md" ? "w-6 h-6" : "w-8 h-8";
  const borderWidth = size === "sm" ? "border-2" : "border-3";

  return (
    <div
      className={`${spinnerSize} ${borderWidth} rounded-full animate-spin`}
      style={{
        borderColor: `${color}33`,
        borderTopColor: color,
      }}
    />
  );
}

/**
 * Progress bar indicator
 */
function ProgressIndicator({
  size,
  color,
}: {
  size: "sm" | "md" | "lg";
  color: string;
}) {
  const height = size === "sm" ? "h-1" : size === "md" ? "h-1.5" : "h-2";
  const width = size === "sm" ? "w-16" : size === "md" ? "w-24" : "w-32";

  return (
    <div
      className={`${width} ${height} rounded-full overflow-hidden`}
      style={{ backgroundColor: `${color}33` }}
    >
      <div
        className={`h-full rounded-full animate-progress-indeterminate`}
        style={{ backgroundColor: color }}
      />
      <style>
        {`
          @keyframes progress-indeterminate {
            0% {
              width: 0%;
              margin-left: 0%;
            }
            50% {
              width: 50%;
              margin-left: 25%;
            }
            100% {
              width: 0%;
              margin-left: 100%;
            }
          }
          .animate-progress-indeterminate {
            animation: progress-indeterminate 1.5s ease-in-out infinite;
          }
        `}
      </style>
    </div>
  );
}

/**
 * ThinkingVisualIndicator
 * Renders different visual feedback styles for thinking states.
 */
export function ThinkingVisualIndicator({
  style,
  className = "",
  size = "md",
  color = "#6366f1", // Default indigo-500
}: ThinkingVisualIndicatorProps) {
  const indicators: Record<ThinkingVisualStyle, React.ReactNode> = {
    dots: <DotsIndicator size={size} color={color} />,
    pulse: <PulseIndicator size={size} color={color} />,
    spinner: <SpinnerIndicator size={size} color={color} />,
    progress: <ProgressIndicator size={size} color={color} />,
  };

  return (
    <div
      className={`inline-flex items-center justify-center ${className}`}
      role="status"
      aria-label="Processing"
    >
      {indicators[style]}
      <span className="sr-only">Processing...</span>
    </div>
  );
}

export default ThinkingVisualIndicator;
