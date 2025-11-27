/**
 * Feedback Collection Service
 *
 * Handles collecting, storing, and syncing user feedback for continuous
 * improvement of AI responses. Supports offline queuing and background sync.
 *
 * @example
 * ```typescript
 * import { feedbackService } from '@/services/feedback';
 *
 * // Quick feedback
 * await feedbackService.submitQuickFeedback('msg-123', 'conv-456', 'positive');
 *
 * // Detailed feedback
 * await feedbackService.submitDetailedFeedback({
 *   messageId: 'msg-123',
 *   conversationId: 'conv-456',
 *   rating: 'negative',
 *   categories: ['accuracy', 'completeness'],
 *   comments: 'The dosage information was incorrect.',
 * });
 * ```
 */

import {
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
} from "./types";

/**
 * Configuration for the feedback service
 */
interface FeedbackServiceConfig {
  /** API endpoint for feedback submission */
  apiEndpoint: string;
  /** Sync interval in milliseconds */
  syncInterval: number;
  /** Maximum queue size before forced sync */
  maxQueueSize: number;
  /** Maximum retry attempts for failed submissions */
  maxRetries: number;
  /** Enable offline queue */
  enableOfflineQueue: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: FeedbackServiceConfig = {
  apiEndpoint: "/api/feedback",
  syncInterval: 30000, // 30 seconds
  maxQueueSize: 50,
  maxRetries: 3,
  enableOfflineQueue: true,
};

/**
 * Queued feedback item
 */
interface QueuedFeedback {
  id: string;
  feedback: Feedback;
  attempts: number;
  createdAt: number;
  lastAttempt?: number;
}

/**
 * Feedback Service class
 */
class FeedbackService {
  private config: FeedbackServiceConfig;
  private queue: QueuedFeedback[] = [];
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;
  private sessionId: string;
  private userId: string | null = null;
  private isOnline: boolean = true;
  private listeners: Set<(feedback: Feedback) => void> = new Set();

  constructor(config: Partial<FeedbackServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionId = this.generateSessionId();
    this.setupOnlineListener();
    this.loadQueueFromStorage();
    this.startSyncInterval();
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `fb-session-${timestamp}-${random}`;
  }

  /**
   * Generate a unique feedback ID
   */
  private generateFeedbackId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `fb-${timestamp}-${random}`;
  }

  /**
   * Set the current user ID
   */
  setUserId(userId: string | null): void {
    this.userId = userId;
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Setup online/offline listener
   */
  private setupOnlineListener(): void {
    if (typeof window === "undefined") return;

    window.addEventListener("online", () => {
      this.isOnline = true;
      this.syncQueue();
    });

    window.addEventListener("offline", () => {
      this.isOnline = false;
    });

    this.isOnline = navigator.onLine;
  }

  /**
   * Load queued feedback from localStorage
   */
  private loadQueueFromStorage(): void {
    if (typeof localStorage === "undefined") return;

    try {
      const stored = localStorage.getItem("feedback_queue");
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    } catch (error) {
      console.warn(
        "[FeedbackService] Failed to load queue from storage:",
        error,
      );
    }
  }

  /**
   * Save queue to localStorage
   */
  private saveQueueToStorage(): void {
    if (typeof localStorage === "undefined") return;

    try {
      localStorage.setItem("feedback_queue", JSON.stringify(this.queue));
    } catch (error) {
      console.warn("[FeedbackService] Failed to save queue to storage:", error);
    }
  }

  /**
   * Start the sync interval
   */
  private startSyncInterval(): void {
    if (this.syncIntervalId) return;

    this.syncIntervalId = setInterval(() => {
      this.syncQueue();
    }, this.config.syncInterval);
  }

  /**
   * Stop the sync interval
   */
  stopSyncInterval(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  /**
   * Submit quick feedback (thumbs up/down)
   */
  async submitQuickFeedback(
    messageId: string,
    conversationId: string,
    rating: FeedbackRating,
  ): Promise<FeedbackSubmissionResult> {
    const feedback: QuickFeedback = {
      type: "quick",
      messageId,
      conversationId,
      rating,
      timestamp: Date.now(),
      userId: this.userId ?? undefined,
      sessionId: this.sessionId,
    };

    return this.submitFeedback(feedback);
  }

  /**
   * Submit detailed feedback
   */
  async submitDetailedFeedback(data: {
    messageId: string;
    conversationId: string;
    rating: FeedbackRating;
    categories: FeedbackCategory[];
    comments: string;
    suggestedCorrection?: string;
    severity?: FeedbackSeverity;
    allowFollowUp?: boolean;
    contactEmail?: string;
  }): Promise<FeedbackSubmissionResult> {
    const feedback: DetailedFeedback = {
      type: "detailed",
      messageId: data.messageId,
      conversationId: data.conversationId,
      rating: data.rating,
      categories: data.categories,
      comments: data.comments,
      suggestedCorrection: data.suggestedCorrection,
      severity: data.severity,
      timestamp: Date.now(),
      userId: this.userId ?? undefined,
      sessionId: this.sessionId,
      allowFollowUp: data.allowFollowUp ?? false,
      contactEmail: data.contactEmail,
    };

    return this.submitFeedback(feedback);
  }

  /**
   * Submit missing information report
   */
  async submitMissingInfoReport(data: {
    originalQuery: string;
    messageId?: string;
    conversationId: string;
    missingInfo: string;
    expectedSource?: string;
    topic?: string;
  }): Promise<FeedbackSubmissionResult> {
    const feedback: MissingInfoReport = {
      type: "missing_info",
      originalQuery: data.originalQuery,
      messageId: data.messageId,
      conversationId: data.conversationId,
      missingInfo: data.missingInfo,
      expectedSource: data.expectedSource,
      topic: data.topic,
      timestamp: Date.now(),
      userId: this.userId ?? undefined,
      sessionId: this.sessionId,
    };

    return this.submitFeedback(feedback);
  }

  /**
   * Submit correction suggestion
   */
  async submitCorrection(data: {
    messageId: string;
    conversationId: string;
    originalResponse: string;
    suggestedCorrection: string;
    reason: string;
    reference?: string;
    severity: FeedbackSeverity;
  }): Promise<FeedbackSubmissionResult> {
    const feedback: CorrectionSuggestion = {
      type: "correction",
      messageId: data.messageId,
      conversationId: data.conversationId,
      originalResponse: data.originalResponse,
      suggestedCorrection: data.suggestedCorrection,
      reason: data.reason,
      reference: data.reference,
      severity: data.severity,
      timestamp: Date.now(),
      userId: this.userId ?? undefined,
      sessionId: this.sessionId,
    };

    return this.submitFeedback(feedback);
  }

  /**
   * Core feedback submission method
   */
  private async submitFeedback(
    feedback: Feedback,
  ): Promise<FeedbackSubmissionResult> {
    // Notify listeners
    this.notifyListeners(feedback);

    // If offline or queue is preferred, add to queue
    if (!this.isOnline && this.config.enableOfflineQueue) {
      return this.queueFeedback(feedback);
    }

    // Try immediate submission
    try {
      const result = await this.sendFeedback(feedback);
      if (result.success) {
        return result;
      }
    } catch (error) {
      console.warn("[FeedbackService] Immediate submission failed:", error);
    }

    // Fall back to queue if immediate submission fails
    if (this.config.enableOfflineQueue) {
      return this.queueFeedback(feedback);
    }

    return {
      success: false,
      error: "Failed to submit feedback",
    };
  }

  /**
   * Queue feedback for later submission
   */
  private queueFeedback(feedback: Feedback): FeedbackSubmissionResult {
    const queuedItem: QueuedFeedback = {
      id: this.generateFeedbackId(),
      feedback,
      attempts: 0,
      createdAt: Date.now(),
    };

    this.queue.push(queuedItem);
    this.saveQueueToStorage();

    // Force sync if queue is full
    if (this.queue.length >= this.config.maxQueueSize) {
      this.syncQueue();
    }

    return {
      success: true,
      feedbackId: queuedItem.id,
      queued: true,
    };
  }

  /**
   * Send feedback to the API
   */
  private async sendFeedback(
    feedback: Feedback,
  ): Promise<FeedbackSubmissionResult> {
    const response = await fetch(this.config.apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(feedback),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      feedbackId: data.id,
    };
  }

  /**
   * Sync queued feedback to the server
   */
  async syncQueue(): Promise<void> {
    if (!this.isOnline || this.queue.length === 0) return;

    const itemsToSync = [...this.queue];
    const successIds: string[] = [];

    for (const item of itemsToSync) {
      if (item.attempts >= this.config.maxRetries) {
        // Remove items that exceeded max retries
        successIds.push(item.id);
        continue;
      }

      try {
        item.attempts++;
        item.lastAttempt = Date.now();

        await this.sendFeedback(item.feedback);
        successIds.push(item.id);
      } catch (error) {
        console.warn(`[FeedbackService] Sync failed for ${item.id}:`, error);
      }
    }

    // Remove successfully synced items
    this.queue = this.queue.filter((item) => !successIds.includes(item.id));
    this.saveQueueToStorage();
  }

  /**
   * Get the current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Clear the queue (use with caution)
   */
  clearQueue(): void {
    this.queue = [];
    this.saveQueueToStorage();
  }

  /**
   * Add a listener for feedback submissions
   */
  addListener(callback: (feedback: Feedback) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notify all listeners of a feedback submission
   */
  private notifyListeners(feedback: Feedback): void {
    this.listeners.forEach((callback) => {
      try {
        callback(feedback);
      } catch (error) {
        console.error("[FeedbackService] Listener error:", error);
      }
    });
  }

  /**
   * Get feedback statistics from the API
   */
  async getStats(filter?: FeedbackFilter): Promise<FeedbackStats> {
    const params = new URLSearchParams();
    if (filter) {
      if (filter.rating) params.set("rating", filter.rating);
      if (filter.type) params.set("type", filter.type);
      if (filter.dateRange) {
        params.set("startDate", filter.dateRange.start.toString());
        params.set("endDate", filter.dateRange.end.toString());
      }
    }

    const response = await fetch(
      `${this.config.apiEndpoint}/stats?${params.toString()}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch stats: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get feedback trends from the API
   */
  async getTrends(
    period: "hourly" | "daily" | "weekly" | "monthly" = "daily",
    days: number = 30,
  ): Promise<FeedbackTrend> {
    const params = new URLSearchParams({
      period,
      days: days.toString(),
    });

    const response = await fetch(
      `${this.config.apiEndpoint}/trends?${params.toString()}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch trends: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Force immediate sync
   */
  async forceSync(): Promise<void> {
    await this.syncQueue();
  }

  /**
   * Cleanup on destroy
   */
  destroy(): void {
    this.stopSyncInterval();
    this.listeners.clear();
  }
}

/**
 * Singleton instance
 */
export const feedbackService = new FeedbackService();

/**
 * Create a new feedback service instance with custom config
 */
export function createFeedbackService(
  config: Partial<FeedbackServiceConfig>,
): FeedbackService {
  return new FeedbackService(config);
}

// Re-export types
export type {
  Feedback,
  FeedbackRating,
  FeedbackCategory,
  FeedbackSeverity,
  QuickFeedback,
  DetailedFeedback,
  MissingInfoReport,
  CorrectionSuggestion,
  FeedbackSubmissionResult,
  FeedbackStats,
  FeedbackFilter,
  FeedbackTrend,
};
