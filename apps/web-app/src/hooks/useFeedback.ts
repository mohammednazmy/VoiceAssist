/**
 * Feedback Hook
 *
 * React hook for collecting and managing user feedback.
 *
 * @example
 * ```typescript
 * const {
 *   submitQuickFeedback,
 *   submitDetailedFeedback,
 *   isSubmitting,
 *   lastSubmission,
 * } = useFeedback();
 *
 * // Quick rating
 * await submitQuickFeedback('msg-123', 'conv-456', 'positive');
 *
 * // Detailed feedback
 * await submitDetailedFeedback({
 *   messageId: 'msg-123',
 *   conversationId: 'conv-456',
 *   rating: 'negative',
 *   categories: ['accuracy'],
 *   comments: 'The information was incorrect.',
 * });
 * ```
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  feedbackService,
  type Feedback,
  type FeedbackRating,
  type FeedbackCategory,
  type FeedbackSeverity,
  type FeedbackSubmissionResult,
  type FeedbackStats,
  type FeedbackTrend,
} from "../services/feedback";

/**
 * Options for the feedback hook
 */
export interface UseFeedbackOptions {
  /** User ID for attribution */
  userId?: string;
  /** Callback when feedback is submitted */
  onSubmit?: (feedback: Feedback) => void;
  /** Callback on submission error */
  onError?: (error: Error) => void;
}

/**
 * Return type for the feedback hook
 */
export interface UseFeedbackReturn {
  /** Submit quick feedback (thumbs up/down) */
  submitQuickFeedback: (
    messageId: string,
    conversationId: string,
    rating: FeedbackRating,
  ) => Promise<FeedbackSubmissionResult>;
  /** Submit detailed feedback */
  submitDetailedFeedback: (data: {
    messageId: string;
    conversationId: string;
    rating: FeedbackRating;
    categories: FeedbackCategory[];
    comments: string;
    suggestedCorrection?: string;
    severity?: FeedbackSeverity;
    allowFollowUp?: boolean;
    contactEmail?: string;
  }) => Promise<FeedbackSubmissionResult>;
  /** Submit missing information report */
  submitMissingInfo: (data: {
    originalQuery: string;
    messageId?: string;
    conversationId: string;
    missingInfo: string;
    expectedSource?: string;
    topic?: string;
  }) => Promise<FeedbackSubmissionResult>;
  /** Submit correction suggestion */
  submitCorrection: (data: {
    messageId: string;
    conversationId: string;
    originalResponse: string;
    suggestedCorrection: string;
    reason: string;
    reference?: string;
    severity: FeedbackSeverity;
  }) => Promise<FeedbackSubmissionResult>;
  /** Whether submission is in progress */
  isSubmitting: boolean;
  /** Last submission result */
  lastSubmission: FeedbackSubmissionResult | null;
  /** Queue size (pending submissions) */
  queueSize: number;
  /** Force sync queued feedback */
  syncQueue: () => Promise<void>;
  /** Get the current session ID */
  sessionId: string;
}

/**
 * Feedback Hook
 */
export function useFeedback(
  options: UseFeedbackOptions = {},
): UseFeedbackReturn {
  const { userId, onSubmit, onError } = options;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmission, setLastSubmission] =
    useState<FeedbackSubmissionResult | null>(null);
  const [queueSize, setQueueSize] = useState(feedbackService.getQueueSize());

  const onSubmitRef = useRef(onSubmit);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onSubmitRef.current = onSubmit;
    onErrorRef.current = onError;
  }, [onSubmit, onError]);

  // Update user ID when it changes
  useEffect(() => {
    feedbackService.setUserId(userId ?? null);
  }, [userId]);

  // Listen for feedback submissions
  useEffect(() => {
    const unsubscribe = feedbackService.addListener((feedback) => {
      setQueueSize(feedbackService.getQueueSize());
      onSubmitRef.current?.(feedback);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Submit quick feedback
  const submitQuickFeedback = useCallback(
    async (
      messageId: string,
      conversationId: string,
      rating: FeedbackRating,
    ): Promise<FeedbackSubmissionResult> => {
      setIsSubmitting(true);
      try {
        const result = await feedbackService.submitQuickFeedback(
          messageId,
          conversationId,
          rating,
        );
        setLastSubmission(result);
        setQueueSize(feedbackService.getQueueSize());
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        onErrorRef.current?.(err);
        const result: FeedbackSubmissionResult = {
          success: false,
          error: err.message,
        };
        setLastSubmission(result);
        return result;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  // Submit detailed feedback
  const submitDetailedFeedback = useCallback(
    async (data: {
      messageId: string;
      conversationId: string;
      rating: FeedbackRating;
      categories: FeedbackCategory[];
      comments: string;
      suggestedCorrection?: string;
      severity?: FeedbackSeverity;
      allowFollowUp?: boolean;
      contactEmail?: string;
    }): Promise<FeedbackSubmissionResult> => {
      setIsSubmitting(true);
      try {
        const result = await feedbackService.submitDetailedFeedback(data);
        setLastSubmission(result);
        setQueueSize(feedbackService.getQueueSize());
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        onErrorRef.current?.(err);
        const result: FeedbackSubmissionResult = {
          success: false,
          error: err.message,
        };
        setLastSubmission(result);
        return result;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  // Submit missing information report
  const submitMissingInfo = useCallback(
    async (data: {
      originalQuery: string;
      messageId?: string;
      conversationId: string;
      missingInfo: string;
      expectedSource?: string;
      topic?: string;
    }): Promise<FeedbackSubmissionResult> => {
      setIsSubmitting(true);
      try {
        const result = await feedbackService.submitMissingInfoReport(data);
        setLastSubmission(result);
        setQueueSize(feedbackService.getQueueSize());
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        onErrorRef.current?.(err);
        const result: FeedbackSubmissionResult = {
          success: false,
          error: err.message,
        };
        setLastSubmission(result);
        return result;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  // Submit correction
  const submitCorrection = useCallback(
    async (data: {
      messageId: string;
      conversationId: string;
      originalResponse: string;
      suggestedCorrection: string;
      reason: string;
      reference?: string;
      severity: FeedbackSeverity;
    }): Promise<FeedbackSubmissionResult> => {
      setIsSubmitting(true);
      try {
        const result = await feedbackService.submitCorrection(data);
        setLastSubmission(result);
        setQueueSize(feedbackService.getQueueSize());
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        onErrorRef.current?.(err);
        const result: FeedbackSubmissionResult = {
          success: false,
          error: err.message,
        };
        setLastSubmission(result);
        return result;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  // Sync queue
  const syncQueue = useCallback(async (): Promise<void> => {
    await feedbackService.forceSync();
    setQueueSize(feedbackService.getQueueSize());
  }, []);

  return {
    submitQuickFeedback,
    submitDetailedFeedback,
    submitMissingInfo,
    submitCorrection,
    isSubmitting,
    lastSubmission,
    queueSize,
    syncQueue,
    sessionId: feedbackService.getSessionId(),
  };
}

/**
 * Hook for accessing feedback statistics
 */
export function useFeedbackStats(refreshInterval?: number) {
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [trend, setTrend] = useState<FeedbackTrend | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [statsData, trendData] = await Promise.all([
        feedbackService.getStats(),
        feedbackService.getTrends("daily", 30),
      ]);
      setStats(statsData);
      setTrend(trendData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();

    if (refreshInterval) {
      const intervalId = setInterval(fetchStats, refreshInterval);
      return () => clearInterval(intervalId);
    }
  }, [fetchStats, refreshInterval]);

  return {
    stats,
    trend,
    isLoading,
    error,
    refresh: fetchStats,
  };
}

/**
 * Hook for tracking message ratings
 */
export function useMessageRating(messageId: string, conversationId: string) {
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { submitQuickFeedback } = useFeedback();

  const rate = useCallback(
    async (newRating: FeedbackRating) => {
      setIsSubmitting(true);
      try {
        const result = await submitQuickFeedback(
          messageId,
          conversationId,
          newRating,
        );
        if (result.success) {
          setRating(newRating);
        }
        return result;
      } finally {
        setIsSubmitting(false);
      }
    },
    [messageId, conversationId, submitQuickFeedback],
  );

  return {
    rating,
    rate,
    isSubmitting,
    hasRated: rating !== null,
  };
}
