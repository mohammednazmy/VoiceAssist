/**
 * VoiceMetricsDisplay Component
 * Shows real-time voice session metrics with color-coded latency indicators
 *
 * Features:
 * - Connection time display
 * - STT (Speech-to-Text) latency with color coding
 * - Response latency with color coding
 * - Session duration
 * - Collapsible panel
 */

import { useState } from "react";

/**
 * Voice session metrics interface
 * Used by both OpenAI Realtime and Thinker/Talker pipelines
 */
export interface VoiceMetrics {
  connectionTimeMs: number | null;
  timeToFirstTranscriptMs?: number | null;
  lastSttLatencyMs: number | null;
  lastResponseLatencyMs: number | null;
  sessionDurationMs?: number | null;
  userTranscriptCount?: number;
  aiResponseCount?: number;
  reconnectCount?: number;
  sessionStartedAt?: number | null;
}

export interface VoiceMetricsDisplayProps {
  metrics: VoiceMetrics;
  isConnected: boolean;
}

/**
 * Get color class based on latency threshold
 * <500ms = green (good), 500-1000ms = yellow (acceptable), >1000ms = red (poor)
 */
function getLatencyColor(latencyMs: number | null | undefined): string {
  if (latencyMs === null || latencyMs === undefined) return "text-neutral-400";
  if (latencyMs < 500) return "text-green-600";
  if (latencyMs < 1000) return "text-yellow-600";
  return "text-red-600";
}

/**
 * Get background color class based on latency threshold
 */
function getLatencyBgColor(latencyMs: number | null | undefined): string {
  if (latencyMs === null || latencyMs === undefined) return "bg-neutral-100";
  if (latencyMs < 500) return "bg-green-50";
  if (latencyMs < 1000) return "bg-yellow-50";
  return "bg-red-50";
}

/**
 * Format milliseconds for display
 */
function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
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

export function VoiceMetricsDisplay({
  metrics,
  isConnected,
}: VoiceMetricsDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Handle case where metrics is undefined (e.g., in tests with incomplete mocks)
  if (!metrics) {
    return null;
  }

  // Don't show anything if not connected and no metrics to show
  const hasAnyMetrics =
    metrics.connectionTimeMs !== null ||
    metrics.lastSttLatencyMs !== null ||
    metrics.lastResponseLatencyMs !== null ||
    metrics.sessionDurationMs !== null;

  if (!isConnected && !hasAnyMetrics) {
    return null;
  }

  return (
    <div
      className="border border-neutral-200 rounded-lg overflow-hidden"
      data-testid="voice-metrics-display"
    >
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full min-h-[44px] px-3 py-2 flex items-center justify-between bg-neutral-50 hover:bg-neutral-100 transition-colors"
        aria-expanded={isExpanded}
        aria-controls="voice-metrics-content"
      >
        <div className="flex items-center space-x-2 min-w-0 flex-shrink">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-4 h-4 text-neutral-500 flex-shrink-0"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
          <span className="text-sm font-medium text-neutral-700 truncate">
            Voice Metrics
          </span>
        </div>
        <div className="flex items-center space-x-3 flex-shrink-0">
          {/* Quick stats preview when collapsed */}
          {!isExpanded && metrics.lastResponseLatencyMs !== null && (
            <span
              className={`text-xs font-medium ${getLatencyColor(metrics.lastResponseLatencyMs)}`}
              aria-label={`Response latency: ${formatMs(metrics.lastResponseLatencyMs)}`}
            >
              {formatMs(metrics.lastResponseLatencyMs)}
            </span>
          )}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className={`w-4 h-4 text-neutral-400 transition-transform flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div id="voice-metrics-content" className="p-3 space-y-3">
          {/* Connection Time */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500">Connection Time</span>
            <span
              className={`text-xs font-mono ${getLatencyColor(metrics.connectionTimeMs)}`}
              data-testid="metric-connection-time"
            >
              {formatMs(metrics.connectionTimeMs)}
            </span>
          </div>

          {/* STT Latency */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1">
              <span className="text-xs text-neutral-500">STT Latency</span>
              <span
                className="text-xs text-neutral-400"
                title="Time from end of speech to transcript"
              >
                ⓘ
              </span>
            </div>
            <div
              className={`px-2 py-0.5 rounded ${getLatencyBgColor(metrics.lastSttLatencyMs)}`}
            >
              <span
                className={`text-xs font-mono ${getLatencyColor(metrics.lastSttLatencyMs)}`}
                data-testid="metric-stt-latency"
              >
                {formatMs(metrics.lastSttLatencyMs)}
              </span>
            </div>
          </div>

          {/* Response Latency */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1">
              <span className="text-xs text-neutral-500">Response Latency</span>
              <span
                className="text-xs text-neutral-400"
                title="Time from end of speech to AI response"
              >
                ⓘ
              </span>
            </div>
            <div
              className={`px-2 py-0.5 rounded ${getLatencyBgColor(metrics.lastResponseLatencyMs)}`}
            >
              <span
                className={`text-xs font-mono ${getLatencyColor(metrics.lastResponseLatencyMs)}`}
                data-testid="metric-response-latency"
              >
                {formatMs(metrics.lastResponseLatencyMs)}
              </span>
            </div>
          </div>

          {/* Time to First Transcript */}
          {metrics.timeToFirstTranscriptMs !== null && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1">
                <span className="text-xs text-neutral-500">
                  First Transcript
                </span>
                <span
                  className="text-xs text-neutral-400"
                  title="Time from connection to first user transcript"
                >
                  ⓘ
                </span>
              </div>
              <span
                className={`text-xs font-mono ${getLatencyColor(metrics.timeToFirstTranscriptMs)}`}
                data-testid="metric-first-transcript"
              >
                {formatMs(metrics.timeToFirstTranscriptMs)}
              </span>
            </div>
          )}

          {/* Session Duration */}
          {metrics.sessionDurationMs !== null && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500">Session Duration</span>
              <span
                className="text-xs font-mono text-neutral-700"
                data-testid="metric-session-duration"
              >
                {formatDuration(metrics.sessionDurationMs)}
              </span>
            </div>
          )}

          {/* Counts */}
          <div className="pt-2 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-xs text-neutral-400">
                <span className="font-medium text-neutral-600">
                  {metrics.userTranscriptCount}
                </span>{" "}
                user messages
              </span>
              <span className="text-xs text-neutral-400">
                <span className="font-medium text-neutral-600">
                  {metrics.aiResponseCount}
                </span>{" "}
                AI responses
              </span>
            </div>
            {(metrics.reconnectCount ?? 0) > 0 && (
              <span className="text-xs text-orange-500">
                {metrics.reconnectCount} reconnect
                {(metrics.reconnectCount ?? 0) > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Latency Legend */}
          <div className="pt-2 border-t border-neutral-100">
            <div
              className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs"
              role="list"
              aria-label="Latency quality indicators"
            >
              <div className="flex items-center space-x-1" role="listitem">
                <span
                  className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"
                  aria-hidden="true"
                />
                <span className="text-neutral-400">
                  <span className="sr-only">Good latency: </span>&lt;500ms
                </span>
              </div>
              <div className="flex items-center space-x-1" role="listitem">
                <span
                  className="w-2 h-2 rounded-full bg-yellow-500 flex-shrink-0"
                  aria-hidden="true"
                />
                <span className="text-neutral-400">
                  <span className="sr-only">Acceptable latency: </span>
                  500-1000ms
                </span>
              </div>
              <div className="flex items-center space-x-1" role="listitem">
                <span
                  className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"
                  aria-hidden="true"
                />
                <span className="text-neutral-400">
                  <span className="sr-only">Poor latency: </span>&gt;1000ms
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
