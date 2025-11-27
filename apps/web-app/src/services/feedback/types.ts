/**
 * Feedback System Types
 *
 * Type definitions for the continuous learning feedback system.
 * Supports answer quality ratings, detailed feedback, and corrections.
 */

/**
 * Rating values for answer quality
 */
export type FeedbackRating = "positive" | "negative" | "neutral";

/**
 * Feedback categories for detailed feedback
 */
export type FeedbackCategory =
  | "accuracy" // Answer was factually incorrect
  | "relevance" // Answer was not relevant to the question
  | "completeness" // Answer was incomplete or missing information
  | "clarity" // Answer was unclear or confusing
  | "outdated" // Information was outdated
  | "helpful" // Answer was particularly helpful
  | "sources" // Issues with cited sources
  | "other"; // Other feedback

/**
 * Severity levels for issues
 */
export type FeedbackSeverity = "low" | "medium" | "high" | "critical";

/**
 * Quick feedback (thumbs up/down)
 */
export interface QuickFeedback {
  /** Type identifier */
  type: "quick";
  /** The message ID being rated */
  messageId: string;
  /** The conversation/session ID */
  conversationId: string;
  /** Rating value */
  rating: FeedbackRating;
  /** Timestamp */
  timestamp: number;
  /** User ID (if authenticated) */
  userId?: string;
  /** Session ID (for anonymous users) */
  sessionId: string;
}

/**
 * Detailed feedback with categories and comments
 */
export interface DetailedFeedback {
  /** Type identifier */
  type: "detailed";
  /** The message ID being rated */
  messageId: string;
  /** The conversation/session ID */
  conversationId: string;
  /** Overall rating */
  rating: FeedbackRating;
  /** Feedback categories */
  categories: FeedbackCategory[];
  /** Detailed comments */
  comments: string;
  /** Suggested correction (if applicable) */
  suggestedCorrection?: string;
  /** Severity of the issue */
  severity?: FeedbackSeverity;
  /** Timestamp */
  timestamp: number;
  /** User ID (if authenticated) */
  userId?: string;
  /** Session ID */
  sessionId: string;
  /** Whether user consents to follow-up */
  allowFollowUp: boolean;
  /** User email (if provided for follow-up) */
  contactEmail?: string;
}

/**
 * Missing information report
 */
export interface MissingInfoReport {
  /** Type identifier */
  type: "missing_info";
  /** The query that wasn't answered well */
  originalQuery: string;
  /** The message ID (if applicable) */
  messageId?: string;
  /** The conversation/session ID */
  conversationId: string;
  /** Description of what information was missing */
  missingInfo: string;
  /** Expected source of the information */
  expectedSource?: string;
  /** Topic/category of the missing info */
  topic?: string;
  /** Timestamp */
  timestamp: number;
  /** User ID (if authenticated) */
  userId?: string;
  /** Session ID */
  sessionId: string;
}

/**
 * Correction suggestion
 */
export interface CorrectionSuggestion {
  /** Type identifier */
  type: "correction";
  /** The message ID being corrected */
  messageId: string;
  /** The conversation/session ID */
  conversationId: string;
  /** Original response text */
  originalResponse: string;
  /** Suggested corrected response */
  suggestedCorrection: string;
  /** Reason for correction */
  reason: string;
  /** Reference/source for the correction */
  reference?: string;
  /** Severity of the error */
  severity: FeedbackSeverity;
  /** Timestamp */
  timestamp: number;
  /** User ID (if authenticated) */
  userId?: string;
  /** Session ID */
  sessionId: string;
}

/**
 * Union type for all feedback types
 */
export type Feedback =
  | QuickFeedback
  | DetailedFeedback
  | MissingInfoReport
  | CorrectionSuggestion;

/**
 * Feedback submission result
 */
export interface FeedbackSubmissionResult {
  /** Whether submission was successful */
  success: boolean;
  /** Server-assigned feedback ID */
  feedbackId?: string;
  /** Error message (if failed) */
  error?: string;
  /** Whether feedback was queued for later sync */
  queued?: boolean;
}

/**
 * Feedback statistics
 */
export interface FeedbackStats {
  /** Total feedback count */
  totalCount: number;
  /** Positive ratings count */
  positiveCount: number;
  /** Negative ratings count */
  negativeCount: number;
  /** Neutral ratings count */
  neutralCount: number;
  /** Satisfaction rate (positive / total) */
  satisfactionRate: number;
  /** Count by category */
  categoryBreakdown: Record<FeedbackCategory, number>;
  /** Count by severity */
  severityBreakdown: Record<FeedbackSeverity, number>;
  /** Time period for stats */
  period: {
    start: number;
    end: number;
  };
}

/**
 * Feedback filter options for querying
 */
export interface FeedbackFilter {
  /** Filter by rating */
  rating?: FeedbackRating;
  /** Filter by categories */
  categories?: FeedbackCategory[];
  /** Filter by severity */
  severity?: FeedbackSeverity;
  /** Filter by type */
  type?: Feedback["type"];
  /** Filter by date range */
  dateRange?: {
    start: number;
    end: number;
  };
  /** Filter by user */
  userId?: string;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Feedback trend data point
 */
export interface FeedbackTrendPoint {
  /** Date/time of the data point */
  timestamp: number;
  /** Total feedback count */
  count: number;
  /** Positive count */
  positive: number;
  /** Negative count */
  negative: number;
  /** Satisfaction rate */
  satisfactionRate: number;
}

/**
 * Feedback trend data
 */
export interface FeedbackTrend {
  /** Trend data points */
  data: FeedbackTrendPoint[];
  /** Aggregation period (hourly, daily, weekly) */
  aggregation: "hourly" | "daily" | "weekly" | "monthly";
  /** Overall trend direction */
  trend: "improving" | "declining" | "stable";
  /** Change from previous period */
  changePercent: number;
}
