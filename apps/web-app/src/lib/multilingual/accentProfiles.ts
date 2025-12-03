/**
 * Accent Profiles
 *
 * Defines accent-specific tuning profiles for VAD and
 * prosodic analysis across different language variants.
 *
 * Phase 7: Multilingual & Accent Support
 */

import type {
  SupportedLanguage,
  AccentProfile,
  AccentDetectionResult,
} from "./types";

// ============================================================================
// Accent Profile Definitions
// ============================================================================

/**
 * Predefined accent profiles with tuning parameters
 */
export const ACCENT_PROFILES: AccentProfile[] = [
  // English variants
  {
    id: "en-US",
    language: "en",
    region: "US",
    displayName: "American English",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: 0,
      silenceThresholdDelta: 0,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.0,
      speakingRateMultiplier: 1.0,
    },
    notes: "Standard baseline profile",
  },
  {
    id: "en-GB",
    language: "en",
    region: "GB",
    displayName: "British English",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: 0,
      silenceThresholdDelta: 50, // Slightly longer pauses
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 0.95,
      speakingRateMultiplier: 0.95,
    },
    notes: "Slightly more formal pacing",
  },
  {
    id: "en-AU",
    language: "en",
    region: "AU",
    displayName: "Australian English",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: 0,
      silenceThresholdDelta: 0,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.1, // More varied intonation
      speakingRateMultiplier: 1.05,
    },
    notes: "Higher rising terminal (uptalk)",
  },
  {
    id: "en-IN",
    language: "en",
    region: "IN",
    displayName: "Indian English",
    vadAdjustments: {
      speechThresholdDelta: -0.02, // Slightly more sensitive
      minSpeechDurationDelta: -20,
      silenceThresholdDelta: -50, // Shorter pauses expected
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.15,
      speakingRateMultiplier: 1.1,
    },
    backchannelAdditions: ["achha", "haan", "theek hai"],
    notes: "Faster pace, more pitch variation",
  },

  // Arabic variants
  {
    id: "ar-SA",
    language: "ar",
    region: "SA",
    displayName: "Saudi Arabic",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: 0,
      silenceThresholdDelta: 100, // Longer natural pauses
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.0,
      speakingRateMultiplier: 0.9,
    },
    backchannelAdditions: ["ايوه", "والله"],
    notes: "Measured pacing with emphasis",
  },
  {
    id: "ar-EG",
    language: "ar",
    region: "EG",
    displayName: "Egyptian Arabic",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: -30,
      silenceThresholdDelta: -50,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.2,
      speakingRateMultiplier: 1.15,
    },
    backchannelAdditions: ["اه", "ماشي", "تمام"],
    notes: "Faster, more expressive",
  },
  {
    id: "ar-MA",
    language: "ar",
    region: "MA",
    displayName: "Moroccan Arabic",
    vadAdjustments: {
      speechThresholdDelta: 0.02,
      minSpeechDurationDelta: 0,
      silenceThresholdDelta: 0,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.1,
      speakingRateMultiplier: 1.1,
    },
    backchannelAdditions: ["واخا", "آه"],
    notes: "French influence in rhythm",
  },

  // Spanish variants
  {
    id: "es-ES",
    language: "es",
    region: "ES",
    displayName: "Castilian Spanish",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: 0,
      silenceThresholdDelta: 0,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.0,
      speakingRateMultiplier: 1.0,
    },
    notes: "Standard baseline for Spanish",
  },
  {
    id: "es-MX",
    language: "es",
    region: "MX",
    displayName: "Mexican Spanish",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: 0,
      silenceThresholdDelta: 50,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 0.95,
      speakingRateMultiplier: 0.95,
    },
    backchannelAdditions: ["orale", "andale", "sale"],
    notes: "Slightly slower, softer intonation",
  },
  {
    id: "es-AR",
    language: "es",
    region: "AR",
    displayName: "Argentine Spanish",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: -20,
      silenceThresholdDelta: -30,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.15,
      speakingRateMultiplier: 1.1,
    },
    backchannelAdditions: ["dale", "che"],
    notes: "Italian-influenced rhythm",
  },

  // French variants
  {
    id: "fr-FR",
    language: "fr",
    region: "FR",
    displayName: "Metropolitan French",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: 0,
      silenceThresholdDelta: 0,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.0,
      speakingRateMultiplier: 1.0,
    },
    notes: "Standard baseline for French",
  },
  {
    id: "fr-CA",
    language: "fr",
    region: "CA",
    displayName: "Canadian French",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: 0,
      silenceThresholdDelta: 30,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.05,
      speakingRateMultiplier: 0.95,
    },
    backchannelAdditions: ["là", "tsé"],
    notes: "Slightly different vowel timing",
  },

  // German variants
  {
    id: "de-DE",
    language: "de",
    region: "DE",
    displayName: "Standard German",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: 0,
      silenceThresholdDelta: 50,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 0.9,
      speakingRateMultiplier: 0.95,
    },
    notes: "Precise articulation, measured pace",
  },
  {
    id: "de-AT",
    language: "de",
    region: "AT",
    displayName: "Austrian German",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: 0,
      silenceThresholdDelta: 30,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.05,
      speakingRateMultiplier: 0.9,
    },
    backchannelAdditions: ["passt", "geh"],
    notes: "Softer consonants, melodic",
  },

  // Chinese variants
  {
    id: "zh-CN",
    language: "zh",
    region: "CN",
    displayName: "Mandarin Chinese",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: -50, // Shorter syllables
      silenceThresholdDelta: 0,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.3, // Tonal language
      speakingRateMultiplier: 1.0,
    },
    backchannelAdditions: ["哦", "对对对", "嗯嗯"],
    notes: "Tonal pitch patterns important",
  },
  {
    id: "zh-TW",
    language: "zh",
    region: "TW",
    displayName: "Taiwanese Mandarin",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: -30,
      silenceThresholdDelta: 0,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.25,
      speakingRateMultiplier: 0.95,
    },
    notes: "Slightly softer tones",
  },

  // Japanese
  {
    id: "ja-JP",
    language: "ja",
    region: "JP",
    displayName: "Japanese",
    vadAdjustments: {
      speechThresholdDelta: -0.02,
      minSpeechDurationDelta: -30,
      silenceThresholdDelta: 100, // Respect for pauses
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.1,
      speakingRateMultiplier: 1.0,
    },
    backchannelAdditions: ["ああ", "そうそう", "ほんと"],
    notes: "Frequent backchanneling expected",
  },

  // Korean
  {
    id: "ko-KR",
    language: "ko",
    region: "KR",
    displayName: "Korean",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: -20,
      silenceThresholdDelta: 50,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.15,
      speakingRateMultiplier: 1.05,
    },
    backchannelAdditions: ["아", "그래그래", "진짜"],
    notes: "Sentence-final particles important",
  },

  // Russian
  {
    id: "ru-RU",
    language: "ru",
    region: "RU",
    displayName: "Russian",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: 0,
      silenceThresholdDelta: 30,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 0.95,
      speakingRateMultiplier: 1.0,
    },
    backchannelAdditions: ["ага", "угу", "ну да"],
    notes: "Strong consonant clusters",
  },

  // Hindi
  {
    id: "hi-IN",
    language: "hi",
    region: "IN",
    displayName: "Hindi",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: -30,
      silenceThresholdDelta: -30,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.2,
      speakingRateMultiplier: 1.1,
    },
    backchannelAdditions: ["अच्छा", "हां", "ठीक है"],
    notes: "Expressive intonation",
  },

  // Portuguese variants
  {
    id: "pt-BR",
    language: "pt",
    region: "BR",
    displayName: "Brazilian Portuguese",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: -20,
      silenceThresholdDelta: -30,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.15,
      speakingRateMultiplier: 1.1,
    },
    backchannelAdditions: ["é", "tá", "beleza"],
    notes: "Rhythmic, expressive",
  },
  {
    id: "pt-PT",
    language: "pt",
    region: "PT",
    displayName: "European Portuguese",
    vadAdjustments: {
      speechThresholdDelta: 0.02,
      minSpeechDurationDelta: 0,
      silenceThresholdDelta: 0,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 0.95,
      speakingRateMultiplier: 0.9,
    },
    notes: "More clipped vowels",
  },

  // Italian
  {
    id: "it-IT",
    language: "it",
    region: "IT",
    displayName: "Italian",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: -20,
      silenceThresholdDelta: -30,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.2,
      speakingRateMultiplier: 1.1,
    },
    backchannelAdditions: ["sì sì", "certo", "ecco"],
    notes: "Expressive, melodic",
  },

  // Turkish
  {
    id: "tr-TR",
    language: "tr",
    region: "TR",
    displayName: "Turkish",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: 0,
      silenceThresholdDelta: 0,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.0,
      speakingRateMultiplier: 1.0,
    },
    backchannelAdditions: ["evet", "tamam", "hı hı"],
    notes: "Vowel harmony affects rhythm",
  },

  // Dutch
  {
    id: "nl-NL",
    language: "nl",
    region: "NL",
    displayName: "Dutch",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: 0,
      silenceThresholdDelta: 30,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 0.95,
      speakingRateMultiplier: 0.95,
    },
    backchannelAdditions: ["ja ja", "precies", "inderdaad"],
    notes: "Similar to German rhythm",
  },

  // Polish
  {
    id: "pl-PL",
    language: "pl",
    region: "PL",
    displayName: "Polish",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: 0,
      silenceThresholdDelta: 20,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.0,
      speakingRateMultiplier: 1.0,
    },
    backchannelAdditions: ["tak tak", "no", "aha"],
    notes: "Consistent penultimate stress",
  },

  // Vietnamese
  {
    id: "vi-VN",
    language: "vi",
    region: "VN",
    displayName: "Vietnamese",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: -40,
      silenceThresholdDelta: 0,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.4, // Six tones
      speakingRateMultiplier: 1.0,
    },
    backchannelAdditions: ["ừ", "vâng", "dạ"],
    notes: "Tonal language with 6 tones",
  },

  // Thai
  {
    id: "th-TH",
    language: "th",
    region: "TH",
    displayName: "Thai",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: -30,
      silenceThresholdDelta: 0,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.35, // Five tones
      speakingRateMultiplier: 1.0,
    },
    backchannelAdditions: ["ครับ", "ค่ะ", "อือ"],
    notes: "Tonal with 5 tones, polite particles",
  },

  // Indonesian
  {
    id: "id-ID",
    language: "id",
    region: "ID",
    displayName: "Indonesian",
    vadAdjustments: {
      speechThresholdDelta: 0,
      minSpeechDurationDelta: 0,
      silenceThresholdDelta: 0,
    },
    prosodicAdjustments: {
      pitchRangeMultiplier: 1.0,
      speakingRateMultiplier: 1.0,
    },
    backchannelAdditions: ["ya", "iya", "oh begitu"],
    notes: "Relatively flat intonation",
  },
];

// ============================================================================
// Accent Profile Manager
// ============================================================================

/**
 * Manages accent profiles and provides tuning parameters
 */
export class AccentProfileManager {
  /** All available profiles indexed by ID */
  private profilesById: Map<string, AccentProfile>;

  /** Profiles indexed by language */
  private profilesByLanguage: Map<SupportedLanguage, AccentProfile[]>;

  /** Currently active profile */
  private activeProfile: AccentProfile | null = null;

  /** Detection history for consistency */
  private detectionHistory: string[] = [];

  constructor() {
    this.profilesById = new Map();
    this.profilesByLanguage = new Map();

    // Index all profiles
    for (const profile of ACCENT_PROFILES) {
      this.profilesById.set(profile.id, profile);

      if (!this.profilesByLanguage.has(profile.language)) {
        this.profilesByLanguage.set(profile.language, []);
      }
      this.profilesByLanguage.get(profile.language)!.push(profile);
    }
  }

  // ==========================================================================
  // Profile Access
  // ==========================================================================

  /**
   * Get profile by ID
   */
  getProfile(id: string): AccentProfile | undefined {
    return this.profilesById.get(id);
  }

  /**
   * Get all profiles for a language
   */
  getProfilesForLanguage(language: SupportedLanguage): AccentProfile[] {
    return this.profilesByLanguage.get(language) || [];
  }

  /**
   * Get default profile for a language
   */
  getDefaultProfile(language: SupportedLanguage): AccentProfile | undefined {
    const profiles = this.profilesByLanguage.get(language);
    return profiles?.[0];
  }

  /**
   * Get all available profiles
   */
  getAllProfiles(): AccentProfile[] {
    return ACCENT_PROFILES;
  }

  /**
   * Get currently active profile
   */
  getActiveProfile(): AccentProfile | null {
    return this.activeProfile;
  }

  /**
   * Set active profile by ID
   */
  setActiveProfile(id: string): boolean {
    const profile = this.profilesById.get(id);
    if (profile) {
      this.activeProfile = profile;
      return true;
    }
    return false;
  }

  // ==========================================================================
  // Accent Detection
  // ==========================================================================

  /**
   * Detect accent from prosodic features
   *
   * This is a simplified detection based on pitch and rate patterns.
   * A production system would use more sophisticated acoustic analysis.
   */
  detectAccent(
    language: SupportedLanguage,
    features: {
      avgPitch: number;
      pitchVariance: number;
      speakingRate: number;
      pauseDuration: number;
    },
  ): AccentDetectionResult {
    const profiles = this.getProfilesForLanguage(language);
    if (profiles.length === 0) {
      return {
        accentId: `${language}-XX`,
        confidence: 0.3,
        features: {
          pitchPattern: "unknown",
          speakingRate: "normal",
          vowelPatterns: "unknown",
        },
      };
    }

    // Score each profile based on feature match
    let bestProfile = profiles[0];
    let bestScore = 0;

    for (const profile of profiles) {
      let score = 0;

      // Compare pitch range
      const expectedPitchVar =
        50 * profile.prosodicAdjustments.pitchRangeMultiplier;
      const pitchDiff = Math.abs(features.pitchVariance - expectedPitchVar);
      score += Math.max(0, 1 - pitchDiff / 50);

      // Compare speaking rate
      const expectedRate =
        4.5 * profile.prosodicAdjustments.speakingRateMultiplier;
      const rateDiff = Math.abs(features.speakingRate - expectedRate);
      score += Math.max(0, 1 - rateDiff / 2);

      // Compare pause duration
      const expectedPause = 300 + profile.vadAdjustments.silenceThresholdDelta;
      const pauseDiff = Math.abs(features.pauseDuration - expectedPause);
      score += Math.max(0, 1 - pauseDiff / 200);

      if (score > bestScore) {
        bestScore = score;
        bestProfile = profile;
      }
    }

    // Normalize score to confidence
    const confidence = Math.min(0.95, bestScore / 3 + 0.2);

    // Determine pitch pattern
    let pitchPattern = "normal";
    if (features.pitchVariance > 60) {
      pitchPattern = "high_variation";
    } else if (features.pitchVariance < 30) {
      pitchPattern = "low_variation";
    }

    // Determine speaking rate category
    let speakingRateCategory = "normal";
    if (features.speakingRate > 5.5) {
      speakingRateCategory = "fast";
    } else if (features.speakingRate < 3.5) {
      speakingRateCategory = "slow";
    }

    // Track detection for consistency
    this.detectionHistory.push(bestProfile.id);
    if (this.detectionHistory.length > 10) {
      this.detectionHistory.shift();
    }

    return {
      accentId: bestProfile.id,
      confidence,
      features: {
        pitchPattern,
        speakingRate: speakingRateCategory,
        vowelPatterns: "detected", // Would need more analysis
      },
    };
  }

  /**
   * Get most frequently detected accent
   */
  getMostFrequentAccent(): string | null {
    if (this.detectionHistory.length === 0) {
      return null;
    }

    const counts: Record<string, number> = {};
    for (const id of this.detectionHistory) {
      counts[id] = (counts[id] || 0) + 1;
    }

    let maxId: string | null = null;
    let maxCount = 0;
    for (const [id, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        maxId = id;
      }
    }

    return maxId;
  }

  // ==========================================================================
  // VAD Tuning
  // ==========================================================================

  /**
   * Get VAD adjustments for current or specified profile
   */
  getVadAdjustments(profileId?: string): AccentProfile["vadAdjustments"] {
    const profile = profileId
      ? this.profilesById.get(profileId)
      : this.activeProfile;

    if (!profile) {
      return {
        speechThresholdDelta: 0,
        minSpeechDurationDelta: 0,
        silenceThresholdDelta: 0,
      };
    }

    return profile.vadAdjustments;
  }

  /**
   * Get prosodic adjustments for current or specified profile
   */
  getProsodicAdjustments(
    profileId?: string,
  ): AccentProfile["prosodicAdjustments"] {
    const profile = profileId
      ? this.profilesById.get(profileId)
      : this.activeProfile;

    if (!profile) {
      return {
        pitchRangeMultiplier: 1.0,
        speakingRateMultiplier: 1.0,
      };
    }

    return profile.prosodicAdjustments;
  }

  /**
   * Get additional backchannel phrases for profile
   */
  getBackchannelAdditions(profileId?: string): string[] {
    const profile = profileId
      ? this.profilesById.get(profileId)
      : this.activeProfile;

    return profile?.backchannelAdditions || [];
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  /**
   * Reset detection history
   */
  reset(): void {
    this.detectionHistory = [];
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new AccentProfileManager
 */
export function createAccentProfileManager(): AccentProfileManager {
  return new AccentProfileManager();
}
