/**
 * ConnectionStatus Component
 * Displays WebSocket connection status with visual indicators and reconnect functionality
 */

import type { ConnectionStatus as Status } from "@voiceassist/types";

export interface ConnectionStatusProps {
  status: Status;
  onReconnect?: () => void;
  /** Compact mode for inline display near input */
  compact?: boolean;
}

// Spinner icon for connecting/reconnecting states
const SpinnerIcon = () => (
  <svg
    className="w-3 h-3 animate-spin"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
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
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

// Retry icon
const RetryIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
    className="w-3 h-3"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
    />
  </svg>
);

export function ConnectionStatus({
  status,
  onReconnect,
  compact = false,
}: ConnectionStatusProps) {
  const statusConfig = {
    connecting: {
      label: "Connecting",
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
      borderColor: "border-yellow-200",
      icon: <SpinnerIcon />,
    },
    connected: {
      label: "Connected",
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      icon: <div className="w-2 h-2 rounded-full bg-green-500" />,
    },
    reconnecting: {
      label: "Reconnecting",
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      borderColor: "border-orange-200",
      icon: <SpinnerIcon />,
    },
    disconnected: {
      label: "Disconnected",
      color: "text-red-600",
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
      icon: <div className="w-2 h-2 rounded-full bg-red-500" />,
    },
  };

  const config = statusConfig[status];

  // Compact version for inline display
  if (compact) {
    if (status === "connected") {
      return null; // Don't show when connected in compact mode
    }

    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs ${config.color}`}
        role="status"
        aria-live="polite"
        aria-label={`Connection status: ${config.label}`}
      >
        {config.icon}
        <span className="font-medium">{config.label}</span>
        {status === "disconnected" && onReconnect && (
          <button
            type="button"
            onClick={onReconnect}
            className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium text-red-700 hover:text-red-800 bg-red-100 hover:bg-red-200 rounded transition-colors"
            aria-label="Reconnect to chat"
          >
            <RetryIcon />
            Retry
          </button>
        )}
      </div>
    );
  }

  // Full version for header display
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${config.bgColor} ${config.borderColor}`}
      role="status"
      aria-live="polite"
      aria-label={`Connection status: ${config.label}`}
    >
      {config.icon}
      <span className={`text-xs font-medium ${config.color}`}>
        {config.label}
      </span>

      {status === "disconnected" && onReconnect && (
        <button
          type="button"
          onClick={onReconnect}
          className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-full transition-colors"
          aria-label="Reconnect to chat"
        >
          <RetryIcon />
          Retry
        </button>
      )}
    </div>
  );
}
