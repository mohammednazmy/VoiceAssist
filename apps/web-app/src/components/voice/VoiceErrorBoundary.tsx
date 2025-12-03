/**
 * VoiceErrorBoundary Component
 *
 * React error boundary specifically for voice features.
 * Catches errors in voice components, reports to Sentry,
 * cleans up voice resources, and provides recovery options.
 *
 * Features:
 * - Sentry error reporting with voice context
 * - Automatic voice resource cleanup (AudioContext, MediaStream)
 * - Retry and reload recovery options
 * - Minimal/detailed fallback UI modes
 *
 * Phase: Voice Feature Hardening
 */

import { Component, ErrorInfo, ReactNode } from "react";
import { captureVoiceError, addBreadcrumb } from "../../lib/sentry";
import { voiceLog } from "../../lib/logger";

// ============================================================================
// Types
// ============================================================================

export interface VoiceErrorBoundaryProps {
  children: ReactNode;
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Called when user clicks retry */
  onRetry?: () => void;
  /** Fallback UI mode or custom component */
  fallback?: "minimal" | "detailed" | ReactNode;
  /** Optional context for error reporting */
  context?: {
    conversationId?: string;
    voiceStatus?: string;
  };
}

interface VoiceErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  sentryEventId: string | null;
}

// ============================================================================
// Component
// ============================================================================

export class VoiceErrorBoundary extends Component<
  VoiceErrorBoundaryProps,
  VoiceErrorBoundaryState
> {
  state: VoiceErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    sentryEventId: null,
  };

  static getDerivedStateFromError(
    error: Error,
  ): Partial<VoiceErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    voiceLog.error("[VoiceErrorBoundary] Caught error:", error);
    voiceLog.error(
      "[VoiceErrorBoundary] Component stack:",
      errorInfo.componentStack,
    );

    // Add breadcrumb for context
    addBreadcrumb("voice.error_boundary", "Voice component error caught", {
      errorName: error.name,
      errorMessage: error.message,
    });

    // Report to Sentry
    const eventId = captureVoiceError(error, {
      status: this.props.context?.voiceStatus || "error_boundary",
      conversationId: this.props.context?.conversationId,
      breadcrumb: "voice_error_boundary_catch",
    });

    // Clean up voice resources
    this.cleanupVoiceResources();

    // Update state
    this.setState({
      errorInfo,
      sentryEventId: eventId || null,
    });

    // Notify parent
    this.props.onError?.(error, errorInfo);
  }

  /**
   * Clean up voice-related resources to prevent leaks
   */
  cleanupVoiceResources = (): void => {
    voiceLog.debug("[VoiceErrorBoundary] Cleaning up voice resources");
    const cleanedResources: string[] = [];

    try {
      // Stop all active media tracks
      if (navigator.mediaDevices?.getUserMedia) {
        // We can't directly access existing streams, but we can try to stop
        // any tracks that might be stored globally
        const globalAudioContext = (
          window as unknown as { __voiceAudioContext?: AudioContext }
        ).__voiceAudioContext;
        if (globalAudioContext) {
          globalAudioContext.close().catch(() => {});
          delete (window as unknown as { __voiceAudioContext?: AudioContext })
            .__voiceAudioContext;
          cleanedResources.push("globalAudioContext");
        }
      }

      // Clear any voice-related global state
      const globalVoiceStream = (
        window as unknown as { __voiceMediaStream?: MediaStream }
      ).__voiceMediaStream;
      if (globalVoiceStream) {
        globalVoiceStream.getTracks().forEach((track) => {
          track.stop();
        });
        delete (window as unknown as { __voiceMediaStream?: MediaStream })
          .__voiceMediaStream;
        cleanedResources.push("globalMediaStream");
      }
    } catch (err) {
      voiceLog.warn("[VoiceErrorBoundary] Error during cleanup:", err);
    }

    if (cleanedResources.length > 0) {
      voiceLog.debug(
        `[VoiceErrorBoundary] Cleaned: ${cleanedResources.join(", ")}`,
      );
    }
  };

  /**
   * Handle retry - reset state and optionally call parent callback
   */
  handleRetry = (): void => {
    voiceLog.debug("[VoiceErrorBoundary] Retrying...");
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      sentryEventId: null,
    });
    this.props.onRetry?.();
  };

  /**
   * Handle reload page
   */
  handleReload = (): void => {
    window.location.reload();
  };

  /**
   * Render minimal fallback UI
   */
  renderMinimalFallback(): ReactNode {
    return (
      <div
        className="flex items-center justify-between gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800"
        role="alert"
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-red-500 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span className="text-sm text-red-700 dark:text-red-300">
            Voice mode unavailable
          </span>
        </div>
        <button
          onClick={this.handleRetry}
          className="px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-800/50 hover:bg-red-200 dark:hover:bg-red-800 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          Retry
        </button>
      </div>
    );
  }

  /**
   * Render detailed fallback UI with more information
   */
  renderDetailedFallback(): ReactNode {
    const { error, sentryEventId } = this.state;

    return (
      <div
        className="p-6 bg-slate-50 dark:bg-slate-900 rounded-lg border border-red-200 dark:border-red-800"
        role="alert"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <svg
              className="w-6 h-6 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
              Voice Mode Error
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Something went wrong with voice features. This has been
              automatically reported.
            </p>

            {error && (
              <div className="mb-4">
                <pre className="p-3 bg-slate-100 dark:bg-slate-800 rounded-md text-xs text-red-600 dark:text-red-400 overflow-auto max-h-24">
                  {error.message}
                </pre>
              </div>
            )}

            {sentryEventId && (
              <p className="text-xs text-slate-500 dark:text-slate-500 mb-4">
                Error ID: {sentryEventId}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const { fallback } = this.props;

      // Custom fallback component
      if (fallback && typeof fallback !== "string") {
        return fallback;
      }

      // Minimal fallback
      if (fallback === "minimal") {
        return this.renderMinimalFallback();
      }

      // Default to detailed fallback
      return this.renderDetailedFallback();
    }

    return this.props.children;
  }
}

export default VoiceErrorBoundary;
