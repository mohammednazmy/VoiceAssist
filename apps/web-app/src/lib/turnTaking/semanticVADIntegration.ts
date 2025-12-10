/**
 * Semantic VAD Integration
 *
 * Bridges the SemanticTurnAnalyzer with the TurnTakingManager to provide
 * combined prosodic + semantic turn detection. This integration enables
 * more accurate turn completion detection by combining:
 *
 * 1. Audio-based prosodic features (pitch, energy, speaking rate)
 * 2. Text-based semantic signals (completion markers, continuation signals)
 *
 * Phase 2: Advanced Turn Detection
 * Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md
 */

import {
  SemanticTurnAnalyzer,
  createSemanticTurnAnalyzer,
  type TurnAnalysisResult,
  type TurnAnalysisContext,
  type ProsodyHints,
  type SemanticTurnAnalyzerConfig,
} from "@voiceassist/utils";
import type { ProsodicFeatures, SilencePrediction, SupportedLanguage } from "./types";

// ============================================================================
// Types
// ============================================================================

/**
 * Combined turn detection result from semantic + prosodic analysis.
 */
export interface CombinedTurnAnalysis {
  /** Result from semantic text analysis */
  semantic: TurnAnalysisResult;

  /** Combined confidence (weighted average of semantic + prosodic) */
  combinedConfidence: number;

  /** Final action recommendation */
  action: "respond" | "wait" | "prompt_continuation";

  /** Recommended wait time before acting (ms) */
  recommendedWaitMs: number;

  /** Whether to use a filler phrase */
  useFillerPhrase: boolean;

  /** Source of decision (which signal was dominant) */
  dominantSignal: "semantic" | "prosodic" | "combined";

  /** Debug info */
  debug: {
    semanticConfidence: number;
    prosodicEndingConfidence: number;
    silenceTypeWeight: number;
    hasStrongCompletion: boolean;
    hasContinuationSignal: boolean;
  };
}

/**
 * Configuration for the semantic VAD integration.
 */
export interface SemanticVADConfig {
  /** Semantic analyzer configuration */
  semanticConfig?: SemanticTurnAnalyzerConfig;

  /** Weight for semantic signals (0-1) */
  semanticWeight?: number;

  /** Weight for prosodic signals (0-1) */
  prosodicWeight?: number;

  /** Minimum combined confidence to trigger response */
  responseThreshold?: number;

  /** Language for analysis */
  language?: SupportedLanguage;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Default configuration.
 */
export const DEFAULT_SEMANTIC_VAD_CONFIG: Required<SemanticVADConfig> = {
  semanticConfig: {},
  semanticWeight: 0.6, // Semantic signals slightly more reliable
  prosodicWeight: 0.4,
  responseThreshold: 0.65,
  language: "en",
  debug: false,
};

// ============================================================================
// Semantic VAD Integration
// ============================================================================

/**
 * Integrates semantic text analysis with prosodic audio analysis
 * for more accurate turn detection.
 */
export class SemanticVADIntegration {
  private semanticAnalyzer: SemanticTurnAnalyzer;
  private config: Required<SemanticVADConfig>;

  /** Last transcript analyzed */
  private lastTranscript: string = "";

  /** Conversation context (previous utterances) */
  private conversationContext: string[] = [];

  /** Performance metrics */
  private metrics = {
    analysisCount: 0,
    avgProcessingTimeMs: 0,
    semanticDominantCount: 0,
    prosodicDominantCount: 0,
    combinedCount: 0,
  };

  constructor(config: SemanticVADConfig = {}) {
    this.config = { ...DEFAULT_SEMANTIC_VAD_CONFIG, ...config };

    // Create semantic analyzer with language config
    this.semanticAnalyzer = createSemanticTurnAnalyzer({
      ...this.config.semanticConfig,
      language: this.config.language,
    });
  }

  // ==========================================================================
  // Main Analysis Methods
  // ==========================================================================

  /**
   * Analyze transcript with combined semantic + prosodic signals.
   *
   * @param transcript - Current transcript text
   * @param silenceDurationMs - Duration of silence since last speech
   * @param prosodicFeatures - Optional prosodic features from audio
   * @param silencePrediction - Optional silence prediction
   * @param isPartial - Whether transcript is still being spoken
   * @returns Combined turn analysis result
   */
  analyze(
    transcript: string,
    silenceDurationMs: number,
    prosodicFeatures?: ProsodicFeatures | null,
    silencePrediction?: SilencePrediction | null,
    isPartial: boolean = false,
  ): CombinedTurnAnalysis {
    const startTime = performance.now();

    // Build prosody hints from prosodic features
    const prosodyHints = this.buildProsodyHints(prosodicFeatures);

    // Build analysis context
    const context: TurnAnalysisContext = {
      isPartial,
      prosodyHints,
      previousContext: this.conversationContext,
    };

    // Run semantic analysis
    const semanticResult = this.semanticAnalyzer.analyze(
      transcript,
      silenceDurationMs,
      context,
    );

    // Calculate prosodic confidence
    const prosodicEndingConfidence = this.calculateProsodicConfidence(
      prosodicFeatures,
      silencePrediction,
    );

    // Calculate silence type weight
    const silenceTypeWeight = this.calculateSilenceTypeWeight(silencePrediction);

    // Combine confidences
    const combinedConfidence = this.combineConfidences(
      semanticResult.completionConfidence,
      prosodicEndingConfidence,
      silenceTypeWeight,
    );

    // Determine dominant signal and final action
    const { action, dominantSignal, recommendedWaitMs, useFillerPhrase } =
      this.determineAction(
        semanticResult,
        prosodicEndingConfidence,
        silenceTypeWeight,
        combinedConfidence,
        silenceDurationMs,
      );

    // Update metrics
    this.updateMetrics(dominantSignal, startTime);

    // Cache transcript for context
    if (!isPartial && transcript !== this.lastTranscript) {
      this.lastTranscript = transcript;
    }

    return {
      semantic: semanticResult,
      combinedConfidence,
      action,
      recommendedWaitMs,
      useFillerPhrase,
      dominantSignal,
      debug: {
        semanticConfidence: semanticResult.completionConfidence,
        prosodicEndingConfidence,
        silenceTypeWeight,
        hasStrongCompletion: semanticResult.signals.strongCompletion.length > 0,
        hasContinuationSignal: semanticResult.signals.continuation.length > 0,
      },
    };
  }

  /**
   * Quick analysis for simple use cases.
   */
  quickAnalyze(transcript: string, silenceDurationMs: number = 0): CombinedTurnAnalysis {
    return this.analyze(transcript, silenceDurationMs);
  }

  // ==========================================================================
  // Context Management
  // ==========================================================================

  /**
   * Add a completed utterance to conversation context.
   */
  addToContext(utterance: string): void {
    this.conversationContext.push(utterance);
    this.semanticAnalyzer.addContext(utterance);

    // Keep only last 5 utterances
    if (this.conversationContext.length > 5) {
      this.conversationContext.shift();
    }
  }

  /**
   * Clear conversation context.
   */
  clearContext(): void {
    this.conversationContext = [];
    this.semanticAnalyzer.clearContext();
    this.lastTranscript = "";
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Update language setting.
   */
  setLanguage(language: SupportedLanguage): void {
    this.config.language = language;
    // Recreate analyzer with new language
    this.semanticAnalyzer = createSemanticTurnAnalyzer({
      ...this.config.semanticConfig,
      language,
    });
  }

  /**
   * Update weights for semantic/prosodic balance.
   */
  setWeights(semanticWeight: number, prosodicWeight: number): void {
    // Normalize weights to sum to 1
    const total = semanticWeight + prosodicWeight;
    this.config.semanticWeight = semanticWeight / total;
    this.config.prosodicWeight = prosodicWeight / total;
  }

  /**
   * Get current configuration.
   */
  getConfig(): Required<SemanticVADConfig> {
    return { ...this.config };
  }

  /**
   * Get performance metrics.
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  // ==========================================================================
  // Internal: Prosody Conversion
  // ==========================================================================

  /**
   * Convert ProsodicFeatures to ProsodyHints for semantic analyzer.
   */
  private buildProsodyHints(features?: ProsodicFeatures | null): ProsodyHints | undefined {
    if (!features) {
      return undefined;
    }

    return {
      risingIntonation: features.pitchContour === "rising" || features.isQuestion,
      energyDecline: features.isEnding || features.energy < 0.3,
      slowingRate: features.speakingRate < 2.0, // Slow speech
      finalPitchDirection: this.mapPitchContour(features.pitchContour),
    };
  }

  /**
   * Map pitch contour to final pitch direction.
   */
  private mapPitchContour(
    contour: ProsodicFeatures["pitchContour"],
  ): "up" | "down" | "level" {
    switch (contour) {
      case "rising":
        return "up";
      case "falling":
        return "down";
      case "flat":
        return "level";
      case "complex":
        // Complex contours typically indicate statement completion
        return "down";
      default:
        return "level";
    }
  }

  // ==========================================================================
  // Internal: Confidence Calculations
  // ==========================================================================

  /**
   * Calculate prosodic confidence that turn is complete.
   */
  private calculateProsodicConfidence(
    features?: ProsodicFeatures | null,
    _silencePrediction?: SilencePrediction | null,
  ): number {
    if (!features) {
      return 0.5; // Neutral if no prosodic data
    }

    let confidence = 0.5;

    // Falling pitch suggests completion
    if (features.pitchContour === "falling") {
      confidence += 0.2;
    } else if (features.pitchContour === "rising") {
      // Rising pitch might indicate question (complete) or continuation
      confidence += 0.1;
    }

    // Low energy suggests trailing off
    if (features.energy < 0.2) {
      confidence += 0.15;
    }

    // Analyzer's ending detection
    if (features.isEnding) {
      confidence += 0.2;
    }

    // Low voice activity
    if (features.voiceActivity < 0.3) {
      confidence += 0.1;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Calculate weight based on silence type.
   */
  private calculateSilenceTypeWeight(prediction?: SilencePrediction | null): number {
    if (!prediction) {
      return 0.5;
    }

    // Silence type affects how much we trust turn completion
    switch (prediction.silenceType) {
      case "end_of_turn":
        return 1.0; // High confidence in completion
      case "thinking":
        return 0.3; // User is thinking, don't interrupt
      case "hesitation":
        return 0.4; // Slight hesitation, wait a bit
      case "pause":
        return 0.6; // Natural pause, could be done
      default:
        return 0.5;
    }
  }

  /**
   * Combine semantic and prosodic confidences.
   */
  private combineConfidences(
    semanticConfidence: number,
    prosodicConfidence: number,
    silenceTypeWeight: number,
  ): number {
    // Weight the confidences
    const weightedSemantic = semanticConfidence * this.config.semanticWeight;
    const weightedProsodic = prosodicConfidence * this.config.prosodicWeight;

    // Base combined confidence
    let combined = weightedSemantic + weightedProsodic;

    // Adjust by silence type
    combined = combined * (0.7 + 0.3 * silenceTypeWeight);

    return Math.min(1, Math.max(0, combined));
  }

  // ==========================================================================
  // Internal: Action Determination
  // ==========================================================================

  /**
   * Determine the final action based on all signals.
   */
  private determineAction(
    semanticResult: TurnAnalysisResult,
    prosodicConfidence: number,
    silenceTypeWeight: number,
    combinedConfidence: number,
    silenceDurationMs: number,
  ): {
    action: "respond" | "wait" | "prompt_continuation";
    dominantSignal: "semantic" | "prosodic" | "combined";
    recommendedWaitMs: number;
    useFillerPhrase: boolean;
  } {
    let action: "respond" | "wait" | "prompt_continuation";
    let dominantSignal: "semantic" | "prosodic" | "combined";
    let recommendedWaitMs: number;
    let useFillerPhrase = false;

    // Determine which signal is dominant
    const semanticStrength = semanticResult.completionConfidence * this.config.semanticWeight;
    const prosodicStrength = prosodicConfidence * this.config.prosodicWeight;

    if (Math.abs(semanticStrength - prosodicStrength) < 0.1) {
      dominantSignal = "combined";
    } else if (semanticStrength > prosodicStrength) {
      dominantSignal = "semantic";
    } else {
      dominantSignal = "prosodic";
    }

    // Strong semantic signals override prosodic uncertainty
    if (semanticResult.signals.strongCompletion.length > 0) {
      action = "respond";
      recommendedWaitMs = 0;
      dominantSignal = "semantic";
    }
    // Strong continuation signals mean wait
    else if (semanticResult.signals.continuation.length > 0) {
      action = "wait";
      recommendedWaitMs = semanticResult.recommendedWaitMs;
      dominantSignal = "semantic";
    }
    // High combined confidence
    else if (combinedConfidence >= this.config.responseThreshold) {
      action = "respond";
      recommendedWaitMs = silenceTypeWeight < 0.7 ? 300 : 0;
    }
    // Low confidence with long silence
    else if (combinedConfidence < 0.4 && silenceDurationMs > 3000) {
      action = "prompt_continuation";
      recommendedWaitMs = 0;
      useFillerPhrase = true;
    }
    // Medium confidence - wait
    else {
      action = "wait";
      recommendedWaitMs = Math.max(
        semanticResult.recommendedWaitMs,
        500, // Minimum wait
      );
    }

    // Cap wait time at 5 seconds
    recommendedWaitMs = Math.min(recommendedWaitMs, 5000);

    // Force response after max wait
    if (silenceDurationMs >= 5000 && action === "wait") {
      action = "respond";
      recommendedWaitMs = 0;
    }

    return { action, dominantSignal, recommendedWaitMs, useFillerPhrase };
  }

  // ==========================================================================
  // Internal: Metrics
  // ==========================================================================

  /**
   * Update performance metrics.
   */
  private updateMetrics(
    dominantSignal: "semantic" | "prosodic" | "combined",
    startTime: number,
  ): void {
    const processingTime = performance.now() - startTime;

    this.metrics.analysisCount++;
    this.metrics.avgProcessingTimeMs =
      (this.metrics.avgProcessingTimeMs * (this.metrics.analysisCount - 1) + processingTime) /
      this.metrics.analysisCount;

    switch (dominantSignal) {
      case "semantic":
        this.metrics.semanticDominantCount++;
        break;
      case "prosodic":
        this.metrics.prosodicDominantCount++;
        break;
      case "combined":
        this.metrics.combinedCount++;
        break;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a semantic VAD integration instance.
 */
export function createSemanticVADIntegration(
  config?: SemanticVADConfig,
): SemanticVADIntegration {
  return new SemanticVADIntegration(config);
}

// ============================================================================
// Hesitation Tolerance Tuning
// ============================================================================

/**
 * Predefined hesitation tolerance profiles.
 * Use these to quickly tune the system for different use cases.
 */
export const HESITATION_PROFILES = {
  /**
   * Patient: Wait longer for users who pause frequently.
   * Good for elderly users, non-native speakers, or complex topics.
   */
  patient: {
    semanticWeight: 0.5,
    prosodicWeight: 0.5,
    responseThreshold: 0.75, // Higher threshold
    semanticConfig: {
      completionThreshold: 0.75,
      weakCompletionWaitMs: 1200,
      continuationWaitMs: 3000,
      maxWaitMs: 8000,
    },
  } satisfies SemanticVADConfig,

  /**
   * Balanced: Default balanced profile.
   */
  balanced: {
    semanticWeight: 0.6,
    prosodicWeight: 0.4,
    responseThreshold: 0.65,
    semanticConfig: {
      completionThreshold: 0.65,
      weakCompletionWaitMs: 800,
      continuationWaitMs: 2000,
      maxWaitMs: 5000,
    },
  } satisfies SemanticVADConfig,

  /**
   * Quick: Respond faster for quick back-and-forth.
   * Good for simple queries and fast speakers.
   */
  quick: {
    semanticWeight: 0.7,
    prosodicWeight: 0.3,
    responseThreshold: 0.55, // Lower threshold
    semanticConfig: {
      completionThreshold: 0.55,
      weakCompletionWaitMs: 500,
      continuationWaitMs: 1200,
      maxWaitMs: 3000,
    },
  } satisfies SemanticVADConfig,

  /**
   * Medical: Extra patient for medical dictation.
   * Allows for complex terminology and careful speech.
   */
  medical: {
    semanticWeight: 0.4,
    prosodicWeight: 0.6, // More weight on prosody for dictation
    responseThreshold: 0.8,
    semanticConfig: {
      completionThreshold: 0.8,
      weakCompletionWaitMs: 1500,
      continuationWaitMs: 4000,
      maxWaitMs: 10000,
    },
  } satisfies SemanticVADConfig,
} as const;

/**
 * Get a hesitation tolerance profile by name.
 */
export function getHesitationProfile(
  name: keyof typeof HESITATION_PROFILES,
): SemanticVADConfig {
  return HESITATION_PROFILES[name];
}
