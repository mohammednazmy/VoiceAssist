/**
 * Client-Side Analytics Types
 *
 * Type definitions for frontend telemetry and analytics tracking.
 * Supports Core Web Vitals, custom events, and user flow analysis.
 */

/**
 * Core Web Vitals metric names
 */
export type WebVitalName = "LCP" | "FID" | "CLS" | "TTFB" | "FCP" | "INP";

/**
 * Web Vital rating
 */
export type WebVitalRating = "good" | "needs-improvement" | "poor";

/**
 * Core Web Vital metric
 */
export interface WebVitalMetric {
  /** Metric name */
  name: WebVitalName;
  /** Metric value */
  value: number;
  /** Rating (good, needs-improvement, poor) */
  rating: WebVitalRating;
  /** Delta from previous value */
  delta?: number;
  /** Timestamp */
  timestamp: number;
  /** Page URL */
  url: string;
  /** Navigation type */
  navigationType?: string;
}

/**
 * Custom event types
 */
export type AnalyticsEventType =
  | "page_view"
  | "button_click"
  | "form_submit"
  | "search"
  | "navigation"
  | "error"
  | "feature_usage"
  | "voice_interaction"
  | "chat_message"
  | "file_action"
  | "custom";

/**
 * Analytics event
 */
export interface AnalyticsEvent {
  /** Event type */
  type: AnalyticsEventType;
  /** Event name/action */
  name: string;
  /** Event category */
  category?: string;
  /** Event label */
  label?: string;
  /** Numeric value */
  value?: number;
  /** Event timestamp */
  timestamp: number;
  /** Session ID */
  sessionId: string;
  /** User ID (if authenticated) */
  userId?: string;
  /** Page URL */
  url: string;
  /** Additional properties */
  properties?: Record<string, unknown>;
}

/**
 * Page view event
 */
export interface PageViewEvent extends AnalyticsEvent {
  type: "page_view";
  properties: {
    /** Page path */
    path: string;
    /** Page title */
    title: string;
    /** Referrer URL */
    referrer?: string;
    /** Time on previous page (ms) */
    timeOnPreviousPage?: number;
  };
}

/**
 * Error event
 */
export interface ErrorEvent extends AnalyticsEvent {
  type: "error";
  properties: {
    /** Error message */
    message: string;
    /** Error type/name */
    errorType: string;
    /** Stack trace (truncated) */
    stack?: string;
    /** Component where error occurred */
    component?: string;
    /** Error severity */
    severity: "low" | "medium" | "high" | "critical";
    /** Whether error was handled */
    handled: boolean;
  };
}

/**
 * Performance timing
 */
export interface PerformanceTiming {
  /** Timing name */
  name: string;
  /** Start time (relative to navigation start) */
  startTime: number;
  /** Duration in milliseconds */
  duration: number;
  /** Timing type */
  type: "resource" | "mark" | "measure" | "navigation" | "paint";
  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Resource timing (API calls, assets)
 */
export interface ResourceTiming {
  /** Resource URL */
  url: string;
  /** Resource type */
  type: "fetch" | "xhr" | "script" | "css" | "image" | "font" | "other";
  /** Response time (ms) */
  duration: number;
  /** Size in bytes */
  size?: number;
  /** HTTP status code */
  status?: number;
  /** Whether request was cached */
  cached: boolean;
  /** Timestamp */
  timestamp: number;
}

/**
 * User session data
 */
export interface UserSession {
  /** Session ID */
  id: string;
  /** Session start time */
  startTime: number;
  /** Last activity time */
  lastActivityTime: number;
  /** User ID (if authenticated) */
  userId?: string;
  /** Device info */
  device: {
    type: "mobile" | "tablet" | "desktop";
    browser: string;
    os: string;
    screenWidth: number;
    screenHeight: number;
  };
  /** Location info */
  location?: {
    timezone: string;
    language: string;
    country?: string;
  };
  /** Engagement metrics */
  engagement: {
    pageViews: number;
    events: number;
    totalTime: number;
  };
}

/**
 * User flow step
 */
export interface FlowStep {
  /** Step name */
  name: string;
  /** Page/component where step occurred */
  location: string;
  /** Time spent on step (ms) */
  duration: number;
  /** Whether step was completed */
  completed: boolean;
  /** Timestamp */
  timestamp: number;
}

/**
 * User flow (funnel tracking)
 */
export interface UserFlow {
  /** Flow name */
  name: string;
  /** Session ID */
  sessionId: string;
  /** Flow steps */
  steps: FlowStep[];
  /** Whether flow was completed */
  completed: boolean;
  /** Total duration */
  totalDuration: number;
  /** Drop-off step (if not completed) */
  dropOffStep?: string;
}

/**
 * Analytics summary for dashboard
 */
export interface AnalyticsSummary {
  /** Time period */
  period: {
    start: number;
    end: number;
  };
  /** Total sessions */
  sessions: number;
  /** Unique users */
  uniqueUsers: number;
  /** Total page views */
  pageViews: number;
  /** Average session duration (ms) */
  avgSessionDuration: number;
  /** Bounce rate (%) */
  bounceRate: number;
  /** Error rate (%) */
  errorRate: number;
  /** Core Web Vitals averages */
  webVitals: {
    LCP: { value: number; rating: WebVitalRating };
    FID: { value: number; rating: WebVitalRating };
    CLS: { value: number; rating: WebVitalRating };
  };
  /** Top pages by views */
  topPages: { path: string; views: number }[];
  /** Top events */
  topEvents: { name: string; count: number }[];
}

/**
 * Analytics configuration
 */
export interface AnalyticsConfig {
  /** API endpoint for sending analytics */
  apiEndpoint: string;
  /** Batch size for sending events */
  batchSize: number;
  /** Batch interval in milliseconds */
  batchInterval: number;
  /** Enable debug logging */
  debug: boolean;
  /** Sampling rate (0-1) */
  samplingRate: number;
  /** Enable Core Web Vitals tracking */
  trackWebVitals: boolean;
  /** Enable error tracking */
  trackErrors: boolean;
  /** Enable resource timing */
  trackResources: boolean;
  /** Anonymize user data */
  anonymize: boolean;
}
