/**
 * LatencyIndicator Component
 * Displays voice mode latency with visual status and degradation info.
 *
 * Part of Voice Mode Enhancement Plan v4.1
 * Reference: /home/asimo/.claude/plans/noble-bubbling-trinket.md#performance-safeguards
 */

import React from "react";
import { cn } from "../../lib/utils";

interface LatencyIndicatorProps {
  latencyMs: number;
  degradations?: string[];
  className?: string;
  showDetails?: boolean;
  size?: "sm" | "md";
}

type LatencyStatus = "good" | "fair" | "slow";

/**
 * Determine latency status based on milliseconds
 */
function getLatencyStatus(latencyMs: number): LatencyStatus {
  if (latencyMs < 500) return "good";
  if (latencyMs < 700) return "fair";
  return "slow";
}

/**
 * Get human-readable label for latency status
 */
function getStatusLabel(status: LatencyStatus): string {
  switch (status) {
    case "good":
      return "Fast";
    case "fair":
      return "Normal";
    case "slow":
      return "Slow";
  }
}

/**
 * Get human-readable labels for degradation types
 */
function getDegradationLabel(degradation: string): string {
  const labels: Record<string, string> = {
    language_detection_skipped: "Language detection skipped",
    language_detection_budget_exceeded: "Language detection skipped (slow)",
    translation_skipped: "Translation skipped",
    translation_budget_exceeded: "Translation skipped (slow)",
    translation_failed: "Translation failed",
    rag_limited_to_1: "Search limited",
    rag_limited_to_3: "Search limited",
    rag_retrieval_failed: "Search failed",
    llm_context_shortened: "Context shortened",
    tts_used_cached_greeting: "Audio cached",
    parallel_stt_reduced: "Speech recognition simplified",
  };
  return labels[degradation] || degradation;
}

/**
 * Tooltip component for degradation details
 */
function DegradationTooltip({
  degradations,
  children,
}: {
  degradations: string[];
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="cursor-help"
      >
        {children}
      </div>
      {isOpen && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
          <div className="bg-neutral-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
            <div className="font-medium mb-1">Features adjusted:</div>
            <ul className="space-y-0.5">
              {degradations.map((d, i) => (
                <li key={i} className="text-neutral-300">
                  {getDegradationLabel(d)}
                </li>
              ))}
            </ul>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900" />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Info icon for degradation indicator
 */
function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * LatencyIndicator
 *
 * Shows a visual indicator of voice processing latency with:
 * - Color-coded status (green/yellow/red)
 * - Latency in milliseconds
 * - Degradation info tooltip when features were adjusted
 */
export function LatencyIndicator({
  latencyMs,
  degradations = [],
  className = "",
  showDetails = true,
  size = "sm",
}: LatencyIndicatorProps) {
  const status = getLatencyStatus(latencyMs);
  const hasDegradations = degradations.length > 0;

  const dotSize = size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      role="status"
      aria-label={`Response time: ${Math.round(latencyMs)}ms, status: ${getStatusLabel(status)}`}
    >
      {/* Status dot */}
      <span
        className={cn(
          dotSize,
          "rounded-full",
          status === "good" && "bg-green-500",
          status === "fair" && "bg-yellow-500",
          status === "slow" && "bg-red-500",
        )}
      />

      {/* Latency value */}
      {showDetails && (
        <span
          className={cn(textSize, "text-neutral-500 dark:text-neutral-400")}
        >
          {Math.round(latencyMs)}ms
        </span>
      )}

      {/* Degradation indicator */}
      {hasDegradations && (
        <DegradationTooltip degradations={degradations}>
          <InfoIcon
            className={cn(
              size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4",
              "text-yellow-500",
            )}
          />
        </DegradationTooltip>
      )}
    </div>
  );
}

/**
 * LatencyBadge - Compact version for embedding in other components
 */
export function LatencyBadge({
  latencyMs,
  className = "",
}: {
  latencyMs: number;
  className?: string;
}) {
  const status = getLatencyStatus(latencyMs);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium",
        status === "good" &&
          "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
        status === "fair" &&
          "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
        status === "slow" &&
          "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
        className,
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          status === "good" && "bg-green-500",
          status === "fair" && "bg-yellow-500",
          status === "slow" && "bg-red-500",
        )}
      />
      {Math.round(latencyMs)}ms
    </span>
  );
}

export default LatencyIndicator;
