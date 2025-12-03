/**
 * Sentiment Analyzer
 *
 * Detects user sentiment from transcripts using keyword-based
 * analysis and pattern matching.
 *
 * Phase 10: Advanced Conversation Management
 */

import type { Sentiment, SentimentResult } from "./types";
import { NEUTRAL_SENTIMENT } from "./types";

// ============================================================================
// Sentiment Lexicons
// ============================================================================

/**
 * English sentiment keywords
 */
const ENGLISH_LEXICON = {
  positive: {
    words: [
      "great",
      "awesome",
      "excellent",
      "perfect",
      "love",
      "wonderful",
      "amazing",
      "fantastic",
      "brilliant",
      "thank",
      "thanks",
      "appreciate",
      "helpful",
      "good",
      "nice",
      "cool",
      "yes",
      "exactly",
      "right",
    ],
    weight: 1.0,
  },
  negative: {
    words: [
      "bad",
      "terrible",
      "awful",
      "horrible",
      "hate",
      "wrong",
      "worse",
      "worst",
      "no",
      "not",
      "never",
      "disappointed",
      "annoyed",
      "angry",
    ],
    weight: 1.0,
  },
  confused: {
    words: [
      "confused",
      "unclear",
      "lost",
      "understand",
      "what",
      "huh",
      "sorry",
      "repeat",
      "again",
      "mean",
      "explain",
      "clarify",
    ],
    weight: 0.8,
  },
  frustrated: {
    words: [
      "frustrated",
      "frustrating",
      "annoying",
      "stupid",
      "dumb",
      "ugh",
      "sigh",
      "come on",
      "seriously",
      "already",
      "still",
      "why",
    ],
    weight: 1.2,
  },
  excited: {
    words: [
      "excited",
      "wow",
      "amazing",
      "incredible",
      "awesome",
      "fantastic",
      "yay",
      "woohoo",
      "finally",
    ],
    weight: 1.1,
  },
  curious: {
    words: [
      "curious",
      "interesting",
      "wonder",
      "how",
      "why",
      "what if",
      "tell me",
      "more about",
      "explain",
    ],
    weight: 0.9,
  },
};

/**
 * Arabic sentiment keywords
 */
const ARABIC_LEXICON = {
  positive: {
    words: [
      "ممتاز",
      "رائع",
      "جميل",
      "شكراً",
      "مشكور",
      "جزاك الله",
      "بارك الله",
      "أحسنت",
      "صحيح",
      "نعم",
      "تمام",
    ],
    weight: 1.0,
  },
  negative: {
    words: ["سيء", "خطأ", "غلط", "لا", "مش", "مو", "أبداً", "للأسف", "مزعج"],
    weight: 1.0,
  },
  confused: {
    words: ["مش فاهم", "ما فهمت", "يعني", "كيف", "ليش", "وضّح", "اشرح", "أعد"],
    weight: 0.8,
  },
  frustrated: {
    words: ["محبط", "مزعج", "يعني", "خلاص", "كفاية", "مستحيل"],
    weight: 1.2,
  },
  excited: {
    words: ["واو", "يا سلام", "رهيب", "خرافي", "أخيراً"],
    weight: 1.1,
  },
  curious: {
    words: ["أتساءل", "غريب", "مثير", "كيف", "لماذا", "قل لي", "أخبرني"],
    weight: 0.9,
  },
};

/**
 * Phrase patterns that indicate sentiment
 */
const PHRASE_PATTERNS: Array<{
  pattern: RegExp;
  sentiment: Sentiment;
  weight: number;
}> = [
  // Frustrated patterns
  {
    pattern: /i (don't|cant|can't) understand/i,
    sentiment: "frustrated",
    weight: 1.5,
  },
  {
    pattern: /you('re| are) not (listening|helping)/i,
    sentiment: "frustrated",
    weight: 1.8,
  },
  {
    pattern: /this (isn't|is not) (working|helpful)/i,
    sentiment: "frustrated",
    weight: 1.5,
  },
  {
    pattern: /i (said|told you|already)/i,
    sentiment: "frustrated",
    weight: 1.2,
  },

  // Confused patterns
  {
    pattern: /what (do you mean|does that mean)/i,
    sentiment: "confused",
    weight: 1.3,
  },
  { pattern: /i('m| am) (confused|lost)/i, sentiment: "confused", weight: 1.5 },
  {
    pattern: /can you (explain|clarify|repeat)/i,
    sentiment: "confused",
    weight: 1.2,
  },

  // Positive patterns
  {
    pattern: /that('s| is) (great|perfect|exactly)/i,
    sentiment: "positive",
    weight: 1.5,
  },
  { pattern: /thank(s| you)( so much)?/i, sentiment: "positive", weight: 1.3 },
  {
    pattern: /i (love|like) (this|that|it)/i,
    sentiment: "positive",
    weight: 1.4,
  },

  // Curious patterns
  { pattern: /tell me (more|about)/i, sentiment: "curious", weight: 1.3 },
  { pattern: /how (does|do|can|would)/i, sentiment: "curious", weight: 1.1 },
  { pattern: /what (if|about|happens)/i, sentiment: "curious", weight: 1.1 },
];

// ============================================================================
// Sentiment Analyzer
// ============================================================================

/**
 * Analyzes user sentiment from text
 */
export class SentimentAnalyzer {
  private language: string;
  private lexicon: typeof ENGLISH_LEXICON;

  /** Sentiment history for smoothing */
  private history: SentimentResult[] = [];
  private readonly maxHistorySize = 5;

  constructor(language: string = "en") {
    this.language = language;
    this.lexicon = language.startsWith("ar") ? ARABIC_LEXICON : ENGLISH_LEXICON;
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Analyze sentiment from text
   */
  analyze(text: string): SentimentResult {
    if (!text || text.trim().length === 0) {
      return NEUTRAL_SENTIMENT;
    }

    const normalizedText = text.toLowerCase().trim();

    // Get scores from different methods
    const keywordScores = this.analyzeKeywords(normalizedText);
    const patternScores = this.analyzePatterns(normalizedText);

    // Combine scores
    const combinedScores = this.combineScores(keywordScores, patternScores);

    // Find dominant sentiment
    const result = this.selectDominantSentiment(combinedScores, normalizedText);

    // Apply temporal smoothing
    const smoothedResult = this.applySmoothing(result);

    return smoothedResult;
  }

  /**
   * Set language for analysis
   */
  setLanguage(language: string): void {
    this.language = language;
    this.lexicon = language.startsWith("ar") ? ARABIC_LEXICON : ENGLISH_LEXICON;
  }

  /**
   * Reset analysis history
   */
  reset(): void {
    this.history = [];
  }

  // ==========================================================================
  // Analysis Methods
  // ==========================================================================

  /**
   * Analyze sentiment using keyword matching
   */
  private analyzeKeywords(text: string): Map<Sentiment, number> {
    const scores = new Map<Sentiment, number>();
    const keywords: string[] = [];

    for (const [sentiment, data] of Object.entries(this.lexicon)) {
      let score = 0;

      for (const word of data.words) {
        // Check for word (with word boundaries)
        const regex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, "gi");
        const matches = text.match(regex);

        if (matches) {
          score += matches.length * data.weight;
          keywords.push(word);
        }
      }

      if (score > 0) {
        scores.set(sentiment as Sentiment, score);
      }
    }

    return scores;
  }

  /**
   * Analyze sentiment using phrase patterns
   */
  private analyzePatterns(text: string): Map<Sentiment, number> {
    const scores = new Map<Sentiment, number>();

    for (const { pattern, sentiment, weight } of PHRASE_PATTERNS) {
      if (pattern.test(text)) {
        const current = scores.get(sentiment) || 0;
        scores.set(sentiment, current + weight);
      }
    }

    return scores;
  }

  /**
   * Combine scores from different methods
   */
  private combineScores(
    keywordScores: Map<Sentiment, number>,
    patternScores: Map<Sentiment, number>,
  ): Map<Sentiment, number> {
    const combined = new Map<Sentiment, number>();

    // Merge keyword scores
    for (const [sentiment, score] of keywordScores) {
      combined.set(sentiment, score);
    }

    // Add pattern scores (with higher weight)
    for (const [sentiment, score] of patternScores) {
      const current = combined.get(sentiment) || 0;
      combined.set(sentiment, current + score * 1.5);
    }

    return combined;
  }

  /**
   * Select the dominant sentiment from scores
   */
  private selectDominantSentiment(
    scores: Map<Sentiment, number>,
    text: string,
  ): SentimentResult {
    if (scores.size === 0) {
      return NEUTRAL_SENTIMENT;
    }

    // Find highest scoring sentiment
    let maxScore = 0;
    let dominantSentiment: Sentiment = "neutral";
    let secondHighestScore = 0;
    let secondarySentiment: Sentiment | undefined;

    for (const [sentiment, score] of scores) {
      if (score > maxScore) {
        secondHighestScore = maxScore;
        secondarySentiment =
          dominantSentiment !== "neutral" ? dominantSentiment : undefined;
        maxScore = score;
        dominantSentiment = sentiment;
      } else if (score > secondHighestScore) {
        secondHighestScore = score;
        secondarySentiment = sentiment;
      }
    }

    // Calculate confidence based on score margin
    const totalScore = Array.from(scores.values()).reduce((a, b) => a + b, 0);
    const confidence = Math.min(0.95, maxScore / Math.max(1, totalScore));

    // Calculate valence and arousal
    const valence = this.calculateValence(dominantSentiment, confidence);
    const arousal = this.calculateArousal(dominantSentiment, confidence);

    // Extract keywords from text that matched
    const keywords = this.extractMatchedKeywords(text);

    return {
      sentiment: dominantSentiment,
      confidence,
      valence,
      arousal,
      secondarySentiment,
      keywords,
    };
  }

  /**
   * Calculate valence (negative to positive)
   */
  private calculateValence(sentiment: Sentiment, confidence: number): number {
    const valenceMap: Record<Sentiment, number> = {
      positive: 0.7,
      excited: 0.8,
      curious: 0.3,
      neutral: 0,
      confused: -0.2,
      frustrated: -0.6,
      negative: -0.7,
    };

    return valenceMap[sentiment] * confidence;
  }

  /**
   * Calculate arousal (calm to excited)
   */
  private calculateArousal(sentiment: Sentiment, confidence: number): number {
    const arousalMap: Record<Sentiment, number> = {
      excited: 0.9,
      frustrated: 0.8,
      positive: 0.6,
      curious: 0.5,
      neutral: 0.4,
      confused: 0.5,
      negative: 0.6,
    };

    return arousalMap[sentiment] * confidence;
  }

  /**
   * Extract keywords that matched from text
   */
  private extractMatchedKeywords(text: string): string[] {
    const keywords: string[] = [];

    for (const data of Object.values(this.lexicon)) {
      for (const word of data.words) {
        const regex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, "gi");
        if (regex.test(text)) {
          keywords.push(word);
        }
      }
    }

    return [...new Set(keywords)].slice(0, 5);
  }

  /**
   * Apply temporal smoothing to reduce noise
   */
  private applySmoothing(result: SentimentResult): SentimentResult {
    this.history.push(result);

    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    // Weight recent results more heavily
    let totalWeight = 0;
    let smoothedValence = 0;
    let smoothedArousal = 0;

    for (let i = 0; i < this.history.length; i++) {
      const weight = (i + 1) / this.history.length;
      smoothedValence += this.history[i].valence * weight;
      smoothedArousal += this.history[i].arousal * weight;
      totalWeight += weight;
    }

    // If current sentiment is strong, keep it
    if (result.confidence > 0.7) {
      return result;
    }

    // Otherwise return smoothed result
    return {
      ...result,
      valence: smoothedValence / totalWeight,
      arousal: smoothedArousal / totalWeight,
    };
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new sentiment analyzer
 */
export function createSentimentAnalyzer(language?: string): SentimentAnalyzer {
  return new SentimentAnalyzer(language);
}
