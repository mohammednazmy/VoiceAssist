/**
 * VoiceBargeInIndicator
 * Visual indicator shown when user interrupts AI speech (barge-in)
 *
 * Features:
 * - Animated appearance on barge-in
 * - Shows interrupted content preview
 * - Auto-dismiss after timeout
 * - Can be manually dismissed
 */

import { useEffect, useState } from "react";

export interface BargeInEvent {
  /** Unique identifier for the barge-in event */
  id: string;
  /** Timestamp when barge-in occurred */
  timestamp: number;
  /** Content that was interrupted (if available) */
  interruptedContent?: string;
  /** How much of the response was completed (0-100) */
  completionPercentage?: number;
}

export interface VoiceBargeInIndicatorProps {
  /** Current barge-in event to display */
  event: BargeInEvent | null;
  /** Called when indicator is dismissed */
  onDismiss?: () => void;
  /** Auto-dismiss after this many milliseconds (default: 3000) */
  autoDismissMs?: number;
  /** Maximum characters to show in interrupted content preview */
  maxPreviewLength?: number;
}

export function VoiceBargeInIndicator({
  event,
  onDismiss,
  autoDismissMs = 3000,
  maxPreviewLength = 100,
}: VoiceBargeInIndicatorProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  useEffect(() => {
    if (event) {
      // Reset animation state and show
      setIsAnimatingOut(false);
      setIsVisible(true);

      // Auto-dismiss after timeout
      const dismissTimer = setTimeout(() => {
        handleDismiss();
      }, autoDismissMs);

      return () => {
        clearTimeout(dismissTimer);
      };
    } else {
      setIsVisible(false);
    }
  }, [event, autoDismissMs]);

  const handleDismiss = () => {
    setIsAnimatingOut(true);
    // Wait for animation to complete before fully hiding
    setTimeout(() => {
      setIsVisible(false);
      setIsAnimatingOut(false);
      onDismiss?.();
    }, 200);
  };

  if (!event || !isVisible) {
    return null;
  }

  // Truncate interrupted content if too long
  const truncatedContent =
    event.interruptedContent &&
    event.interruptedContent.length > maxPreviewLength
      ? event.interruptedContent.substring(0, maxPreviewLength) + "..."
      : event.interruptedContent;

  return (
    <div
      className={`
        fixed bottom-24 left-1/2 -translate-x-1/2 z-50
        bg-amber-50 border-2 border-amber-400 rounded-lg shadow-lg
        px-4 py-3 max-w-md w-[calc(100%-2rem)]
        transition-all duration-200
        ${isAnimatingOut ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"}
      `}
      role="status"
      aria-live="polite"
      data-testid="voice-barge-in-indicator"
    >
      <div className="flex items-start gap-3">
        {/* Barge-in icon */}
        <div className="flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5 text-amber-700"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z"
              />
            </svg>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-900">
            Response interrupted
          </p>

          {truncatedContent && (
            <p
              className="mt-1 text-xs text-amber-700 line-clamp-2"
              data-testid="interrupted-content-preview"
            >
              "{truncatedContent}"
            </p>
          )}

          {event.completionPercentage !== undefined && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-amber-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-300"
                  style={{ width: `${event.completionPercentage}%` }}
                  role="progressbar"
                  aria-valuenow={event.completionPercentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Response completion before interruption"
                  data-testid="completion-progress"
                />
              </div>
              <span className="text-xs text-amber-600 font-medium whitespace-nowrap">
                {Math.round(event.completionPercentage)}% complete
              </span>
            </div>
          )}
        </div>

        {/* Dismiss button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="flex-shrink-0 text-amber-500 hover:text-amber-700 transition-colors"
          aria-label="Dismiss notification"
          data-testid="barge-in-dismiss"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-5 h-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default VoiceBargeInIndicator;
