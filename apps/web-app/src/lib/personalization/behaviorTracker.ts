/**
 * Behavior Tracker
 *
 * Tracks user barge-in patterns and behaviors to improve
 * personalization over time.
 *
 * Phase 8: Adaptive Personalization
 */

import type { BargeInType, BargeInEvent, BehaviorStats } from "./types";
import { EMPTY_BEHAVIOR_STATS } from "./types";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for behavior tracker
 */
export interface BehaviorTrackerConfig {
  /** Maximum events to keep in history */
  maxHistorySize: number;

  /** Events older than this are pruned (ms) */
  eventTTL: number;

  /** Minimum events needed for pattern detection */
  minEventsForPatterns: number;

  /** Time window for pattern analysis (ms) */
  patternWindow: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: BehaviorTrackerConfig = {
  maxHistorySize: 500,
  eventTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
  minEventsForPatterns: 20,
  patternWindow: 60 * 60 * 1000, // 1 hour
};

/**
 * Detected pattern
 */
export interface DetectedPattern {
  type:
    | "frequent_backchannel"
    | "rapid_interruption"
    | "time_based"
    | "context_based";
  confidence: number;
  details: Record<string, unknown>;
}

// ============================================================================
// Behavior Tracker
// ============================================================================

/**
 * Tracks and analyzes user barge-in behaviors
 */
export class BehaviorTracker {
  private config: BehaviorTrackerConfig;

  /** Event history */
  private eventHistory: BargeInEvent[] = [];

  /** Aggregated stats */
  private stats: BehaviorStats;

  /** Session tracking */
  private sessionStartTime: number | null = null;
  private sessionDurations: number[] = [];

  /** Storage key for persistence */
  private readonly storageKey: string;

  constructor(
    userId: string = "anonymous",
    config: Partial<BehaviorTrackerConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.storageKey = `voiceassist_behavior_${userId}`;
    this.stats = this.cloneStats(EMPTY_BEHAVIOR_STATS);

    // Load persisted data
    this.loadFromStorage();
  }

  // ==========================================================================
  // Event Recording
  // ==========================================================================

  /**
   * Record a barge-in event
   */
  recordEvent(
    type: BargeInType,
    duration: number,
    vadConfidence: number,
    options: {
      transcript?: string;
      wasCorrect?: boolean;
      aiWasSpeaking?: boolean;
      contextType?: BargeInEvent["contextType"];
    } = {},
  ): BargeInEvent {
    const event: BargeInEvent = {
      id: this.generateEventId(),
      timestamp: Date.now(),
      type,
      duration,
      vadConfidence,
      transcript: options.transcript,
      wasCorrect: options.wasCorrect,
      aiWasSpeaking: options.aiWasSpeaking ?? true,
      contextType: options.contextType ?? "unknown",
    };

    // Add to history
    this.eventHistory.push(event);

    // Update stats
    this.updateStats(event);

    // Prune old events
    this.pruneOldEvents();

    // Persist
    this.saveToStorage();

    return event;
  }

  /**
   * Mark an event as correctly or incorrectly classified
   */
  markEventCorrectness(eventId: string, wasCorrect: boolean): void {
    const event = this.eventHistory.find((e) => e.id === eventId);
    if (event) {
      const previousCorrectness = event.wasCorrect;
      event.wasCorrect = wasCorrect;

      // Update false positive rate if changed
      if (previousCorrectness !== wasCorrect) {
        this.recalculateFalsePositiveRate();
        this.saveToStorage();
      }
    }
  }

  /**
   * Record session start
   */
  startSession(): void {
    this.sessionStartTime = Date.now();
    this.stats.sessionCount++;
  }

  /**
   * Record session end
   */
  endSession(): void {
    if (this.sessionStartTime) {
      const duration = Date.now() - this.sessionStartTime;
      this.sessionDurations.push(duration);

      // Update average session duration
      const total = this.sessionDurations.reduce((a, b) => a + b, 0);
      this.stats.averageSessionDuration = total / this.sessionDurations.length;

      this.sessionStartTime = null;
      this.saveToStorage();
    }
  }

  // ==========================================================================
  // Stats Calculation
  // ==========================================================================

  /**
   * Update stats based on new event
   */
  private updateStats(event: BargeInEvent): void {
    this.stats.totalBargeIns++;

    // Update type counts
    switch (event.type) {
      case "backchannel":
        this.stats.backchannelCount++;
        if (event.transcript) {
          const phrase = event.transcript.toLowerCase().trim();
          const count = this.stats.preferredBackchannelPhrases.get(phrase) || 0;
          this.stats.preferredBackchannelPhrases.set(phrase, count + 1);
        }
        break;
      case "soft_barge":
        this.stats.softBargeCount++;
        break;
      case "hard_barge":
        this.stats.hardBargeCount++;
        break;
    }

    // Update average duration
    const prevTotal =
      this.stats.averageBargeInDuration * (this.stats.totalBargeIns - 1);
    this.stats.averageBargeInDuration =
      (prevTotal + event.duration) / this.stats.totalBargeIns;

    // Update hourly patterns
    const hour = new Date(event.timestamp).getHours();
    this.stats.hourlyPatterns[hour]++;

    // Update false positive rate
    if (event.wasCorrect === false) {
      this.recalculateFalsePositiveRate();
    }
  }

  /**
   * Recalculate false positive rate from event history
   */
  private recalculateFalsePositiveRate(): void {
    const eventsWithCorrectness = this.eventHistory.filter(
      (e) => e.wasCorrect !== undefined,
    );

    if (eventsWithCorrectness.length === 0) {
      this.stats.falsePositiveRate = 0;
      return;
    }

    const falsePositives = eventsWithCorrectness.filter(
      (e) => e.wasCorrect === false,
    ).length;
    this.stats.falsePositiveRate =
      falsePositives / eventsWithCorrectness.length;
  }

  /**
   * Estimate speaking pace from event patterns
   */
  private updateSpeakingPace(): void {
    if (this.eventHistory.length < 10) return;

    // Analyze duration patterns
    const recentEvents = this.eventHistory.slice(-50);
    const avgDuration =
      recentEvents.reduce((sum, e) => sum + e.duration, 0) /
      recentEvents.length;

    if (avgDuration < 300) {
      this.stats.speakingPace = "fast";
    } else if (avgDuration > 600) {
      this.stats.speakingPace = "slow";
    } else {
      this.stats.speakingPace = "normal";
    }
  }

  // ==========================================================================
  // Pattern Detection
  // ==========================================================================

  /**
   * Detect patterns in user behavior
   */
  detectPatterns(): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    if (this.eventHistory.length < this.config.minEventsForPatterns) {
      return patterns;
    }

    // Check for frequent backchannel pattern
    const backchannelRatio =
      this.stats.backchannelCount / this.stats.totalBargeIns;
    if (backchannelRatio > 0.6) {
      patterns.push({
        type: "frequent_backchannel",
        confidence: Math.min(0.95, backchannelRatio),
        details: {
          ratio: backchannelRatio,
          topPhrases: this.getTopBackchannelPhrases(5),
        },
      });
    }

    // Check for rapid interruption pattern
    const recentEvents = this.getRecentEvents(this.config.patternWindow);
    if (recentEvents.length >= 5) {
      const hardBargeRatio =
        recentEvents.filter((e) => e.type === "hard_barge").length /
        recentEvents.length;
      if (hardBargeRatio > 0.5) {
        patterns.push({
          type: "rapid_interruption",
          confidence: Math.min(0.9, hardBargeRatio),
          details: {
            ratio: hardBargeRatio,
            avgDuration: this.stats.averageBargeInDuration,
          },
        });
      }
    }

    // Check for time-based patterns
    const peakHours = this.findPeakHours();
    if (peakHours.length > 0) {
      patterns.push({
        type: "time_based",
        confidence: 0.7,
        details: {
          peakHours,
          hourlyDistribution: [...this.stats.hourlyPatterns],
        },
      });
    }

    return patterns;
  }

  /**
   * Get recent events within time window
   */
  private getRecentEvents(windowMs: number): BargeInEvent[] {
    const cutoff = Date.now() - windowMs;
    return this.eventHistory.filter((e) => e.timestamp > cutoff);
  }

  /**
   * Find peak activity hours
   */
  private findPeakHours(): number[] {
    const total = this.stats.hourlyPatterns.reduce((a, b) => a + b, 0);
    if (total === 0) return [];

    const average = total / 24;
    const threshold = average * 1.5;

    return this.stats.hourlyPatterns
      .map((count, hour) => ({ hour, count }))
      .filter(({ count }) => count > threshold)
      .map(({ hour }) => hour);
  }

  /**
   * Get top backchannel phrases
   */
  getTopBackchannelPhrases(count: number): string[] {
    return Array.from(this.stats.preferredBackchannelPhrases.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([phrase]) => phrase);
  }

  // ==========================================================================
  // Recommendations
  // ==========================================================================

  /**
   * Get recommended VAD sensitivity based on behavior
   */
  getRecommendedVadSensitivity(currentSensitivity: number): number {
    if (this.stats.totalBargeIns < 10) {
      return currentSensitivity;
    }

    // If too many false positives, increase sensitivity (less sensitive)
    if (this.stats.falsePositiveRate > 0.15) {
      return Math.min(0.9, currentSensitivity + 0.05);
    }

    // If user frequently uses backchannels, be more permissive
    const backchannelRatio =
      this.stats.backchannelCount / this.stats.totalBargeIns;
    if (backchannelRatio > 0.5) {
      return Math.max(0.3, currentSensitivity - 0.05);
    }

    return currentSensitivity;
  }

  /**
   * Get recommended backchannel tolerance
   */
  getRecommendedBackchannelTolerance(): "low" | "normal" | "high" {
    const ratio =
      this.stats.backchannelCount / Math.max(1, this.stats.totalBargeIns);
    if (ratio > 0.5) return "high";
    if (ratio < 0.2) return "low";
    return "normal";
  }

  // ==========================================================================
  // State Access
  // ==========================================================================

  /**
   * Get current stats
   */
  getStats(): BehaviorStats {
    return this.cloneStats(this.stats);
  }

  /**
   * Get event history
   */
  getEventHistory(): BargeInEvent[] {
    return [...this.eventHistory];
  }

  /**
   * Get events by type
   */
  getEventsByType(type: BargeInType): BargeInEvent[] {
    return this.eventHistory.filter((e) => e.type === type);
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  /**
   * Save to localStorage
   */
  private saveToStorage(): void {
    try {
      const data = {
        eventHistory: this.eventHistory,
        stats: this.serializeStats(this.stats),
        sessionDurations: this.sessionDurations,
        version: 1,
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.warn("[BehaviorTracker] Failed to save:", error);
    }
  }

  /**
   * Load from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return;

      const data = JSON.parse(stored);
      if (data.version !== 1) return;

      this.eventHistory = data.eventHistory || [];
      this.stats = this.deserializeStats(data.stats);
      this.sessionDurations = data.sessionDurations || [];

      // Prune old events after loading
      this.pruneOldEvents();
    } catch (error) {
      console.warn("[BehaviorTracker] Failed to load:", error);
    }
  }

  /**
   * Serialize stats for storage
   */
  private serializeStats(stats: BehaviorStats): Record<string, unknown> {
    return {
      ...stats,
      preferredBackchannelPhrases: Array.from(
        stats.preferredBackchannelPhrases.entries(),
      ),
    };
  }

  /**
   * Deserialize stats from storage
   */
  private deserializeStats(data: Record<string, unknown>): BehaviorStats {
    const stats = this.cloneStats(EMPTY_BEHAVIOR_STATS);

    if (!data) return stats;

    stats.totalBargeIns = (data.totalBargeIns as number) || 0;
    stats.backchannelCount = (data.backchannelCount as number) || 0;
    stats.softBargeCount = (data.softBargeCount as number) || 0;
    stats.hardBargeCount = (data.hardBargeCount as number) || 0;
    stats.falsePositiveRate = (data.falsePositiveRate as number) || 0;
    stats.averageBargeInDuration = (data.averageBargeInDuration as number) || 0;
    stats.sessionCount = (data.sessionCount as number) || 0;
    stats.averageSessionDuration = (data.averageSessionDuration as number) || 0;
    stats.estimatedWpm = (data.estimatedWpm as number) || 150;
    stats.speakingPace =
      (data.speakingPace as BehaviorStats["speakingPace"]) || "normal";

    if (Array.isArray(data.hourlyPatterns)) {
      stats.hourlyPatterns = data.hourlyPatterns as number[];
    }

    if (Array.isArray(data.preferredBackchannelPhrases)) {
      stats.preferredBackchannelPhrases = new Map(
        data.preferredBackchannelPhrases as [string, number][],
      );
    }

    return stats;
  }

  /**
   * Clone stats object
   */
  private cloneStats(stats: BehaviorStats): BehaviorStats {
    return {
      ...stats,
      preferredBackchannelPhrases: new Map(stats.preferredBackchannelPhrases),
      hourlyPatterns: [...stats.hourlyPatterns],
    };
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Prune old events
   */
  private pruneOldEvents(): void {
    const cutoff = Date.now() - this.config.eventTTL;

    // Remove events older than TTL
    this.eventHistory = this.eventHistory.filter((e) => e.timestamp > cutoff);

    // Limit history size
    if (this.eventHistory.length > this.config.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.config.maxHistorySize);
    }
  }

  /**
   * Reset all tracked data
   */
  reset(): void {
    this.eventHistory = [];
    this.stats = this.cloneStats(EMPTY_BEHAVIOR_STATS);
    this.sessionDurations = [];
    this.sessionStartTime = null;
    localStorage.removeItem(this.storageKey);
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new BehaviorTracker
 */
export function createBehaviorTracker(
  userId?: string,
  config?: Partial<BehaviorTrackerConfig>,
): BehaviorTracker {
  return new BehaviorTracker(userId, config);
}
