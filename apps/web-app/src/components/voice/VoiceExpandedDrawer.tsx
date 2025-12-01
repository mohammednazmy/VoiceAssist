/**
 * VoiceExpandedDrawer Component
 *
 * An expandable drawer that slides up above the CompactVoiceBar to show
 * detailed metrics, tool calls in progress, and error information.
 *
 * Part of the two-mode panel architecture:
 * - Compact mode: CompactVoiceBar (always visible when voice mode active)
 * - Expanded mode: This drawer slides up above the compact bar
 *
 * Phase 11: VoiceAssist Voice Pipeline Sprint
 */

import type { TTToolCall } from "../../hooks/useThinkerTalkerSession";
import type { VoiceMetrics } from "./VoiceMetricsDisplay";
import { ToolCallDisplay } from "./ToolCallDisplay";

// ============================================================================
// Types
// ============================================================================

export interface VoiceExpandedDrawerProps {
  /** Whether the drawer is open */
  isOpen: boolean;
  /** Called when user wants to collapse the drawer */
  onCollapse: () => void;
  /** Voice metrics to display */
  metrics: VoiceMetrics;
  /** Whether connected (for metrics display) */
  isConnected: boolean;
  /** Current tool calls in progress */
  toolCalls: TTToolCall[];
  /** Error to display (if any) */
  error: { message: string; code?: string } | null;
  /** Called when user dismisses the error */
  onDismissError?: () => void;
  /** Time to first audio in ms (optional T/T metric) */
  ttfaMs?: number | null;
}

// ============================================================================
// Helper Components
// ============================================================================

/**
 * Compact metrics display for the drawer (simpler than full VoiceMetricsDisplay)
 */
function CompactMetrics({
  metrics,
  ttfaMs,
}: {
  metrics: VoiceMetrics;
  ttfaMs?: number | null;
}) {
  const formatMs = (ms: number | null): string => {
    if (ms === null) return "—";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getLatencyColor = (ms: number | null): string => {
    if (ms === null) return "text-neutral-400";
    if (ms < 500) return "text-green-600";
    if (ms < 1000) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      data-testid="compact-metrics"
    >
      {/* Connection */}
      <div className="text-center">
        <div className="text-xs text-neutral-500 mb-0.5">Connection</div>
        <div
          className={`text-sm font-mono ${getLatencyColor(metrics.connectionTimeMs)}`}
        >
          {formatMs(metrics.connectionTimeMs)}
        </div>
      </div>

      {/* STT Latency */}
      <div className="text-center">
        <div className="text-xs text-neutral-500 mb-0.5">STT</div>
        <div
          className={`text-sm font-mono ${getLatencyColor(metrics.lastSttLatencyMs)}`}
        >
          {formatMs(metrics.lastSttLatencyMs)}
        </div>
      </div>

      {/* Response Latency */}
      <div className="text-center">
        <div className="text-xs text-neutral-500 mb-0.5">Total</div>
        <div
          className={`text-sm font-mono ${getLatencyColor(metrics.lastResponseLatencyMs)}`}
        >
          {formatMs(metrics.lastResponseLatencyMs)}
        </div>
      </div>

      {/* TTFA or Session Duration */}
      <div className="text-center">
        <div className="text-xs text-neutral-500 mb-0.5">
          {ttfaMs !== null && ttfaMs !== undefined ? "TTFA" : "Session"}
        </div>
        <div
          className={`text-sm font-mono ${ttfaMs !== null && ttfaMs !== undefined ? getLatencyColor(ttfaMs) : "text-neutral-700"}`}
        >
          {ttfaMs !== null && ttfaMs !== undefined
            ? formatMs(ttfaMs)
            : formatDuration(metrics.sessionDurationMs)}
        </div>
      </div>
    </div>
  );
}

/**
 * Format duration for display (mm:ss)
 */
function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

/**
 * Error display section
 */
function ErrorSection({
  error,
  onDismiss,
}: {
  error: { message: string; code?: string };
  onDismiss?: () => void;
}) {
  return (
    <div
      className="bg-red-50 border-b border-red-200 px-4 py-3"
      data-testid="drawer-error"
    >
      <div className="flex items-start gap-2">
        <svg
          className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-800">
            {error.code === "mic_permission_denied"
              ? "Microphone Access Denied"
              : "Voice Error"}
          </p>
          <p className="text-xs text-red-600 mt-0.5 break-words">
            {error.message}
          </p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-red-500 hover:text-red-700 p-1 flex-shrink-0"
            aria-label="Dismiss error"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function VoiceExpandedDrawer({
  isOpen,
  onCollapse,
  metrics,
  isConnected,
  toolCalls,
  error,
  onDismissError,
  ttfaMs,
}: VoiceExpandedDrawerProps) {
  if (!isOpen) return null;

  return (
    <div
      className="mb-2 bg-white border border-neutral-200 rounded-lg shadow-lg overflow-hidden animate-slide-up"
      data-testid="voice-expanded-drawer"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-neutral-50 border-b">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-neutral-700">
            Voice Mode Details
          </span>
          {isConnected && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Connected
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
          aria-label="Collapse drawer"
          data-testid="collapse-drawer-btn"
        >
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
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </button>
      </div>

      {/* Error section (if any) */}
      {error && <ErrorSection error={error} onDismiss={onDismissError} />}

      {/* Metrics section */}
      <div className="p-3 border-b">
        <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
          Latency Metrics
        </div>
        <CompactMetrics metrics={metrics} ttfaMs={ttfaMs} />

        {/* Message counts */}
        {(metrics.userTranscriptCount || metrics.aiResponseCount) && (
          <div className="mt-3 pt-2 border-t border-neutral-100 flex items-center gap-4 text-xs text-neutral-500">
            <span>
              <span className="font-medium text-neutral-700">
                {metrics.userTranscriptCount || 0}
              </span>{" "}
              user messages
            </span>
            <span>
              <span className="font-medium text-neutral-700">
                {metrics.aiResponseCount || 0}
              </span>{" "}
              AI responses
            </span>
            {metrics.reconnectCount && metrics.reconnectCount > 0 && (
              <span className="text-orange-500">
                {metrics.reconnectCount} reconnect
                {metrics.reconnectCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tool calls section */}
      {toolCalls.length > 0 && (
        <div className="p-3 max-h-48 overflow-y-auto">
          <ToolCallDisplay
            toolCalls={toolCalls}
            maxVisible={5}
            showArguments={true}
            showResults={true}
          />
        </div>
      )}

      {/* Empty state when no tool calls */}
      {toolCalls.length === 0 && !error && (
        <div className="p-4 text-center text-sm text-neutral-400">
          No active tool calls
        </div>
      )}
    </div>
  );
}

export default VoiceExpandedDrawer;
