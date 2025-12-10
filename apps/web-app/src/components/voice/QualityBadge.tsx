/**
 * QualityBadge - Adaptive Quality Level Indicator
 *
 * Displays the current voice processing quality level based on
 * network conditions and system load. Part of the adaptive quality
 * service integration for Voice Mode v4.1 Phase 3.
 *
 * Quality Levels:
 * - ULTRA: Best quality, high latency budget (800ms)
 * - HIGH: Premium quality, balanced latency (600ms)
 * - MEDIUM: Standard quality, reduced latency (500ms)
 * - LOW: Basic quality, tight latency (400ms)
 * - MINIMAL: Fallback quality, minimal latency (300ms)
 *
 * Reference: docs/voice/adaptive-quality-service.md
 */

import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "../ui/Tooltip";

export type QualityLevel = "ultra" | "high" | "medium" | "low" | "minimal";

export type NetworkCondition =
  | "excellent"
  | "good"
  | "fair"
  | "poor"
  | "critical";

interface QualityBadgeProps {
  /** Current quality level */
  level: QualityLevel;
  /** Network condition (for tooltip details) */
  networkCondition?: NetworkCondition;
  /** Round-trip time in milliseconds */
  rttMs?: number;
  /** Whether to show the quality label */
  showLabel?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Whether quality is currently changing (show pulse) */
  isChanging?: boolean;
  /** Callback when user clicks for more details */
  onClick?: () => void;
  /** Custom class name */
  className?: string;
}

interface QualityConfig {
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
  label: string;
  latencyTarget: number;
}

const QUALITY_CONFIG: Record<QualityLevel, QualityConfig> = {
  ultra: {
    color: "text-purple-700 dark:text-purple-300",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    borderColor: "border-purple-300 dark:border-purple-700",
    icon: "✦",
    label: "Ultra",
    latencyTarget: 800,
  },
  high: {
    color: "text-green-700 dark:text-green-300",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    borderColor: "border-green-300 dark:border-green-700",
    icon: "●",
    label: "High",
    latencyTarget: 600,
  },
  medium: {
    color: "text-yellow-700 dark:text-yellow-300",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    borderColor: "border-yellow-300 dark:border-yellow-700",
    icon: "◐",
    label: "Medium",
    latencyTarget: 500,
  },
  low: {
    color: "text-orange-700 dark:text-orange-300",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    borderColor: "border-orange-300 dark:border-orange-700",
    icon: "○",
    label: "Low",
    latencyTarget: 400,
  },
  minimal: {
    color: "text-red-700 dark:text-red-300",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    borderColor: "border-red-300 dark:border-red-700",
    icon: "◌",
    label: "Minimal",
    latencyTarget: 300,
  },
};

const SIZE_CLASSES = {
  sm: "px-1.5 py-0.5 text-xs gap-1",
  md: "px-2 py-1 text-sm gap-1.5",
  lg: "px-3 py-1.5 text-base gap-2",
};

export function QualityBadge({
  level,
  networkCondition,
  rttMs,
  showLabel = true,
  size = "md",
  isChanging = false,
  onClick,
  className,
}: QualityBadgeProps) {
  const [previousLevel, setPreviousLevel] = useState<QualityLevel>(level);
  const [showTransition, setShowTransition] = useState(false);

  const config = QUALITY_CONFIG[level];

  // Detect level changes for animation
  useEffect(() => {
    if (level !== previousLevel) {
      setShowTransition(true);
      const timeout = setTimeout(() => {
        setShowTransition(false);
        setPreviousLevel(level);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [level, previousLevel]);

  // Build tooltip content
  const tooltipContent = useMemo(() => {
    const lines = [
      `Quality: ${config.label}`,
      `Target Latency: ${config.latencyTarget}ms`,
    ];

    if (networkCondition) {
      lines.push(`Network: ${networkCondition}`);
    }

    if (rttMs !== undefined) {
      lines.push(`RTT: ${rttMs}ms`);
    }

    return (
      <div className="space-y-0.5">
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    );
  }, [config, networkCondition, rttMs]);

  const badge = (
    <div
      className={cn(
        "inline-flex items-center rounded-full border transition-all duration-200",
        config.bgColor,
        config.borderColor,
        config.color,
        SIZE_CLASSES[size],
        onClick && "cursor-pointer hover:opacity-80",
        (isChanging || showTransition) && "animate-pulse",
        className,
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`Voice quality: ${config.label}`}
    >
      {/* Quality indicator dot/icon */}
      <span
        className={cn(
          "flex-shrink-0",
          size === "sm" && "text-xs",
          size === "md" && "text-sm",
          size === "lg" && "text-base",
        )}
      >
        {config.icon}
      </span>

      {/* Label */}
      {showLabel && (
        <span className="font-medium uppercase tracking-wide">
          {config.label}
        </span>
      )}
    </div>
  );

  return (
    <Tooltip content={tooltipContent} placement="bottom">
      {badge}
    </Tooltip>
  );
}

/**
 * Hook to manage quality state with automatic degradation simulation
 */
export function useQualityLevel(initialLevel: QualityLevel = "high") {
  const [level, setLevel] = useState<QualityLevel>(initialLevel);
  const [networkCondition, setNetworkCondition] =
    useState<NetworkCondition>("good");
  const [rttMs, setRttMs] = useState(100);

  // Simulate network monitoring (in production, this would come from the backend)
  useEffect(() => {
    const updateNetwork = () => {
      // Simulate RTT fluctuation
      const newRtt = Math.max(
        20,
        Math.min(1000, rttMs + (Math.random() - 0.5) * 50),
      );
      setRttMs(Math.round(newRtt));

      // Determine condition and level based on RTT
      let condition: NetworkCondition;
      let newLevel: QualityLevel;

      if (newRtt < 50) {
        condition = "excellent";
        newLevel = "ultra";
      } else if (newRtt < 150) {
        condition = "good";
        newLevel = "high";
      } else if (newRtt < 300) {
        condition = "fair";
        newLevel = "medium";
      } else if (newRtt < 500) {
        condition = "poor";
        newLevel = "low";
      } else {
        condition = "critical";
        newLevel = "minimal";
      }

      setNetworkCondition(condition);
      setLevel(newLevel);
    };

    const interval = setInterval(updateNetwork, 5000);
    return () => clearInterval(interval);
  }, [rttMs]);

  return {
    level,
    setLevel,
    networkCondition,
    rttMs,
    isChanging: false,
  };
}

export default QualityBadge;
