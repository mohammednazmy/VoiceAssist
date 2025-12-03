/**
 * Silence Predictor
 *
 * Adaptive silence detection that learns from conversation patterns.
 * Predicts when silence indicates end-of-turn vs thinking pause.
 *
 * Phase 5: Natural Turn-Taking
 */

import type {
  SilencePrediction,
  SilencePredictorConfig,
  ProsodicFeatures,
} from "./types";
import { DEFAULT_SILENCE_CONFIG } from "./types";

// ============================================================================
// Silence Predictor
// ============================================================================

/**
 * Predicts silence type and optimal response timing
 */
export class SilencePredictor {
  private config: SilencePredictorConfig;

  /** Current adaptive silence threshold */
  private adaptiveThreshold: number;

  /** History of silence durations */
  private silenceHistory: number[] = [];
  private readonly MAX_HISTORY_SIZE = 20;

  /** History of turn durations */
  private turnDurations: number[] = [];

  /** Current silence duration tracking */
  private currentSilenceStart: number | null = null;
  private wasSpeaking: boolean = false;

  /** Last prosodic features for context */
  private lastProsodicFeatures: ProsodicFeatures | null = null;

  /** Statistics */
  private stats = {
    totalPredictions: 0,
    endOfTurnPredictions: 0,
    pausePredictions: 0,
    hesitationPredictions: 0,
    thinkingPredictions: 0,
    avgSilenceDuration: 0,
    adaptations: 0,
  };

  constructor(config: Partial<SilencePredictorConfig> = {}) {
    this.config = { ...DEFAULT_SILENCE_CONFIG, ...config };
    this.adaptiveThreshold = this.config.baseSilenceThreshold;
  }

  // ==========================================================================
  // Main Prediction
  // ==========================================================================

  /**
   * Update with current voice activity and get silence prediction
   *
   * @param isSpeaking - Whether voice is detected
   * @param prosodicFeatures - Optional prosodic features for context
   * @returns Silence prediction
   */
  update(
    isSpeaking: boolean,
    prosodicFeatures?: ProsodicFeatures,
  ): SilencePrediction {
    const now = Date.now();

    if (prosodicFeatures) {
      this.lastProsodicFeatures = prosodicFeatures;
    }

    // Transition from speaking to silence
    if (this.wasSpeaking && !isSpeaking) {
      this.currentSilenceStart = now;
    }

    // Transition from silence to speaking
    if (!this.wasSpeaking && isSpeaking && this.currentSilenceStart) {
      const silenceDuration = now - this.currentSilenceStart;
      this.recordSilence(silenceDuration);
      this.currentSilenceStart = null;
    }

    this.wasSpeaking = isSpeaking;

    // Calculate current silence duration
    const silenceDuration = this.currentSilenceStart
      ? now - this.currentSilenceStart
      : 0;

    // Generate prediction
    return this.predict(silenceDuration, isSpeaking);
  }

  /**
   * Generate a silence prediction
   */
  private predict(
    silenceDuration: number,
    isSpeaking: boolean,
  ): SilencePrediction {
    this.stats.totalPredictions++;

    // If currently speaking, no silence prediction needed
    if (isSpeaking) {
      return {
        isSilence: false,
        predictedDuration: 0,
        confidence: 1,
        silenceType: "end_of_turn",
        shouldWait: false,
        recommendation: "wait",
      };
    }

    // No silence yet
    if (silenceDuration === 0) {
      return {
        isSilence: false,
        predictedDuration: 0,
        confidence: 0.5,
        silenceType: "pause",
        shouldWait: true,
        recommendation: "wait",
      };
    }

    // Classify the silence type
    const silenceType = this.classifySilence(silenceDuration);
    const predictedDuration = this.predictDuration(silenceDuration);
    const confidence = this.calculateConfidence(silenceDuration);
    const shouldWait = this.shouldWaitForMore(silenceDuration, silenceType);
    const recommendation = this.getRecommendation(
      silenceDuration,
      silenceType,
      shouldWait,
    );

    // Update statistics
    switch (silenceType) {
      case "end_of_turn":
        this.stats.endOfTurnPredictions++;
        break;
      case "pause":
        this.stats.pausePredictions++;
        break;
      case "hesitation":
        this.stats.hesitationPredictions++;
        break;
      case "thinking":
        this.stats.thinkingPredictions++;
        break;
    }

    return {
      isSilence: true,
      predictedDuration,
      confidence,
      silenceType,
      shouldWait,
      recommendation,
    };
  }

  // ==========================================================================
  // Classification
  // ==========================================================================

  /**
   * Classify the type of silence
   */
  private classifySilence(
    duration: number,
  ): "end_of_turn" | "pause" | "hesitation" | "thinking" {
    // Use prosodic context if available
    if (this.config.useProsody && this.lastProsodicFeatures) {
      // If speech ended with rising intonation (question), expect shorter response time
      if (this.lastProsodicFeatures.isQuestion) {
        if (duration > this.adaptiveThreshold * 0.7) {
          return "end_of_turn";
        }
      }

      // If speech ended with falling intonation (statement), use normal threshold
      if (this.lastProsodicFeatures.isEnding) {
        if (duration > this.adaptiveThreshold * 0.8) {
          return "end_of_turn";
        }
      }
    }

    // Duration-based classification
    if (duration < 150) {
      // Very short: natural speech pause
      return "pause";
    } else if (duration < 400) {
      // Short: could be hesitation
      return "hesitation";
    } else if (duration < this.adaptiveThreshold) {
      // Medium: user might be thinking
      return "thinking";
    } else {
      // Long: likely end of turn
      return "end_of_turn";
    }
  }

  /**
   * Predict how long the silence will last
   */
  private predictDuration(currentDuration: number): number {
    // If we have history, use it to predict
    if (this.config.useHistory && this.silenceHistory.length > 3) {
      const avgSilence =
        this.silenceHistory.reduce((a, b) => a + b, 0) /
        this.silenceHistory.length;

      // If current duration is close to average, predict average
      if (currentDuration < avgSilence) {
        return avgSilence;
      }
    }

    // Default: predict threshold
    return this.adaptiveThreshold;
  }

  /**
   * Calculate confidence in the prediction
   */
  private calculateConfidence(duration: number): number {
    // Confidence increases with duration
    const baseConfidence = Math.min(1, duration / this.adaptiveThreshold);

    // Adjust based on history consistency
    if (this.silenceHistory.length > 5) {
      const avgSilence =
        this.silenceHistory.reduce((a, b) => a + b, 0) /
        this.silenceHistory.length;
      const variance =
        this.silenceHistory.reduce((sum, d) => sum + (d - avgSilence) ** 2, 0) /
        this.silenceHistory.length;

      // Lower variance = higher confidence
      const consistencyBonus = 1 / (1 + variance / 10000);
      return Math.min(1, baseConfidence * (1 + consistencyBonus * 0.2));
    }

    return baseConfidence;
  }

  // ==========================================================================
  // Decision Making
  // ==========================================================================

  /**
   * Determine if we should wait for more speech
   */
  private shouldWaitForMore(duration: number, silenceType: string): boolean {
    // Always wait during pauses and hesitations
    if (silenceType === "pause" || silenceType === "hesitation") {
      return true;
    }

    // Wait during thinking if below threshold
    if (silenceType === "thinking") {
      return duration < this.adaptiveThreshold;
    }

    // Don't wait at end of turn
    return false;
  }

  /**
   * Get recommendation for action
   */
  private getRecommendation(
    duration: number,
    silenceType: string,
    shouldWait: boolean,
  ): "wait" | "take_turn" | "prompt_user" {
    if (shouldWait) {
      return "wait";
    }

    if (silenceType === "end_of_turn") {
      return "take_turn";
    }

    // Very long silence - prompt user
    if (duration > this.config.maxSilenceThreshold) {
      return "prompt_user";
    }

    return "take_turn";
  }

  // ==========================================================================
  // Adaptation
  // ==========================================================================

  /**
   * Record a silence duration for adaptive learning
   */
  private recordSilence(duration: number): void {
    this.silenceHistory.push(duration);
    if (this.silenceHistory.length > this.MAX_HISTORY_SIZE) {
      this.silenceHistory.shift();
    }

    // Update adaptive threshold
    this.adaptThreshold();

    // Update stats
    this.stats.avgSilenceDuration =
      this.silenceHistory.reduce((a, b) => a + b, 0) /
      this.silenceHistory.length;
  }

  /**
   * Adapt the silence threshold based on observed patterns
   */
  private adaptThreshold(): void {
    if (this.silenceHistory.length < 5) return;

    // Calculate median silence duration
    const sorted = [...this.silenceHistory].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // Adapt towards the median
    const newThreshold =
      (1 - this.config.adaptationRate) * this.adaptiveThreshold +
      this.config.adaptationRate * median;

    // Clamp to bounds
    this.adaptiveThreshold = Math.max(
      this.config.minSilenceThreshold,
      Math.min(this.config.maxSilenceThreshold, newThreshold),
    );

    this.stats.adaptations++;
  }

  /**
   * Record a turn duration for context
   */
  recordTurnDuration(duration: number): void {
    this.turnDurations.push(duration);
    if (this.turnDurations.length > this.MAX_HISTORY_SIZE) {
      this.turnDurations.shift();
    }
  }

  // ==========================================================================
  // Configuration and State
  // ==========================================================================

  /**
   * Get current adaptive threshold
   */
  getAdaptiveThreshold(): number {
    return this.adaptiveThreshold;
  }

  /**
   * Set the adaptive threshold manually
   */
  setAdaptiveThreshold(threshold: number): void {
    this.adaptiveThreshold = Math.max(
      this.config.minSilenceThreshold,
      Math.min(this.config.maxSilenceThreshold, threshold),
    );
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SilencePredictorConfig>): void {
    this.config = { ...this.config, ...config };

    // Reset threshold to base if config changes significantly
    if (
      config.baseSilenceThreshold !== undefined ||
      config.minSilenceThreshold !== undefined ||
      config.maxSilenceThreshold !== undefined
    ) {
      this.adaptiveThreshold = this.config.baseSilenceThreshold;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): SilencePredictorConfig {
    return { ...this.config };
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalPredictions: number;
    endOfTurnPredictions: number;
    pausePredictions: number;
    hesitationPredictions: number;
    thinkingPredictions: number;
    avgSilenceDuration: number;
    adaptations: number;
    adaptiveThreshold: number;
  } {
    return {
      ...this.stats,
      adaptiveThreshold: this.adaptiveThreshold,
    };
  }

  /**
   * Reset state
   */
  reset(): void {
    this.adaptiveThreshold = this.config.baseSilenceThreshold;
    this.silenceHistory = [];
    this.turnDurations = [];
    this.currentSilenceStart = null;
    this.wasSpeaking = false;
    this.lastProsodicFeatures = null;
    this.stats = {
      totalPredictions: 0,
      endOfTurnPredictions: 0,
      pausePredictions: 0,
      hesitationPredictions: 0,
      thinkingPredictions: 0,
      avgSilenceDuration: 0,
      adaptations: 0,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new SilencePredictor with optional configuration
 */
export function createSilencePredictor(
  config?: Partial<SilencePredictorConfig>,
): SilencePredictor {
  return new SilencePredictor(config);
}
