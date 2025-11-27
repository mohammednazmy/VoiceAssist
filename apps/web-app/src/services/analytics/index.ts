/**
 * Client-Side Analytics Service
 *
 * Provides comprehensive frontend telemetry and analytics tracking.
 */

export {
  analyticsService,
  createAnalyticsService,
  type AnalyticsEvent,
  type AnalyticsEventType,
  type WebVitalMetric,
  type WebVitalName,
  type WebVitalRating,
  type PerformanceTiming,
  type ResourceTiming,
  type UserSession,
  type AnalyticsSummary,
  type AnalyticsConfig,
  type UserFlow,
  type FlowStep,
} from "./AnalyticsService";

export type { ErrorEvent, PageViewEvent } from "./types";
