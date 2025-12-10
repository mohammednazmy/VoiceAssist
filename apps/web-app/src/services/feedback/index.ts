/**
 * Feedback Collection Service
 *
 * Provides user feedback collection for continuous AI improvement.
 */

export {
  feedbackService,
  createFeedbackService,
  type Feedback,
  type FeedbackRating,
  type FeedbackCategory,
  type FeedbackSeverity,
  type QuickFeedback,
  type DetailedFeedback,
  type MissingInfoReport,
  type CorrectionSuggestion,
  type FeedbackSubmissionResult,
  type FeedbackStats,
  type FeedbackFilter,
  type FeedbackTrend,
} from "./FeedbackService";

export type { FeedbackTrendPoint } from "./types";
