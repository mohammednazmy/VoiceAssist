/**
 * Barge-In Classification
 *
 * Classifies user interruptions during AI speech into:
 * - backchannel: "uh huh", "yeah" - continue AI
 * - soft_barge: "wait", "hold on" - pause AI
 * - hard_barge: sustained speech - stop AI
 * - unclear: need more audio
 *
 * Natural Conversation Flow: Phase 2.2 - Backchannel Detection
 */

import { voiceLog } from "../../lib/logger";
import {
  BargeInClassification,
  BargeInConfig,
  SupportedLanguage,
} from "./types";

// ============================================================================
// Types
// ============================================================================

export interface ClassificationInput {
  /** Transcribed text from STT */
  transcript: string;
  /** Duration of speech in milliseconds */
  durationMs: number;
  /** Language of the transcript */
  language: SupportedLanguage;
  /** Whether AI audio was playing when speech started */
  aiWasPlaying: boolean;
  /** VAD confidence level (0-1) */
  vadConfidence?: number;
  /** Average energy level of audio (0-1) */
  energyLevel?: number;
}

export interface ClassificationResult {
  /** The classification type */
  classification: BargeInClassification;
  /** Confidence in the classification (0-1) */
  confidence: number;
  /** Reason for the classification */
  reason: string;
  /** Matched phrase if backchannel */
  matchedPhrase?: string;
  /** Fuzzy match distance if applicable */
  matchDistance?: number;
}

// ============================================================================
// Soft Barge Keywords
// ============================================================================

/**
 * Keywords that indicate a soft barge (user wants AI to pause, not stop)
 */
const SOFT_BARGE_KEYWORDS: Map<SupportedLanguage, string[]> = new Map([
  [
    "en",
    [
      "wait",
      "hold on",
      "one moment",
      "just a sec",
      "pause",
      "stop",
      "hang on",
      "one second",
    ],
  ],
  ["ar", ["انتظر", "لحظة", "توقف", "دقيقة"]],
  ["es", ["espera", "un momento", "para", "detente"]],
  ["fr", ["attends", "un moment", "pause", "arrête"]],
  ["de", ["warte", "moment", "stopp", "halt"]],
  ["zh", ["等等", "等一下", "稍等", "停"]],
  ["ja", ["ちょっと待って", "待って", "ストップ"]],
  ["ko", ["잠깐", "기다려", "멈춰"]],
  ["pt", ["espera", "um momento", "para", "calma"]],
  ["ru", ["подожди", "секунду", "стоп", "погоди"]],
  ["hi", ["रुको", "एक मिनट", "थोड़ा रुको"]],
  ["tr", ["bekle", "bir dakika", "dur"]],
]);

// ============================================================================
// Levenshtein Distance for Fuzzy Matching
// ============================================================================

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching of backchannels with STT errors
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Check if text matches a phrase with fuzzy tolerance
 * @param text - Input text
 * @param phrase - Target phrase
 * @param maxDistance - Maximum Levenshtein distance allowed
 * @returns Match result with distance
 */
function fuzzyMatch(
  text: string,
  phrase: string,
  maxDistance: number = 2,
): { matches: boolean; distance: number } {
  const normalizedText = text.toLowerCase().trim();
  const normalizedPhrase = phrase.toLowerCase().trim();

  // Exact match
  if (normalizedText === normalizedPhrase) {
    return { matches: true, distance: 0 };
  }

  // Contains match (for short phrases)
  if (
    normalizedPhrase.length <= 4 &&
    normalizedText.includes(normalizedPhrase)
  ) {
    return { matches: true, distance: 0 };
  }

  // Fuzzy match
  const distance = levenshteinDistance(normalizedText, normalizedPhrase);

  // Scale max distance with phrase length (longer phrases get more tolerance)
  const scaledMaxDistance = Math.min(
    maxDistance,
    Math.floor(normalizedPhrase.length / 3),
  );
  const effectiveMaxDistance = Math.max(scaledMaxDistance, 1);

  return {
    matches: distance <= effectiveMaxDistance,
    distance,
  };
}

// ============================================================================
// Main Classification Function
// ============================================================================

/**
 * Classify a barge-in event based on transcript and duration
 *
 * Classification logic:
 * 1. If duration < backchannelMaxDuration and matches backchannel phrase -> backchannel
 * 2. If matches soft barge keyword -> soft_barge
 * 3. If duration >= hardBargeMinDuration -> hard_barge
 * 4. If duration short but no match -> unclear (need more audio)
 *
 * @param input - Classification input
 * @param config - Barge-in configuration
 * @returns Classification result
 */
export function classifyBargeIn(
  input: ClassificationInput,
  config: BargeInConfig,
): ClassificationResult {
  const { transcript, durationMs, language, aiWasPlaying, vadConfidence } =
    input;

  const normalizedTranscript = transcript.toLowerCase().trim();

  voiceLog.debug(
    `[ClassifyBargeIn] Input: "${normalizedTranscript}" (${durationMs}ms, lang=${language})`,
  );

  // If AI wasn't playing, this is just normal speech, not a barge-in
  if (!aiWasPlaying) {
    return {
      classification: "hard_barge",
      confidence: 1.0,
      reason: "Speech started before AI audio",
    };
  }

  // Empty transcript with short duration - need more audio
  if (!normalizedTranscript && durationMs < config.speechConfirmMs) {
    return {
      classification: "unclear",
      confidence: 0.3,
      reason: "No transcript yet, duration too short",
    };
  }

  // Check for backchannel phrases
  const backchannelPhrases = config.backchannelPhrases.get(language) || [];
  for (const phrase of backchannelPhrases) {
    const match = fuzzyMatch(normalizedTranscript, phrase, 2);
    if (match.matches && durationMs <= config.backchannelMaxDuration) {
      voiceLog.debug(
        `[ClassifyBargeIn] Backchannel match: "${phrase}" (distance=${match.distance})`,
      );
      return {
        classification: "backchannel",
        confidence: match.distance === 0 ? 0.95 : 0.8 - match.distance * 0.1,
        reason: `Matched backchannel phrase "${phrase}"`,
        matchedPhrase: phrase,
        matchDistance: match.distance,
      };
    }
  }

  // Check for soft barge keywords
  const softBargeKeywords = SOFT_BARGE_KEYWORDS.get(language) || [];
  for (const keyword of softBargeKeywords) {
    const match = fuzzyMatch(normalizedTranscript, keyword, 2);
    if (match.matches) {
      voiceLog.debug(
        `[ClassifyBargeIn] Soft barge match: "${keyword}" (distance=${match.distance})`,
      );
      return {
        classification: "soft_barge",
        confidence: match.distance === 0 ? 0.9 : 0.75 - match.distance * 0.1,
        reason: `Matched soft barge keyword "${keyword}"`,
        matchedPhrase: keyword,
        matchDistance: match.distance,
      };
    }
  }

  // Duration-based classification
  if (durationMs >= config.hardBargeMinDuration) {
    // Long enough to be a hard barge
    const confidence = Math.min(
      0.95,
      0.7 + (durationMs - config.hardBargeMinDuration) / 1000,
    );
    return {
      classification: "hard_barge",
      confidence,
      reason: `Speech duration ${durationMs}ms exceeds threshold ${config.hardBargeMinDuration}ms`,
    };
  }

  // Short duration, no phrase match
  if (durationMs < config.speechConfirmMs) {
    return {
      classification: "unclear",
      confidence: 0.4,
      reason: `Duration ${durationMs}ms too short to classify`,
    };
  }

  // Medium duration, no match - could be soft or hard, lean toward soft
  // if VAD confidence is moderate
  if (vadConfidence !== undefined && vadConfidence < 0.8) {
    return {
      classification: "soft_barge",
      confidence: 0.6,
      reason: `Medium duration (${durationMs}ms) with moderate VAD confidence (${vadConfidence.toFixed(2)})`,
    };
  }

  // Default to unclear for ambiguous cases
  return {
    classification: "unclear",
    confidence: 0.5,
    reason: `Ambiguous: ${durationMs}ms duration, no phrase match`,
  };
}

/**
 * Check if a transcript is likely a backchannel
 * Fast path for quick checks without full classification
 *
 * @param transcript - Transcribed text
 * @param language - Language code
 * @param backchannelPhrases - Map of backchannel phrases by language
 * @returns True if likely a backchannel
 */
export function isLikelyBackchannel(
  transcript: string,
  language: SupportedLanguage,
  backchannelPhrases: Map<SupportedLanguage, string[]>,
): boolean {
  const normalizedTranscript = transcript.toLowerCase().trim();
  const phrases = backchannelPhrases.get(language) || [];

  for (const phrase of phrases) {
    // Quick exact match or contains check
    if (
      normalizedTranscript === phrase.toLowerCase() ||
      normalizedTranscript.includes(phrase.toLowerCase())
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Get all backchannel phrases for a language
 * Useful for UI display or configuration
 */
export function getBackchannelPhrases(
  language: SupportedLanguage,
  config: BargeInConfig,
): string[] {
  return config.backchannelPhrases.get(language) || [];
}

/**
 * Get all soft barge keywords for a language
 */
export function getSoftBargeKeywords(language: SupportedLanguage): string[] {
  return SOFT_BARGE_KEYWORDS.get(language) || [];
}
