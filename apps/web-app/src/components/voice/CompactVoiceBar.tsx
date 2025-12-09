/**
 * CompactVoiceBar Component
 *
 * A compact (~80px height) voice mode bar that shows mic button, live transcript,
 * tool indicators, and action buttons. Designed to not obscure the chat conversation.
 *
 * Part of the two-mode panel architecture:
 * - Compact mode: This component (always visible when voice mode active)
 * - Expanded mode: VoiceExpandedDrawer slides up above this bar
 *
 * Phase 11: VoiceAssist Voice Pipeline Sprint
 */

import { useCallback } from "react";
import type { TTToolCall } from "../../hooks/useThinkerTalkerSession";

// ============================================================================
// Types
// ============================================================================

export interface CompactVoiceBarProps {
  /** Whether connected to voice backend */
  isConnected: boolean;
  /** Whether currently connecting */
  isConnecting: boolean;
  /** Whether actively listening for speech */
  isListening: boolean;
  /** Whether AI is speaking/playing audio */
  isPlaying: boolean;
  /** Whether microphone permission was denied */
  isMicPermissionDenied: boolean;
  /** Current pipeline state (idle, listening, processing, speaking) */
  pipelineState: string;
  /** Partial transcript from STT */
  partialTranscript: string;
  /** Current tool calls in progress */
  currentToolCalls: TTToolCall[];
  /** Total latency in ms (null if not measured) */
  latencyMs: number | null;
  /** Called when user wants to connect */
  onConnect: () => void;
  /** Called when user wants to disconnect */
  onDisconnect: () => void;
  /** Called when user wants to barge-in (interrupt AI) */
  onBargeIn: () => void;
  /** Called when user wants to expand the drawer */
  onExpand: () => void;
  /** Called when user wants to close voice mode */
  onClose: () => void;
  /** Called when user wants to open settings */
  onOpenSettings: () => void;
  /** Whether continuation is expected (user pausing but will continue) */
  isContinuationExpected?: boolean;
  /** Network quality level for adaptive behavior indicator */
  networkQuality?: "excellent" | "good" | "fair" | "poor" | "unknown";
}

// ============================================================================
// Helper Components
// ============================================================================

/**
 * Compact mic button (48x48px)
 */
function CompactMicButton({
  isConnected,
  isConnecting,
  isListening,
  isPlaying,
  isMicPermissionDenied,
  onConnect,
  onDisconnect,
  onBargeIn,
}: {
  isConnected: boolean;
  isConnecting: boolean;
  isListening: boolean;
  isPlaying: boolean;
  isMicPermissionDenied: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onBargeIn: () => void;
}) {
  const getButtonConfig = useCallback(() => {
    if (isMicPermissionDenied) {
      return {
        action: onConnect,
        icon: "retry",
        className: "bg-red-500 hover:bg-red-600 text-white",
        ariaLabel: "Retry microphone access",
      };
    }
    if (isConnecting) {
      return {
        action: () => {},
        icon: "loading",
        className: "bg-neutral-300 text-neutral-600 cursor-wait",
        ariaLabel: "Connecting...",
      };
    }
    if (!isConnected) {
      return {
        action: onConnect,
        icon: "mic",
        className: "bg-primary-500 hover:bg-primary-600 text-white",
        ariaLabel: "Start voice mode",
      };
    }
    if (isPlaying) {
      return {
        action: onBargeIn,
        icon: "stop",
        className: "bg-orange-500 hover:bg-orange-600 text-white animate-pulse",
        ariaLabel: "Interrupt AI",
      };
    }
    if (isListening) {
      return {
        action: onDisconnect,
        icon: "mic-active",
        className: "bg-green-500 hover:bg-green-600 text-white",
        ariaLabel: "Stop listening",
      };
    }
    return {
      action: onDisconnect,
      icon: "stop",
      className: "bg-red-500 hover:bg-red-600 text-white",
      ariaLabel: "End voice mode",
    };
  }, [
    isConnected,
    isConnecting,
    isListening,
    isPlaying,
    isMicPermissionDenied,
    onConnect,
    onDisconnect,
    onBargeIn,
  ]);

  const config = getButtonConfig();

  const renderIcon = () => {
    switch (config.icon) {
      case "loading":
        return (
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
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
      case "retry":
        return (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        );
      case "stop":
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        );
      case "mic-active":
        return (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
          </svg>
        );
      default:
        return (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
          </svg>
        );
    }
  };

  return (
    <button
      type="button"
      onClick={config.action}
      disabled={isConnecting}
      className={`
        relative w-12 h-12 rounded-full flex items-center justify-center
        transition-all duration-200 shadow-md flex-shrink-0
        ${config.className}
      `}
      aria-label={config.ariaLabel}
      data-testid="compact-mic-button"
    >
      {renderIcon()}
    </button>
  );
}

/**
 * Small tool status chip for compact display
 */
function ToolChip({
  name,
  status,
}: {
  name: string;
  status: TTToolCall["status"];
}) {
  const statusColors = {
    pending: "bg-neutral-100 text-neutral-600",
    running: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };

  const statusDot = {
    pending: "bg-neutral-400",
    running: "bg-blue-500 animate-pulse",
    completed: "bg-green-500",
    failed: "bg-red-500",
  };

  // Format tool name (remove underscores, truncate)
  const displayName = name.replace(/_/g, " ").split(" ").slice(0, 2).join(" ");

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[status]}`}
      title={name}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${statusDot[status]}`} />
      <span className="truncate max-w-[60px]">{displayName}</span>
    </span>
  );
}

/**
 * Compact latency badge
 */
function LatencyBadge({ ms }: { ms: number }) {
  const getColor = () => {
    if (ms < 1000) return "bg-green-100 text-green-700";
    if (ms < 2000) return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  };

  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${getColor()}`}
    >
      {ms}ms
    </span>
  );
}

/**
 * Network quality indicator badge
 * Natural Conversation Flow: Phase 6 - Network-Adaptive Behavior
 */
function NetworkQualityBadge({
  quality,
}: {
  quality: "excellent" | "good" | "fair" | "poor" | "unknown";
}) {
  const getConfig = () => {
    switch (quality) {
      case "excellent":
        return {
          color: "bg-green-100 text-green-700",
          icon: "●●●●",
          label: "Excellent",
        };
      case "good":
        return {
          color: "bg-green-100 text-green-700",
          icon: "●●●○",
          label: "Good",
        };
      case "fair":
        return {
          color: "bg-yellow-100 text-yellow-700",
          icon: "●●○○",
          label: "Fair",
        };
      case "poor":
        return {
          color: "bg-red-100 text-red-700",
          icon: "●○○○",
          label: "Poor",
        };
      default:
        return {
          color: "bg-neutral-100 text-neutral-500",
          icon: "○○○○",
          label: "Unknown",
        };
    }
  };

  const config = getConfig();

  // Only show badge for non-excellent connections
  if (quality === "excellent" || quality === "unknown") {
    return null;
  }

  return (
    <span
      className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${config.color}`}
      title={`Network: ${config.label}`}
    >
      {config.icon}
    </span>
  );
}

/**
 * Transcript line with state indicator
 */
function TranscriptLine({ text, state }: { text: string; state: string }) {
  const stateLabels: Record<string, string> = {
    idle: "Ready",
    listening: "Listening",
    processing: "Thinking",
    speaking: "Speaking",
    cancelled: "Cancelled",
  };

  const label = stateLabels[state] || "Ready";

  if (!text && state === "idle") {
    return (
      <p className="text-sm text-neutral-400 truncate">
        Tap mic to start speaking...
      </p>
    );
  }

  return (
    <div className="min-w-0">
      <p className="text-xs text-neutral-500 font-medium">{label}</p>
      {text ? (
        <p className="text-sm text-neutral-800 truncate">{text}</p>
      ) : (
        <p className="text-sm text-neutral-400 truncate italic">
          {state === "listening"
            ? "Listening..."
            : state === "processing"
              ? "Processing..."
              : state === "speaking"
                ? "Speaking..."
                : "..."}
        </p>
      )}
    </div>
  );
}

/**
 * Icon button for action bar
 */
function IconButton({
  icon,
  onClick,
  label,
  testId,
}: {
  icon: "settings" | "expand" | "close" | "metrics";
  onClick: () => void;
  label: string;
  testId?: string;
}) {
  const renderIcon = () => {
    switch (icon) {
      case "settings":
        return (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        );
      case "expand":
        return (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 15.75l7.5-7.5 7.5 7.5"
            />
          </svg>
        );
      case "metrics":
        return (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
        );
      case "close":
        return (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        );
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
      aria-label={label}
      data-testid={testId}
    >
      {renderIcon()}
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function CompactVoiceBar({
  isConnected,
  isConnecting,
  isListening,
  isPlaying,
  isMicPermissionDenied,
  pipelineState,
  partialTranscript,
  currentToolCalls,
  latencyMs,
  onConnect,
  onDisconnect,
  onBargeIn,
  onExpand,
  onClose,
  onOpenSettings,
  isContinuationExpected = false,
  networkQuality = "unknown",
}: CompactVoiceBarProps) {
  // Natural Conversation Flow: Phase 3.2 - Continuation indicator styles
  // Pulsing border when system expects user to continue speaking
  const borderClass = isContinuationExpected
    ? "border-2 border-amber-400 animate-pulse"
    : "border-2 border-primary-500";

  return (
    <div
      className={`flex items-center gap-3 h-16 px-4 bg-white rounded-lg shadow-lg ${borderClass}`}
      data-testid="compact-voice-bar"
    >
      {/* Compact mic button (48x48) */}
      <CompactMicButton
        isConnected={isConnected}
        isConnecting={isConnecting}
        isListening={isListening}
        isPlaying={isPlaying}
        isMicPermissionDenied={isMicPermissionDenied}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onBargeIn={onBargeIn}
      />

      {/* Live transcript + status */}
      <div className="flex-1 min-w-0">
        <TranscriptLine text={partialTranscript} state={pipelineState} />

        {/* Tool indicator chips */}
        {currentToolCalls.length > 0 && (
          <div className="flex gap-1 mt-1 overflow-hidden">
            {currentToolCalls.slice(0, 2).map((tc) => (
              <ToolChip key={tc.id} name={tc.name} status={tc.status} />
            ))}
            {currentToolCalls.length > 2 && (
              <span className="text-xs text-neutral-500 px-1">
                +{currentToolCalls.length - 2}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Network quality + Latency badges */}
        {isConnected && <NetworkQualityBadge quality={networkQuality} />}
        {latencyMs !== null && isConnected && <LatencyBadge ms={latencyMs} />}

        <IconButton
          icon="settings"
          onClick={onOpenSettings}
          label="Voice settings"
          testId="compact-settings-btn"
        />
        <IconButton
          icon="expand"
          onClick={onExpand}
          label="Expand details"
          testId="compact-expand-btn"
        />
        <IconButton
          icon="close"
          onClick={onClose}
          label="Close voice mode"
          testId="compact-close-btn"
        />
      </div>
    </div>
  );
}

export default CompactVoiceBar;
