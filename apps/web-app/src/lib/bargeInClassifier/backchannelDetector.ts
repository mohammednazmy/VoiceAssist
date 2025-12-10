/**
 * Backchannel Detector
 *
 * Multilingual detection of backchannel utterances and soft barge-in requests.
 * Tracks patterns over time to detect escalation (repeated backchannels = wants to speak).
 *
 * Phase 3: Context-Aware Interruption Intelligence
 */

import type { SupportedLanguage } from "../../hooks/useIntelligentBargeIn/types";
import type {
  BackchannelResult,
  SoftBargeResult,
  BackchannelPattern,
} from "./types";
import {
  BACKCHANNEL_PATTERNS,
  SOFT_BARGE_PATTERNS,
  getRandomAcknowledgment,
} from "./phraseLibrary";

// ============================================================================
// Configuration
// ============================================================================

export interface BackchannelDetectorConfig {
  /** Primary language */
  language: SupportedLanguage;

  /** Time window for escalation detection (ms) */
  escalationWindowMs: number;

  /** Number of backchannels to trigger escalation */
  escalationThreshold: number;

  /** Maximum duration for a backchannel (ms) */
  maxBackchannelDuration: number;

  /** Minimum confidence for backchannel detection */
  minConfidence: number;

  /** Enable fuzzy matching for phrases */
  enableFuzzyMatching: boolean;

  /** Fuzzy matching threshold (0-1) */
  fuzzyThreshold: number;
}

const DEFAULT_CONFIG: BackchannelDetectorConfig = {
  language: "en",
  escalationWindowMs: 5000,
  escalationThreshold: 3,
  maxBackchannelDuration: 800,
  minConfidence: 0.6,
  enableFuzzyMatching: true,
  fuzzyThreshold: 0.8,
};

// ============================================================================
// Backchannel Detector Class
// ============================================================================

export class BackchannelDetector {
  private config: BackchannelDetectorConfig;
  private patterns: BackchannelPattern[];
  private recentDetections: Map<string, number[]> = new Map();

  constructor(config: Partial<BackchannelDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.patterns =
      BACKCHANNEL_PATTERNS[this.config.language] || BACKCHANNEL_PATTERNS.en;
  }

  // ==========================================================================
  // Configuration Methods
  // ==========================================================================

  /**
   * Set the detection language
   */
  setLanguage(language: SupportedLanguage): void {
    this.config.language = language;
    this.patterns = BACKCHANNEL_PATTERNS[language] || BACKCHANNEL_PATTERNS.en;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<BackchannelDetectorConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.language) {
      this.patterns =
        BACKCHANNEL_PATTERNS[config.language] || BACKCHANNEL_PATTERNS.en;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<BackchannelDetectorConfig> {
    return { ...this.config };
  }

  // ==========================================================================
  // Detection Methods
  // ==========================================================================

  /**
   * Detect if the transcript is a backchannel utterance
   */
  detect(
    transcript: string,
    duration: number,
    confidence: number,
  ): BackchannelResult {
    const normalized = this.normalizeTranscript(transcript);

    // Too long to be a backchannel
    if (duration > this.config.maxBackchannelDuration) {
      return this.createNegativeResult();
    }

    // Try exact matching first
    const exactMatch = this.findExactMatch(normalized, duration);
    if (exactMatch) {
      const score = this.calculateScore(confidence, duration, exactMatch);
      const shouldEscalate = this.trackAndCheckEscalation(exactMatch.phrase);

      return {
        isBackchannel: score >= this.config.minConfidence && !shouldEscalate,
        matchedPattern: exactMatch.phrase,
        score,
        language: this.config.language,
        shouldEscalate,
      };
    }

    // Try fuzzy matching if enabled
    if (this.config.enableFuzzyMatching) {
      const fuzzyMatch = this.findFuzzyMatch(normalized, duration);
      if (fuzzyMatch) {
        const score =
          this.calculateScore(confidence, duration, fuzzyMatch) *
          fuzzyMatch.similarity;
        const shouldEscalate = this.trackAndCheckEscalation(fuzzyMatch.phrase);

        return {
          isBackchannel: score >= this.config.minConfidence && !shouldEscalate,
          matchedPattern: fuzzyMatch.phrase,
          score,
          language: this.config.language,
          shouldEscalate,
        };
      }
    }

    return this.createNegativeResult();
  }

  /**
   * Detect if the transcript is a soft barge-in request
   */
  detectSoftBarge(transcript: string): SoftBargeResult {
    const normalized = this.normalizeTranscript(transcript);
    const softPatterns =
      SOFT_BARGE_PATTERNS[this.config.language] || SOFT_BARGE_PATTERNS.en;

    for (const pattern of softPatterns) {
      for (const phrase of pattern.phrases) {
        if (
          normalized.startsWith(phrase.toLowerCase()) ||
          normalized === phrase.toLowerCase()
        ) {
          return {
            isSoftBarge: true,
            matchedPattern: phrase,
            requiresFollowUp: pattern.requiresFollowUp,
            language: this.config.language,
          };
        }
      }
    }

    return {
      isSoftBarge: false,
      requiresFollowUp: false,
      language: this.config.language,
    };
  }

  /**
   * Get an appropriate acknowledgment phrase
   */
  getAcknowledgmentPhrase(): string {
    return getRandomAcknowledgment(this.config.language);
  }

  // ==========================================================================
  // Matching Helpers
  // ==========================================================================

  private normalizeTranscript(transcript: string): string {
    return transcript
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s]/gu, "") // Remove punctuation but keep unicode letters
      .replace(/\s+/g, " ");
  }

  private findExactMatch(
    normalized: string,
    duration: number,
  ): { phrase: string; pattern: BackchannelPattern } | null {
    for (const pattern of this.patterns) {
      if (duration > pattern.maxDuration) continue;

      for (const phrase of pattern.phrases) {
        const normalizedPhrase = phrase.toLowerCase();
        if (
          normalized === normalizedPhrase ||
          normalized.startsWith(normalizedPhrase + " ")
        ) {
          return { phrase, pattern };
        }
      }
    }
    return null;
  }

  private findFuzzyMatch(
    normalized: string,
    duration: number,
  ): {
    phrase: string;
    pattern: BackchannelPattern;
    similarity: number;
  } | null {
    let bestMatch: {
      phrase: string;
      pattern: BackchannelPattern;
      similarity: number;
    } | null = null;

    for (const pattern of this.patterns) {
      if (duration > pattern.maxDuration) continue;

      for (const phrase of pattern.phrases) {
        const similarity = this.calculateSimilarity(
          normalized,
          phrase.toLowerCase(),
        );
        if (
          similarity >= this.config.fuzzyThreshold &&
          (!bestMatch || similarity > bestMatch.similarity)
        ) {
          bestMatch = { phrase, pattern, similarity };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    // Use shorter string as the reference
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;

    // Check if shorter is contained in longer
    if (longer.includes(shorter)) {
      return shorter.length / longer.length;
    }

    // Calculate Levenshtein distance
    const matrix: number[][] = [];

    for (let i = 0; i <= shorter.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= longer.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= shorter.length; i++) {
      for (let j = 1; j <= longer.length; j++) {
        const cost = shorter[i - 1] === longer[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }

    const distance = matrix[shorter.length][longer.length];
    return 1 - distance / longer.length;
  }

  // ==========================================================================
  // Scoring and Escalation
  // ==========================================================================

  private calculateScore(
    vadConfidence: number,
    duration: number,
    match: { phrase: string; pattern: BackchannelPattern },
  ): number {
    // Base score from VAD confidence
    let score = vadConfidence;

    // Adjust based on duration (shorter = more likely backchannel)
    const durationFactor = 1 - duration / 1000;
    score *= 0.7 + 0.3 * durationFactor;

    // Apply pattern-specific confidence if available
    if (match.pattern.confidence !== undefined) {
      score *= match.pattern.confidence;
    }

    return Math.max(0, Math.min(1, score));
  }

  private trackAndCheckEscalation(pattern: string): boolean {
    const now = Date.now();
    const timestamps = this.recentDetections.get(pattern) || [];

    // Clean old entries
    const recentTimestamps = timestamps.filter(
      (t) => now - t < this.config.escalationWindowMs,
    );
    recentTimestamps.push(now);

    this.recentDetections.set(pattern, recentTimestamps);

    // Check if escalation threshold reached
    return recentTimestamps.length >= this.config.escalationThreshold;
  }

  private createNegativeResult(): BackchannelResult {
    return {
      isBackchannel: false,
      score: 0,
      language: this.config.language,
      shouldEscalate: false,
    };
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Reset escalation tracking
   */
  reset(): void {
    this.recentDetections.clear();
  }

  /**
   * Get recent detection count for a pattern
   */
  getRecentCount(pattern: string): number {
    const now = Date.now();
    const timestamps = this.recentDetections.get(pattern) || [];
    return timestamps.filter((t) => now - t < this.config.escalationWindowMs)
      .length;
  }

  /**
   * Get total recent backchannel count across all patterns
   */
  getTotalRecentCount(): number {
    const now = Date.now();
    let total = 0;
    for (const timestamps of this.recentDetections.values()) {
      total += timestamps.filter(
        (t) => now - t < this.config.escalationWindowMs,
      ).length;
    }
    return total;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new BackchannelDetector with optional configuration
 */
export function createBackchannelDetector(
  config?: Partial<BackchannelDetectorConfig>,
): BackchannelDetector {
  return new BackchannelDetector(config);
}
