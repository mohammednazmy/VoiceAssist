/**
 * ConnectionStatusIndicator
 * Compact, unified status indicator for voice mode connection state
 *
 * Features:
 * - Colored badge with animated states
 * - Hover tooltip with details
 * - Compact enough for header placement
 */

/**
 * Connection status type for voice mode
 * Used by both OpenAI Realtime and Thinker/Talker pipelines
 */
export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error"
  | "failed"
  | "expired"
  | "mic_permission_denied";

interface ConnectionStatusIndicatorProps {
  status: ConnectionStatus;
  isOfflineMode?: boolean;
  isOfflineRecording?: boolean;
  reconnectAttempts?: number;
  className?: string;
}

const statusConfig: Record<
  ConnectionStatus | "offline" | "offline_recording",
  {
    label: string;
    color: string;
    bgColor: string;
    animate?: string;
    icon: "dot" | "spinner" | "warning" | "mic";
  }
> = {
  disconnected: {
    label: "Disconnected",
    color: "text-neutral-500",
    bgColor: "bg-neutral-100",
    icon: "dot",
  },
  connecting: {
    label: "Connecting...",
    color: "text-yellow-600",
    bgColor: "bg-yellow-50",
    animate: "animate-pulse",
    icon: "spinner",
  },
  connected: {
    label: "Connected",
    color: "text-green-600",
    bgColor: "bg-green-50",
    icon: "dot",
  },
  reconnecting: {
    label: "Reconnecting...",
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    animate: "animate-pulse",
    icon: "spinner",
  },
  error: {
    label: "Error",
    color: "text-red-600",
    bgColor: "bg-red-50",
    icon: "warning",
  },
  failed: {
    label: "Failed",
    color: "text-red-600",
    bgColor: "bg-red-50",
    icon: "warning",
  },
  expired: {
    label: "Expired",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    icon: "warning",
  },
  mic_permission_denied: {
    label: "Mic Blocked",
    color: "text-red-600",
    bgColor: "bg-red-50",
    icon: "mic",
  },
  offline: {
    label: "Offline",
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    icon: "warning",
  },
  offline_recording: {
    label: "Recording",
    color: "text-red-600",
    bgColor: "bg-red-50",
    animate: "animate-pulse",
    icon: "mic",
  },
};

function StatusIcon({ type }: { type: "dot" | "spinner" | "warning" | "mic" }) {
  switch (type) {
    case "spinner":
      return (
        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      );
    case "warning":
      return (
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      );
    case "mic":
      return (
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
          />
        </svg>
      );
    case "dot":
    default:
      return <span className="w-2 h-2 rounded-full bg-current" />;
  }
}

export function ConnectionStatusIndicator({
  status,
  isOfflineMode = false,
  isOfflineRecording = false,
  reconnectAttempts = 0,
  className = "",
}: ConnectionStatusIndicatorProps) {
  // Determine effective status
  const effectiveStatus = isOfflineRecording
    ? "offline_recording"
    : isOfflineMode && status !== "connected"
      ? "offline"
      : status;

  const config = statusConfig[effectiveStatus];

  // Build tooltip text
  let tooltip = config.label;
  if (status === "reconnecting" && reconnectAttempts > 0) {
    tooltip += ` (attempt ${reconnectAttempts})`;
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.color} ${config.animate || ""} ${className}`}
      title={tooltip}
      data-testid="connection-status-indicator"
      role="status"
      aria-label={`Connection status: ${config.label}`}
    >
      <StatusIcon type={config.icon} />
      <span className="hidden sm:inline">{config.label}</span>
    </div>
  );
}
