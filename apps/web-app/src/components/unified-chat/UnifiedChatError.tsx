/**
 * Unified Chat Error Display
 *
 * Error state component for the unified chat interface.
 * Extracted from UnifiedChatContainer.tsx for modularity.
 */

import { AlertCircle } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export type ChatErrorType =
  | "not-found"
  | "failed-create"
  | "failed-load"
  | "websocket"
  | null;

export interface ErrorDisplayProps {
  type: ChatErrorType;
  message: string | null;
  onRetry?: () => void;
  onGoHome?: () => void;
}

// ============================================================================
// Error Display Component
// ============================================================================

export function ErrorDisplay({
  type,
  message,
  onRetry,
  onGoHome,
}: ErrorDisplayProps) {
  const errorConfig = {
    "not-found": {
      title: "Conversation not found",
      description:
        "The conversation you're looking for doesn't exist or has been deleted.",
      showRetry: false,
    },
    "failed-create": {
      title: "Failed to create conversation",
      description:
        message || "Unable to start a new conversation. Please try again.",
      showRetry: true,
    },
    "failed-load": {
      title: "Failed to load conversation",
      description:
        message || "Unable to load the conversation. Please try again.",
      showRetry: true,
    },
    websocket: {
      title: "Connection error",
      description:
        message || "Lost connection to the server. Attempting to reconnect...",
      showRetry: true,
    },
  };

  const config = type ? errorConfig[type] : null;
  if (!config) return null;

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-md px-4">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-error-100 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-error-600" />
        </div>
        <h3 className="text-lg font-semibold text-neutral-900 mb-2">
          {config.title}
        </h3>
        <p className="text-neutral-600 mb-4">{config.description}</p>
        <div className="flex items-center justify-center gap-3">
          {config.showRetry && onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Try Again
            </button>
          )}
          {onGoHome && (
            <button
              onClick={onGoHome}
              className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors"
            >
              Go Home
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ErrorDisplay;
