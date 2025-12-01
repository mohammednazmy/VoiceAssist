/**
 * ToolCallDisplay Component
 *
 * Displays real-time tool call status during Thinker/Talker voice sessions.
 * Shows tool name, arguments, status, and results as they execute.
 *
 * Phase: Thinker/Talker Voice Pipeline Migration
 */

import { useEffect, useState } from "react";
import type { TTToolCall } from "../../hooks/useThinkerTalkerSession";

// ============================================================================
// Types
// ============================================================================

export interface ToolCallDisplayProps {
  /** Array of tool calls to display */
  toolCalls: TTToolCall[];
  /** Maximum number of tool calls to show (older ones collapse) */
  maxVisible?: number;
  /** Whether to show tool arguments */
  showArguments?: boolean;
  /** Whether to show tool results */
  showResults?: boolean;
  /** Custom class name */
  className?: string;
}

// ============================================================================
// Helper Components
// ============================================================================

/**
 * Status indicator with animated states
 */
function StatusIndicator({ status }: { status: TTToolCall["status"] }) {
  const statusConfig = {
    pending: {
      color: "bg-neutral-400",
      pulse: false,
      label: "Pending",
    },
    running: {
      color: "bg-blue-500",
      pulse: true,
      label: "Running",
    },
    completed: {
      color: "bg-green-500",
      pulse: false,
      label: "Completed",
    },
    failed: {
      color: "bg-red-500",
      pulse: false,
      label: "Failed",
    },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-2 h-2 rounded-full ${config.color} ${config.pulse ? "animate-pulse" : ""}`}
        aria-hidden="true"
      />
      <span className="text-xs text-neutral-500">{config.label}</span>
    </div>
  );
}

/**
 * Tool icon based on tool name
 */
function ToolIcon({ toolName }: { toolName: string }) {
  // Map common tool names to icons
  const iconMap: Record<string, string> = {
    search: "🔍",
    retrieve: "📄",
    query: "❓",
    calculate: "🧮",
    web_search: "🌐",
    code_interpreter: "💻",
    file_search: "📁",
    knowledge_base: "📚",
    kb_search: "📚",
    kb_read: "📖",
    calendar: "📅",
    email: "📧",
    default: "⚙️",
  };

  const icon =
    iconMap[toolName.toLowerCase()] ||
    Object.entries(iconMap).find(([key]) =>
      toolName.toLowerCase().includes(key),
    )?.[1] ||
    iconMap.default;

  return (
    <span className="text-lg" role="img" aria-label={toolName}>
      {icon}
    </span>
  );
}

/**
 * Format tool name for display
 */
function formatToolName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Truncate long strings for display
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Format tool arguments for display
 */
function formatArguments(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return "No arguments";

  return entries
    .map(([key, value]) => {
      const displayValue =
        typeof value === "string" ? truncate(value, 50) : JSON.stringify(value);
      return `${key}: ${displayValue}`;
    })
    .join(", ");
}

/**
 * Single tool call item
 */
function ToolCallItem({
  toolCall,
  showArguments,
  showResults,
  isExpanded,
  onToggle,
}: {
  toolCall: TTToolCall;
  showArguments: boolean;
  showResults: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasDetails =
    (showArguments && Object.keys(toolCall.arguments).length > 0) ||
    (showResults && toolCall.result !== undefined);

  return (
    <div
      className={`
        rounded-lg border transition-all duration-200
        ${toolCall.status === "running" ? "border-blue-300 bg-blue-50" : "border-neutral-200 bg-white"}
        ${toolCall.status === "failed" ? "border-red-300 bg-red-50" : ""}
      `}
      data-testid={`tool-call-${toolCall.id}`}
    >
      {/* Header */}
      <button
        className="w-full flex items-center justify-between p-3 text-left"
        onClick={onToggle}
        disabled={!hasDetails}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <ToolIcon toolName={toolCall.name} />
          <span className="font-medium text-sm text-neutral-800">
            {formatToolName(toolCall.name)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StatusIndicator status={toolCall.status} />
          {hasDetails && (
            <svg
              className={`w-4 h-4 text-neutral-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          )}
        </div>
      </button>

      {/* Expanded details */}
      {isExpanded && hasDetails && (
        <div className="px-3 pb-3 pt-0 border-t border-neutral-100">
          {showArguments && Object.keys(toolCall.arguments).length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-medium text-neutral-500 mb-1">
                Arguments
              </div>
              <div className="text-xs text-neutral-600 bg-neutral-50 rounded p-2 font-mono overflow-x-auto">
                {formatArguments(toolCall.arguments)}
              </div>
            </div>
          )}

          {showResults && toolCall.result !== undefined && (
            <div className="mt-2">
              <div className="text-xs font-medium text-neutral-500 mb-1">
                Result
              </div>
              <div className="text-xs text-neutral-600 bg-neutral-50 rounded p-2 font-mono overflow-x-auto max-h-32 overflow-y-auto">
                {typeof toolCall.result === "string"
                  ? truncate(toolCall.result, 200)
                  : JSON.stringify(toolCall.result, null, 2)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ToolCallDisplay({
  toolCalls,
  maxVisible = 3,
  showArguments = true,
  showResults = true,
  className = "",
}: ToolCallDisplayProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  // Auto-expand running tool calls
  useEffect(() => {
    const runningIds = toolCalls
      .filter((tc) => tc.status === "running")
      .map((tc) => tc.id);

    if (runningIds.length > 0) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        runningIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [toolCalls]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (toolCalls.length === 0) {
    return null;
  }

  // Sort by status (running first, then pending, then completed/failed)
  const sortedToolCalls = [...toolCalls].sort((a, b) => {
    const statusOrder = { running: 0, pending: 1, completed: 2, failed: 3 };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  const visibleToolCalls = showAll
    ? sortedToolCalls
    : sortedToolCalls.slice(0, maxVisible);
  const hiddenCount = sortedToolCalls.length - visibleToolCalls.length;

  return (
    <div
      className={`space-y-2 ${className}`}
      data-testid="tool-call-display"
      role="region"
      aria-label="Tool calls in progress"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
          Tool Calls ({toolCalls.length})
        </h4>
        {toolCalls.some((tc) => tc.status === "running") && (
          <span className="text-xs text-blue-600 animate-pulse">
            Processing...
          </span>
        )}
      </div>

      {/* Tool call list */}
      <div className="space-y-2">
        {visibleToolCalls.map((toolCall) => (
          <ToolCallItem
            key={toolCall.id}
            toolCall={toolCall}
            showArguments={showArguments}
            showResults={showResults}
            isExpanded={expandedIds.has(toolCall.id)}
            onToggle={() => toggleExpanded(toolCall.id)}
          />
        ))}
      </div>

      {/* Show more/less button */}
      {sortedToolCalls.length > maxVisible && (
        <button
          className="w-full text-center text-xs text-blue-600 hover:text-blue-700 py-1"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll
            ? "Show less"
            : `Show ${hiddenCount} more tool call${hiddenCount > 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}

export default ToolCallDisplay;
