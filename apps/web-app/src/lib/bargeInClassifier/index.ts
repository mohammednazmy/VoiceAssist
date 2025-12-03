/**
 * Barge-In Classifier Module
 *
 * Main entry point for the context-aware interruption classification system.
 * Provides unified API for classifying barge-in events with multilingual support.
 *
 * Phase 3: Context-Aware Interruption Intelligence
 */

import type { SupportedLanguage } from "../../hooks/useIntelligentBargeIn/types";
import type {
  BargeInClassifierConfig,
  ClassificationResult,
  ClassifierEvent,
  ClassifierEventCallback,
  AudioFeatures,
  CustomPatterns,
} from "./types";
import { DEFAULT_CLASSIFIER_CONFIG } from "./types";
import { IntentClassifier } from "./intentClassifier";
import { BackchannelDetector } from "./backchannelDetector";

// ============================================================================
// Barge-In Classifier Class
// ============================================================================

/**
 * Main barge-in classifier that orchestrates detection and classification
 */
export class BargeInClassifier {
  private config: BargeInClassifierConfig;
  private intentClassifier: IntentClassifier;
  private backchannelDetector: BackchannelDetector;
  private eventCallbacks: Set<ClassifierEventCallback> = new Set();

  // Tracking state
  private lastClassification: ClassificationResult | null = null;
  private classificationHistory: ClassificationResult[] = [];
  private maxHistorySize = 20;

  constructor(config: Partial<BargeInClassifierConfig> = {}) {
    this.config = { ...DEFAULT_CLASSIFIER_CONFIG, ...config };
    this.intentClassifier = new IntentClassifier(this.config);
    this.backchannelDetector = new BackchannelDetector({
      language: this.config.language,
      escalationWindowMs: this.config.backchannelEscalationWindow,
      escalationThreshold: this.config.backchannelEscalationThreshold,
    });
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Update classifier configuration
   */
  updateConfig(config: Partial<BargeInClassifierConfig>): void {
    this.config = { ...this.config, ...config };
    this.intentClassifier.updateConfig(this.config);

    if (config.language) {
      this.backchannelDetector.setLanguage(config.language);
    }
  }

  /**
   * Set the primary language
   */
  setLanguage(language: SupportedLanguage): void {
    this.config.language = language;
    this.intentClassifier.setLanguage(language);
    this.backchannelDetector.setLanguage(language);
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<BargeInClassifierConfig> {
    return { ...this.config };
  }

  /**
   * Add custom patterns for classification
   */
  addCustomPatterns(patterns: CustomPatterns): void {
    this.config.customPatterns = {
      ...this.config.customPatterns,
      ...patterns,
    };
    // Would update internal classifiers with custom patterns
  }

  // ==========================================================================
  // Classification
  // ==========================================================================

  /**
   * Classify a barge-in event from transcript and audio data
   */
  classify(
    transcript: string,
    duration: number,
    vadProbability: number,
    duringAISpeech: boolean,
    audioFeatures?: AudioFeatures,
  ): ClassificationResult {
    const result = this.intentClassifier.classify(
      transcript,
      duration,
      vadProbability,
      duringAISpeech,
      audioFeatures,
    );

    // Store result
    this.lastClassification = result;
    this.classificationHistory.push(result);
    if (this.classificationHistory.length > this.maxHistorySize) {
      this.classificationHistory.shift();
    }

    // Emit event
    this.emitEvent({
      type: "classification",
      result,
      timestamp: Date.now(),
    });

    // Check for escalation
    if (
      result.metadata.recentBackchannelCount >=
      this.config.backchannelEscalationThreshold
    ) {
      this.emitEvent({
        type: "escalation",
        reason: "repeated_backchannels",
        count: result.metadata.recentBackchannelCount,
        timestamp: Date.now(),
      });
    }

    return result;
  }

  /**
   * Quick check if transcript is likely a backchannel
   */
  isBackchannel(
    transcript: string,
    duration: number,
    confidence: number,
  ): boolean {
    const result = this.backchannelDetector.detect(
      transcript,
      duration,
      confidence,
    );
    return result.isBackchannel;
  }

  /**
   * Get the recommended action for a classification
   */
  getRecommendedAction(result: ClassificationResult): string {
    return result.action.type;
  }

  // ==========================================================================
  // Event Handling
  // ==========================================================================

  /**
   * Subscribe to classifier events
   */
  onEvent(callback: ClassifierEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  private emitEvent(event: ClassifierEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error("[BargeInClassifier] Event callback error:", error);
      }
    }
  }

  // ==========================================================================
  // History and Analysis
  // ==========================================================================

  /**
   * Get the last classification result
   */
  getLastClassification(): ClassificationResult | null {
    return this.lastClassification;
  }

  /**
   * Get classification history
   */
  getHistory(): readonly ClassificationResult[] {
    return [...this.classificationHistory];
  }

  /**
   * Get statistics about recent classifications
   */
  getStatistics(): ClassificationStatistics {
    const history = this.classificationHistory;
    if (history.length === 0) {
      return {
        totalClassifications: 0,
        backchannelRate: 0,
        hardBargeRate: 0,
        averageConfidence: 0,
        dominantLanguage: this.config.language,
      };
    }

    const backchannels = history.filter(
      (r) => r.classification === "backchannel",
    ).length;
    const hardBarges = history.filter(
      (r) => r.classification === "hard_barge",
    ).length;
    const avgConfidence =
      history.reduce((sum, r) => sum + r.confidence, 0) / history.length;

    // Find dominant language
    const langCounts = new Map<SupportedLanguage, number>();
    for (const r of history) {
      langCounts.set(r.language, (langCounts.get(r.language) || 0) + 1);
    }
    let dominantLang = this.config.language;
    let maxCount = 0;
    for (const [lang, count] of langCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantLang = lang;
      }
    }

    return {
      totalClassifications: history.length,
      backchannelRate: backchannels / history.length,
      hardBargeRate: hardBarges / history.length,
      averageConfidence: avgConfidence,
      dominantLanguage: dominantLang,
    };
  }

  /**
   * Analyze patterns in recent classifications
   */
  analyzePatterns(): PatternAnalysis {
    const history = this.classificationHistory;
    const recentWindow = 10;
    const recent = history.slice(-recentWindow);

    // Detect increasing urgency
    const urgencyTrend = this.detectUrgencyTrend(recent);

    // Detect user frustration (repeated corrections/hard barges)
    const frustrationLevel = this.detectFrustration(recent);

    // Suggest adaptation
    const adaptations = this.suggestAdaptations(urgencyTrend, frustrationLevel);

    return {
      urgencyTrend,
      frustrationLevel,
      suggestedAdaptations: adaptations,
    };
  }

  private detectUrgencyTrend(
    recent: ClassificationResult[],
  ): "increasing" | "stable" | "decreasing" {
    if (recent.length < 3) return "stable";

    const priorities = recent.map((r) => {
      switch (r.priority) {
        case "critical":
          return 4;
        case "high":
          return 3;
        case "medium":
          return 2;
        case "low":
          return 1;
      }
    });

    const firstHalf = priorities.slice(0, Math.floor(priorities.length / 2));
    const secondHalf = priorities.slice(Math.floor(priorities.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    if (secondAvg > firstAvg + 0.5) return "increasing";
    if (secondAvg < firstAvg - 0.5) return "decreasing";
    return "stable";
  }

  private detectFrustration(recent: ClassificationResult[]): number {
    if (recent.length === 0) return 0;

    const frustrationIndicators = recent.filter(
      (r) =>
        r.classification === "correction" ||
        r.classification === "hard_barge" ||
        r.intent === "stop",
    ).length;

    return frustrationIndicators / recent.length;
  }

  private suggestAdaptations(
    urgencyTrend: string,
    frustrationLevel: number,
  ): string[] {
    const adaptations: string[] = [];

    if (urgencyTrend === "increasing") {
      adaptations.push("Consider pausing more frequently for user input");
      adaptations.push("Reduce response verbosity");
    }

    if (frustrationLevel > 0.3) {
      adaptations.push("User may be frustrated - acknowledge and clarify");
      adaptations.push("Consider asking if user wants to change topic");
    }

    if (frustrationLevel > 0.5) {
      adaptations.push("High frustration detected - pause and offer help");
    }

    return adaptations;
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Reset all state
   */
  reset(): void {
    this.intentClassifier.reset();
    this.backchannelDetector.reset();
    this.lastClassification = null;
    this.classificationHistory = [];
  }

  /**
   * Clear history but keep configuration
   */
  clearHistory(): void {
    this.classificationHistory = [];
  }
}

// ============================================================================
// Types
// ============================================================================

export interface ClassificationStatistics {
  totalClassifications: number;
  backchannelRate: number;
  hardBargeRate: number;
  averageConfidence: number;
  dominantLanguage: SupportedLanguage;
}

export interface PatternAnalysis {
  urgencyTrend: "increasing" | "stable" | "decreasing";
  frustrationLevel: number;
  suggestedAdaptations: string[];
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new BargeInClassifier with optional configuration
 */
export function createBargeInClassifier(
  config?: Partial<BargeInClassifierConfig>,
): BargeInClassifier {
  return new BargeInClassifier(config);
}

// ============================================================================
// Re-exports
// ============================================================================

export * from "./types";
export * from "./phraseLibrary";
export {
  BackchannelDetector,
  createBackchannelDetector,
} from "./backchannelDetector";
export { IntentClassifier, createIntentClassifier } from "./intentClassifier";
