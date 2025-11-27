/**
 * Analytics Module - Phase 11: Analytics & Observability
 *
 * Exports all analytics and error monitoring utilities.
 */

// Analytics Provider
export {
  AnalyticsProvider,
  useAnalytics,
  AnalyticsEvents,
  type AnalyticsConfig,
  type AnalyticsEvent,
  type PageView,
} from "./AnalyticsProvider";

// Error Boundary
export {
  ErrorBoundary,
  withErrorBoundary,
  registerErrorHandler,
  useErrorReporting,
  type ErrorContext,
  type ErrorEvent,
  type ErrorReportCallback,
} from "./ErrorBoundary";
