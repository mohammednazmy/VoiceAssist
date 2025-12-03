/**
 * Duplex Indicator Component
 *
 * Visual indicator for full duplex voice state.
 * Shows when both user and AI are speaking simultaneously.
 *
 * Phase 6: Full Duplex Experience
 */

import React, { useEffect, useState } from "react";
import type { DuplexState, ActiveStream } from "../../lib/fullDuplex/types";

// ============================================================================
// Types
// ============================================================================

export interface DuplexIndicatorProps {
  /** Current duplex state */
  state: DuplexState;

  /** Show detailed info */
  showDetails?: boolean;

  /** Size variant */
  size?: "sm" | "md" | "lg";

  /** Custom class name */
  className?: string;

  /** Optional click handler */
  onClick?: () => void;
}

// ============================================================================
// Styles
// ============================================================================

const getContainerStyles = (
  size: "sm" | "md" | "lg",
  activeStream: ActiveStream,
): React.CSSProperties => {
  const sizeMap = {
    sm: { width: "24px", height: "24px" },
    md: { width: "32px", height: "32px" },
    lg: { width: "48px", height: "48px" },
  };

  const colorMap: Record<ActiveStream, string> = {
    none: "#6b7280", // gray-500
    user: "#3b82f6", // blue-500
    ai: "#10b981", // emerald-500
    both: "#f59e0b", // amber-500
  };

  return {
    ...sizeMap[size],
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    backgroundColor: colorMap[activeStream] + "20",
    border: `2px solid ${colorMap[activeStream]}`,
    transition: "all 0.2s ease-in-out",
    cursor: "pointer",
  };
};

const getPulseStyles = (isActive: boolean): React.CSSProperties => ({
  width: "100%",
  height: "100%",
  borderRadius: "50%",
  animation: isActive ? "pulse 1.5s ease-in-out infinite" : "none",
});

// ============================================================================
// Component
// ============================================================================

/**
 * Visual indicator showing full duplex voice state
 */
export function DuplexIndicator({
  state,
  showDetails = false,
  size = "md",
  className = "",
  onClick,
}: DuplexIndicatorProps): JSX.Element {
  const [pulseIntensity, setPulseIntensity] = useState(0);

  // Animate pulse based on overlap duration
  useEffect(() => {
    if (state.isOverlap) {
      const intensity = Math.min(1, state.overlapDuration / 500);
      setPulseIntensity(intensity);
    } else {
      setPulseIntensity(0);
    }
  }, [state.isOverlap, state.overlapDuration]);

  const getStatusLabel = (): string => {
    if (state.toolCallInProgress) {
      return "Processing...";
    }
    switch (state.activeStream) {
      case "both":
        return "Overlap";
      case "user":
        return "Listening";
      case "ai":
        return "Speaking";
      default:
        return "Ready";
    }
  };

  const getIcon = (): JSX.Element => {
    const iconSize = size === "sm" ? 12 : size === "md" ? 16 : 24;

    if (state.activeStream === "both") {
      // Overlap icon - two overlapping circles
      return (
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="9" cy="12" r="6" opacity="0.7" />
          <circle cx="15" cy="12" r="6" opacity="0.7" />
        </svg>
      );
    }

    if (state.activeStream === "user") {
      // Microphone icon
      return (
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      );
    }

    if (state.activeStream === "ai") {
      // Speaker icon
      return (
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      );
    }

    // Ready/idle icon
    return (
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
      </svg>
    );
  };

  return (
    <div
      className={`duplex-indicator ${className}`}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
      }}
    >
      {/* Keyframes for pulse animation */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.8; }
          }
          @keyframes overlap-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
            50% { box-shadow: 0 0 0 8px rgba(245, 158, 11, 0); }
          }
        `}
      </style>

      {/* Main indicator */}
      <div
        style={{
          ...getContainerStyles(size, state.activeStream),
          animation: state.isOverlap
            ? "overlap-pulse 1s ease-in-out infinite"
            : undefined,
        }}
        onClick={onClick}
        role="button"
        tabIndex={0}
        aria-label={getStatusLabel()}
      >
        <div
          style={{
            ...getPulseStyles(state.userSpeaking || state.aiSpeaking),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color:
              state.activeStream === "none"
                ? "#6b7280"
                : state.activeStream === "user"
                  ? "#3b82f6"
                  : state.activeStream === "ai"
                    ? "#10b981"
                    : "#f59e0b",
          }}
        >
          {getIcon()}
        </div>
      </div>

      {/* Details panel */}
      {showDetails && (
        <div
          style={{
            fontSize: size === "sm" ? "10px" : "12px",
            color: "#6b7280",
            textAlign: "center",
          }}
        >
          <div style={{ fontWeight: 500 }}>{getStatusLabel()}</div>
          {state.isOverlap && (
            <div style={{ fontSize: "10px", color: "#f59e0b" }}>
              {state.overlapDuration}ms
            </div>
          )}
          {state.toolCallInProgress && (
            <div style={{ fontSize: "10px", color: "#8b5cf6" }}>
              Tool active
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Compact Variant
// ============================================================================

/**
 * Compact inline indicator for status bars
 */
export function DuplexIndicatorCompact({
  state,
  className = "",
}: {
  state: DuplexState;
  className?: string;
}): JSX.Element {
  const getColor = (): string => {
    switch (state.activeStream) {
      case "both":
        return "#f59e0b";
      case "user":
        return "#3b82f6";
      case "ai":
        return "#10b981";
      default:
        return "#6b7280";
    }
  };

  return (
    <div
      className={`duplex-indicator-compact ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "12px",
        color: getColor(),
      }}
    >
      <div
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: getColor(),
          animation: state.isOverlap
            ? "pulse 1s ease-in-out infinite"
            : undefined,
        }}
      />
      <span style={{ fontWeight: 500 }}>
        {state.isOverlap
          ? "Overlap"
          : state.activeStream === "user"
            ? "Listening"
            : state.activeStream === "ai"
              ? "Speaking"
              : "Ready"}
      </span>
    </div>
  );
}

// ============================================================================
// Export
// ============================================================================

export default DuplexIndicator;
