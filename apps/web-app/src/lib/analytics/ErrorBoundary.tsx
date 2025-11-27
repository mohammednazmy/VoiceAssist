/**
 * Error Boundary - Phase 11: Analytics & Observability
 *
 * Catches React errors and reports them to error monitoring service.
 * Includes user feedback collection and graceful degradation.
 */

import React, { Component, ErrorInfo, ReactNode } from "react";

// Error context for rich error reporting
export interface ErrorContext {
  componentStack?: string;
  userId?: string;
  sessionId?: string;
  route?: string;
  additionalData?: Record<string, unknown>;
}

// Error event for external reporting
export interface ErrorEvent {
  error: Error;
  errorInfo?: ErrorInfo;
  context?: ErrorContext;
  timestamp: number;
  fingerprint?: string[];
}

// Error report callback
export type ErrorReportCallback = (event: ErrorEvent) => void;

// Global error handlers
const errorHandlers: ErrorReportCallback[] = [];

export function registerErrorHandler(handler: ErrorReportCallback): () => void {
  errorHandlers.push(handler);
  return () => {
    const index = errorHandlers.indexOf(handler);
    if (index > -1) {
      errorHandlers.splice(index, 1);
    }
  };
}

function reportError(event: ErrorEvent): void {
  errorHandlers.forEach((handler) => {
    try {
      handler(event);
    } catch (e) {
      console.error("Error in error handler:", e);
    }
  });
}

// Generate error fingerprint for grouping
function generateFingerprint(error: Error): string[] {
  const parts: string[] = [error.name, error.message];

  if (error.stack) {
    // Extract first meaningful stack frame
    const lines = error.stack.split("\n");
    const firstFrame = lines.find(
      (line) => line.includes("at ") && !line.includes("node_modules"),
    );
    if (firstFrame) {
      parts.push(firstFrame.trim());
    }
  }

  return parts;
}

// Props for ErrorBoundary component
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDialog?: boolean;
  context?: Partial<ErrorContext>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showFeedback: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      showFeedback: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Report to error monitoring
    const event: ErrorEvent = {
      error,
      errorInfo,
      context: {
        ...this.props.context,
        componentStack: errorInfo.componentStack || undefined,
        route:
          typeof window !== "undefined" ? window.location.pathname : undefined,
      },
      timestamp: Date.now(),
      fingerprint: generateFingerprint(error),
    };

    reportError(event);

    // Console log in development
    if (process.env.NODE_ENV === "development") {
      console.error("ErrorBoundary caught error:", error);
      console.error("Component stack:", errorInfo.componentStack);
    }

    // Call optional onError prop
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, showFeedback: false });
  };

  handleShowFeedback = (): void => {
    this.setState({ showFeedback: true });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback
      if (this.props.fallback) {
        if (typeof this.props.fallback === "function") {
          return this.props.fallback(this.state.error!, this.handleReset);
        }
        return this.props.fallback;
      }

      // Default error UI
      return (
        <DefaultErrorFallback
          error={this.state.error!}
          onReset={this.handleReset}
          showDialog={this.props.showDialog}
          showFeedback={this.state.showFeedback}
          onShowFeedback={this.handleShowFeedback}
        />
      );
    }

    return this.props.children;
  }
}

// Default error fallback component
interface DefaultErrorFallbackProps {
  error: Error;
  onReset: () => void;
  showDialog?: boolean;
  showFeedback: boolean;
  onShowFeedback: () => void;
}

function DefaultErrorFallback({
  error,
  onReset,
  showDialog = true,
  showFeedback,
  onShowFeedback,
}: DefaultErrorFallbackProps) {
  const [feedbackText, setFeedbackText] = React.useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = React.useState(false);

  const handleSubmitFeedback = () => {
    // Report feedback with error context
    reportError({
      error,
      context: {
        additionalData: {
          userFeedback: feedbackText,
          feedbackType: "user_report",
        },
      },
      timestamp: Date.now(),
    });
    setFeedbackSubmitted(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
        {/* Error Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>

        {/* Error Message */}
        <h2 className="text-xl font-semibold text-center text-neutral-900 mb-2">
          Something went wrong
        </h2>
        <p className="text-neutral-600 text-center mb-4">
          We've been notified and are working to fix this issue.
        </p>

        {/* Error Details (collapsible in dev) */}
        {process.env.NODE_ENV === "development" && (
          <details className="mb-4 p-3 bg-neutral-100 rounded text-sm">
            <summary className="cursor-pointer text-neutral-700 font-medium">
              Error Details
            </summary>
            <div className="mt-2 text-red-600 font-mono text-xs overflow-auto max-h-40">
              <p className="font-semibold">
                {error.name}: {error.message}
              </p>
              <pre className="mt-2 whitespace-pre-wrap">{error.stack}</pre>
            </div>
          </details>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={onReset}
            className="w-full px-4 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors font-medium"
          >
            Try Again
          </button>

          <button
            onClick={() => window.location.reload()}
            className="w-full px-4 py-2 bg-neutral-100 text-neutral-700 rounded-md hover:bg-neutral-200 transition-colors font-medium"
          >
            Refresh Page
          </button>

          {showDialog && !showFeedback && !feedbackSubmitted && (
            <button
              onClick={onShowFeedback}
              className="w-full px-4 py-2 text-primary-600 hover:text-primary-700 transition-colors text-sm"
            >
              Report this issue
            </button>
          )}
        </div>

        {/* Feedback Form */}
        {showFeedback && !feedbackSubmitted && (
          <div className="mt-4 p-4 bg-neutral-50 rounded-lg">
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              What were you trying to do?
            </label>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
              rows={3}
              placeholder="Describe what happened..."
            />
            <button
              onClick={handleSubmitFeedback}
              disabled={!feedbackText.trim()}
              className="mt-2 w-full px-4 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              Submit Feedback
            </button>
          </div>
        )}

        {/* Feedback Submitted */}
        {feedbackSubmitted && (
          <div className="mt-4 p-4 bg-green-50 rounded-lg text-center">
            <svg
              className="w-6 h-6 text-green-500 mx-auto mb-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <p className="text-sm text-green-700">
              Thank you! Your feedback helps us improve.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Higher-order component for wrapping components with error boundary
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  options?: Omit<ErrorBoundaryProps, "children">,
): React.FC<P> {
  const WrappedComponent: React.FC<P> = (props) => (
    <ErrorBoundary {...options}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name || "Component"})`;

  return WrappedComponent;
}

// Hook for manual error reporting
export function useErrorReporting() {
  const reportManualError = React.useCallback(
    (error: Error | string, context?: Partial<ErrorContext>) => {
      const errorObj = typeof error === "string" ? new Error(error) : error;

      reportError({
        error: errorObj,
        context: {
          ...context,
          route:
            typeof window !== "undefined"
              ? window.location.pathname
              : undefined,
        },
        timestamp: Date.now(),
        fingerprint: generateFingerprint(errorObj),
      });
    },
    [],
  );

  return { reportError: reportManualError };
}

export default ErrorBoundary;
