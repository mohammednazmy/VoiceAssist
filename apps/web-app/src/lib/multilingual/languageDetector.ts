/**
 * Language Detector
 *
 * Detects spoken/written language from text transcripts.
 * Uses character patterns, keyword matching, and consistency tracking.
 *
 * Phase 7: Multilingual & Accent Support
 */

import type {
  SupportedLanguage,
  LanguageDetectionResult,
  LanguageDetectorConfig,
} from "./types";
import { DEFAULT_LANGUAGE_DETECTOR_CONFIG } from "./types";

// ============================================================================
// Script Pattern Definitions
// ============================================================================

/**
 * Character patterns for script-based detection
 */
const SCRIPT_PATTERNS: Record<
  string,
  { pattern: RegExp; languages: SupportedLanguage[] }
> = {
  arabic: { pattern: /[\u0600-\u06FF\u0750-\u077F]/, languages: ["ar"] },
  chinese: { pattern: /[\u4E00-\u9FFF]/, languages: ["zh"] },
  japanese: { pattern: /[\u3040-\u309F\u30A0-\u30FF]/, languages: ["ja"] },
  korean: { pattern: /[\uAC00-\uD7AF\u1100-\u11FF]/, languages: ["ko"] },
  cyrillic: { pattern: /[\u0400-\u04FF]/, languages: ["ru"] },
  devanagari: { pattern: /[\u0900-\u097F]/, languages: ["hi"] },
  thai: { pattern: /[\u0E00-\u0E7F]/, languages: ["th"] },
  vietnamese: { pattern: /[\u00C0-\u1EF9]/, languages: ["vi"] },
};

/**
 * Common words for Latin-script language detection
 */
const LANGUAGE_MARKERS: Record<SupportedLanguage, string[]> = {
  en: [
    "the",
    "and",
    "is",
    "it",
    "to",
    "of",
    "in",
    "that",
    "for",
    "you",
    "with",
    "have",
    "this",
    "will",
    "your",
    "from",
  ],
  es: [
    "que",
    "de",
    "el",
    "la",
    "es",
    "en",
    "los",
    "del",
    "por",
    "con",
    "una",
    "para",
    "como",
    "pero",
    "más",
    "este",
  ],
  fr: [
    "le",
    "la",
    "les",
    "de",
    "et",
    "en",
    "un",
    "une",
    "que",
    "qui",
    "pour",
    "dans",
    "avec",
    "sur",
    "est",
    "pas",
  ],
  de: [
    "der",
    "die",
    "das",
    "und",
    "ist",
    "von",
    "mit",
    "den",
    "auch",
    "sich",
    "nicht",
    "auf",
    "ein",
    "für",
    "ich",
  ],
  pt: [
    "de",
    "que",
    "em",
    "um",
    "uma",
    "para",
    "com",
    "por",
    "mais",
    "como",
    "foi",
    "seu",
    "isso",
    "não",
    "você",
  ],
  it: [
    "di",
    "che",
    "il",
    "la",
    "per",
    "un",
    "con",
    "non",
    "sono",
    "una",
    "del",
    "della",
    "questo",
    "anche",
    "più",
  ],
  tr: [
    "ve",
    "bir",
    "bu",
    "için",
    "ile",
    "da",
    "de",
    "ben",
    "sen",
    "ne",
    "var",
    "daha",
    "olan",
    "gibi",
    "çok",
  ],
  nl: [
    "de",
    "het",
    "een",
    "van",
    "en",
    "in",
    "is",
    "dat",
    "op",
    "te",
    "zijn",
    "met",
    "voor",
    "niet",
    "aan",
  ],
  pl: [
    "i",
    "w",
    "nie",
    "na",
    "do",
    "to",
    "jest",
    "się",
    "z",
    "że",
    "co",
    "jak",
    "ale",
    "po",
    "tak",
    "od",
  ],
  vi: [
    "và",
    "của",
    "là",
    "có",
    "không",
    "được",
    "cho",
    "này",
    "để",
    "trong",
    "người",
    "với",
    "từ",
    "một",
    "như",
  ],
  id: [
    "dan",
    "yang",
    "di",
    "ini",
    "untuk",
    "dengan",
    "pada",
    "dari",
    "adalah",
    "tidak",
    "ke",
    "akan",
    "juga",
    "atau",
  ],
  ar: [],
  zh: [],
  ja: [],
  ko: [],
  ru: [],
  hi: [],
  th: [],
};

// ============================================================================
// Language Detector
// ============================================================================

/**
 * Detects language from text transcripts
 */
export class LanguageDetector {
  private config: LanguageDetectorConfig;

  /** Recent detections for consistency checking */
  private detectionHistory: SupportedLanguage[] = [];

  /** User's preferred language */
  private userPreference: SupportedLanguage | null = null;

  /** Statistics */
  private stats = {
    totalDetections: 0,
    detectionsByMethod: {
      character: 0,
      keyword: 0,
      model: 0,
      user_preference: 0,
    },
    avgConfidence: 0,
  };

  constructor(config: Partial<LanguageDetectorConfig> = {}) {
    this.config = { ...DEFAULT_LANGUAGE_DETECTOR_CONFIG, ...config };
  }

  // ==========================================================================
  // Main Detection
  // ==========================================================================

  /**
   * Detect language from transcript
   *
   * @param transcript - Text to analyze
   * @returns Detection result
   */
  detectFromTranscript(transcript: string): LanguageDetectionResult {
    this.stats.totalDetections++;

    // Try script-based detection first (most reliable for non-Latin)
    const scriptResult = this.detectByScript(transcript);
    if (scriptResult.confidence >= 0.8) {
      return this.finalizeResult(scriptResult, "character");
    }

    // Try keyword-based detection for Latin scripts
    const keywordResult = this.detectByKeywords(transcript);
    if (keywordResult.confidence >= this.config.minConfidence) {
      return this.finalizeResult(keywordResult, "keyword");
    }

    // Use script result if available
    if (scriptResult.confidence >= this.config.minConfidence) {
      return this.finalizeResult(scriptResult, "character");
    }

    // Fall back to user preference
    if (this.config.useUserPreference && this.userPreference) {
      return this.finalizeResult(
        {
          detectedLanguage: this.userPreference,
          confidence: 0.6,
          alternativeLanguages: [],
        },
        "user_preference",
      );
    }

    // Default fallback
    return this.finalizeResult(
      {
        detectedLanguage: this.config.defaultLanguage,
        confidence: 0.3,
        alternativeLanguages: [],
      },
      "user_preference",
    );
  }

  /**
   * Finalize detection result with consistency checking
   */
  private finalizeResult(
    result: Omit<LanguageDetectionResult, "method">,
    method: LanguageDetectionResult["method"],
  ): LanguageDetectionResult {
    // Track for consistency
    this.detectionHistory.push(result.detectedLanguage);
    if (this.detectionHistory.length > this.config.consistencyWindow) {
      this.detectionHistory.shift();
    }

    // Boost confidence for consistent detections
    let finalConfidence = result.confidence;
    const consistentCount = this.detectionHistory.filter(
      (l) => l === result.detectedLanguage,
    ).length;
    if (consistentCount >= 3) {
      finalConfidence = Math.min(
        0.95,
        finalConfidence + this.config.consistencyBoost,
      );
    }

    // Update stats
    this.stats.detectionsByMethod[method]++;
    this.stats.avgConfidence =
      0.95 * this.stats.avgConfidence + 0.05 * finalConfidence;

    return {
      detectedLanguage: result.detectedLanguage,
      confidence: finalConfidence,
      alternativeLanguages: result.alternativeLanguages,
      method,
    };
  }

  // ==========================================================================
  // Script-Based Detection
  // ==========================================================================

  /**
   * Detect language by character/script patterns
   */
  private detectByScript(
    text: string,
  ): Omit<LanguageDetectionResult, "method"> {
    const charCounts: Record<string, number> = {};
    let totalChars = 0;

    // Count characters by script
    for (const [scriptName, { pattern }] of Object.entries(SCRIPT_PATTERNS)) {
      const matches = text.match(new RegExp(pattern, "g")) || [];
      charCounts[scriptName] = matches.length;
      totalChars += matches.length;
    }

    // Count Latin characters
    const latinMatches = text.match(/[a-zA-Z]/g) || [];
    charCounts["latin"] = latinMatches.length;
    totalChars += latinMatches.length;

    // Find dominant script
    let dominantScript = "latin";
    let maxCount = charCounts["latin"] || 0;

    for (const [script, count] of Object.entries(charCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantScript = script;
      }
    }

    // Calculate confidence
    const confidence = totalChars > 0 ? maxCount / totalChars : 0;

    // Map script to language
    if (dominantScript === "latin") {
      return {
        detectedLanguage: this.config.defaultLanguage,
        confidence: confidence * 0.5, // Lower confidence for Latin
        alternativeLanguages: [],
      };
    }

    const scriptInfo = SCRIPT_PATTERNS[dominantScript];
    if (scriptInfo && scriptInfo.languages.length > 0) {
      return {
        detectedLanguage: scriptInfo.languages[0],
        confidence: Math.min(0.95, confidence),
        alternativeLanguages: scriptInfo.languages.slice(1).map((lang) => ({
          language: lang,
          confidence: confidence * 0.8,
        })),
      };
    }

    return {
      detectedLanguage: this.config.defaultLanguage,
      confidence: 0.3,
      alternativeLanguages: [],
    };
  }

  // ==========================================================================
  // Keyword-Based Detection
  // ==========================================================================

  /**
   * Detect language by common words/keywords
   */
  private detectByKeywords(
    text: string,
  ): Omit<LanguageDetectionResult, "method"> {
    const normalizedText = text.toLowerCase();
    const words = normalizedText.split(/\s+/);
    const scores: Partial<Record<SupportedLanguage, number>> = {};

    // Score each language
    for (const [lang, markers] of Object.entries(LANGUAGE_MARKERS)) {
      if (markers.length === 0) continue;

      const matchCount = words.filter((w) => markers.includes(w)).length;
      const score = matchCount / Math.max(words.length, 1);
      scores[lang as SupportedLanguage] = score;
    }

    // Find best match
    let bestLang: SupportedLanguage = this.config.defaultLanguage;
    let bestScore = 0;

    for (const [lang, score] of Object.entries(scores)) {
      if ((score ?? 0) > bestScore) {
        bestScore = score ?? 0;
        bestLang = lang as SupportedLanguage;
      }
    }

    // Get alternatives
    const alternatives = Object.entries(scores)
      .filter(([lang, score]) => lang !== bestLang && (score ?? 0) > 0.05)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 3)
      .map(([lang, score]) => ({
        language: lang as SupportedLanguage,
        confidence: Math.min(0.85, (score ?? 0) + 0.4),
      }));

    return {
      detectedLanguage: bestLang,
      confidence: Math.min(0.85, bestScore + 0.4),
      alternativeLanguages: alternatives,
    };
  }

  // ==========================================================================
  // Configuration and State
  // ==========================================================================

  /**
   * Set user's preferred language
   */
  setUserPreference(language: SupportedLanguage): void {
    this.userPreference = language;
  }

  /**
   * Get user's preferred language
   */
  getUserPreference(): SupportedLanguage | null {
    return this.userPreference;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LanguageDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): LanguageDetectorConfig {
    return { ...this.config };
  }

  /**
   * Get detection history
   */
  getHistory(): SupportedLanguage[] {
    return [...this.detectionHistory];
  }

  /**
   * Get most frequent language in history
   */
  getMostFrequentLanguage(): SupportedLanguage {
    if (this.detectionHistory.length === 0) {
      return this.config.defaultLanguage;
    }

    const counts: Partial<Record<SupportedLanguage, number>> = {};
    for (const lang of this.detectionHistory) {
      counts[lang] = (counts[lang] || 0) + 1;
    }

    let maxLang: SupportedLanguage = this.config.defaultLanguage;
    let maxCount = 0;
    for (const [lang, count] of Object.entries(counts)) {
      if ((count ?? 0) > maxCount) {
        maxCount = count ?? 0;
        maxLang = lang as SupportedLanguage;
      }
    }

    return maxLang;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalDetections: number;
    detectionsByMethod: Record<string, number>;
    avgConfidence: number;
    historySize: number;
  } {
    return {
      ...this.stats,
      historySize: this.detectionHistory.length,
    };
  }

  /**
   * Reset state
   */
  reset(): void {
    this.detectionHistory = [];
    this.stats = {
      totalDetections: 0,
      detectionsByMethod: {
        character: 0,
        keyword: 0,
        model: 0,
        user_preference: 0,
      },
      avgConfidence: 0,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new LanguageDetector
 */
export function createLanguageDetector(
  config?: Partial<LanguageDetectorConfig>,
): LanguageDetector {
  return new LanguageDetector(config);
}
