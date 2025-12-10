/**
 * Multilingual Support Types
 *
 * Type definitions for multilingual voice support.
 * Includes language detection, accent profiles, and preferences.
 *
 * Phase 7: Multilingual & Accent Support
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Supported languages
 */
export type SupportedLanguage =
  | "en"
  | "ar"
  | "es"
  | "fr"
  | "de"
  | "zh"
  | "ja"
  | "ko"
  | "ru"
  | "hi"
  | "pt"
  | "it"
  | "tr"
  | "nl"
  | "pl"
  | "vi"
  | "th"
  | "id";

/**
 * Language metadata
 */
export interface LanguageInfo {
  /** Language code (ISO 639-1) */
  code: SupportedLanguage;

  /** Native name */
  nativeName: string;

  /** English name */
  englishName: string;

  /** Script type */
  script:
    | "latin"
    | "arabic"
    | "cjk"
    | "cyrillic"
    | "devanagari"
    | "thai"
    | "other";

  /** Text direction */
  direction: "ltr" | "rtl";

  /** Whether TTS is supported */
  ttsSupported: boolean;

  /** Whether STT is supported */
  sttSupported: boolean;
}

/**
 * Language detection result
 */
export interface LanguageDetectionResult {
  /** Detected language */
  detectedLanguage: SupportedLanguage;

  /** Confidence (0-1) */
  confidence: number;

  /** Alternative languages with confidence */
  alternativeLanguages: Array<{
    language: SupportedLanguage;
    confidence: number;
  }>;

  /** Detection method used */
  method: "character" | "keyword" | "model" | "user_preference";
}

/**
 * Configuration for language detector
 */
export interface LanguageDetectorConfig {
  /** Minimum confidence to accept detection */
  minConfidence: number;

  /** Window size for consistency checking */
  consistencyWindow: number;

  /** Use user preference as fallback */
  useUserPreference: boolean;

  /** Boost confidence for consistent detections */
  consistencyBoost: number;

  /** Default language when uncertain */
  defaultLanguage: SupportedLanguage;
}

/**
 * Default language detector configuration
 */
export const DEFAULT_LANGUAGE_DETECTOR_CONFIG: LanguageDetectorConfig = {
  minConfidence: 0.5,
  consistencyWindow: 5,
  useUserPreference: true,
  consistencyBoost: 0.1,
  defaultLanguage: "en",
};

// ============================================================================
// Accent Profile Types
// ============================================================================

/**
 * Accent profile for language/region specific tuning
 */
export interface AccentProfile {
  /** Unique identifier */
  id: string;

  /** Base language */
  language: SupportedLanguage;

  /** Region/variant */
  region: string;

  /** Display name */
  displayName: string;

  /** VAD adjustments */
  vadAdjustments: {
    /** Speech threshold delta */
    speechThresholdDelta: number;

    /** Minimum speech duration delta (ms) */
    minSpeechDurationDelta: number;

    /** Silence threshold delta (ms) */
    silenceThresholdDelta: number;
  };

  /** Prosodic adjustments */
  prosodicAdjustments: {
    /** Pitch range multiplier */
    pitchRangeMultiplier: number;

    /** Speaking rate multiplier */
    speakingRateMultiplier: number;
  };

  /** Additional backchannel phrases */
  backchannelAdditions?: string[];

  /** Notes about this accent */
  notes?: string;
}

/**
 * Accent detection result
 */
export interface AccentDetectionResult {
  /** Detected accent profile ID */
  accentId: string;

  /** Confidence (0-1) */
  confidence: number;

  /** Features used for detection */
  features: {
    pitchPattern: string;
    speakingRate: string;
    vowelPatterns: string;
  };
}

// ============================================================================
// Language Preferences Types
// ============================================================================

/**
 * User language preferences
 */
export interface LanguagePreferences {
  /** Primary/preferred language */
  primaryLanguage: SupportedLanguage;

  /** Secondary languages */
  secondaryLanguages: SupportedLanguage[];

  /** Selected accent profile */
  accentProfileId?: string;

  /** Auto-detect language */
  autoDetect: boolean;

  /** Auto-switch languages */
  autoSwitch: boolean;

  /** TTS voice preferences per language */
  ttsVoices: Partial<Record<SupportedLanguage, string>>;

  /** STT model preferences per language */
  sttModels: Partial<Record<SupportedLanguage, string>>;
}

/**
 * Default language preferences
 */
export const DEFAULT_LANGUAGE_PREFERENCES: LanguagePreferences = {
  primaryLanguage: "en",
  secondaryLanguages: [],
  autoDetect: true,
  autoSwitch: false,
  ttsVoices: {},
  sttModels: {},
};

// ============================================================================
// Event Types
// ============================================================================

/**
 * Multilingual events
 */
export type MultilingualEvent =
  | { type: "language_detected"; result: LanguageDetectionResult }
  | { type: "language_changed"; from: SupportedLanguage; to: SupportedLanguage }
  | { type: "accent_detected"; result: AccentDetectionResult }
  | { type: "accent_changed"; from: string; to: string }
  | { type: "preferences_updated"; preferences: LanguagePreferences };

/**
 * Callback for multilingual events
 */
export type MultilingualEventCallback = (event: MultilingualEvent) => void;

// ============================================================================
// Language Registry
// ============================================================================

/**
 * Registry of supported languages with metadata
 */
export const LANGUAGE_REGISTRY: Record<SupportedLanguage, LanguageInfo> = {
  en: {
    code: "en",
    nativeName: "English",
    englishName: "English",
    script: "latin",
    direction: "ltr",
    ttsSupported: true,
    sttSupported: true,
  },
  ar: {
    code: "ar",
    nativeName: "العربية",
    englishName: "Arabic",
    script: "arabic",
    direction: "rtl",
    ttsSupported: true,
    sttSupported: true,
  },
  es: {
    code: "es",
    nativeName: "Español",
    englishName: "Spanish",
    script: "latin",
    direction: "ltr",
    ttsSupported: true,
    sttSupported: true,
  },
  fr: {
    code: "fr",
    nativeName: "Français",
    englishName: "French",
    script: "latin",
    direction: "ltr",
    ttsSupported: true,
    sttSupported: true,
  },
  de: {
    code: "de",
    nativeName: "Deutsch",
    englishName: "German",
    script: "latin",
    direction: "ltr",
    ttsSupported: true,
    sttSupported: true,
  },
  zh: {
    code: "zh",
    nativeName: "中文",
    englishName: "Chinese",
    script: "cjk",
    direction: "ltr",
    ttsSupported: true,
    sttSupported: true,
  },
  ja: {
    code: "ja",
    nativeName: "日本語",
    englishName: "Japanese",
    script: "cjk",
    direction: "ltr",
    ttsSupported: true,
    sttSupported: true,
  },
  ko: {
    code: "ko",
    nativeName: "한국어",
    englishName: "Korean",
    script: "cjk",
    direction: "ltr",
    ttsSupported: true,
    sttSupported: true,
  },
  ru: {
    code: "ru",
    nativeName: "Русский",
    englishName: "Russian",
    script: "cyrillic",
    direction: "ltr",
    ttsSupported: true,
    sttSupported: true,
  },
  hi: {
    code: "hi",
    nativeName: "हिन्दी",
    englishName: "Hindi",
    script: "devanagari",
    direction: "ltr",
    ttsSupported: true,
    sttSupported: true,
  },
  pt: {
    code: "pt",
    nativeName: "Português",
    englishName: "Portuguese",
    script: "latin",
    direction: "ltr",
    ttsSupported: true,
    sttSupported: true,
  },
  it: {
    code: "it",
    nativeName: "Italiano",
    englishName: "Italian",
    script: "latin",
    direction: "ltr",
    ttsSupported: true,
    sttSupported: true,
  },
  tr: {
    code: "tr",
    nativeName: "Türkçe",
    englishName: "Turkish",
    script: "latin",
    direction: "ltr",
    ttsSupported: true,
    sttSupported: true,
  },
  nl: {
    code: "nl",
    nativeName: "Nederlands",
    englishName: "Dutch",
    script: "latin",
    direction: "ltr",
    ttsSupported: true,
    sttSupported: true,
  },
  pl: {
    code: "pl",
    nativeName: "Polski",
    englishName: "Polish",
    script: "latin",
    direction: "ltr",
    ttsSupported: true,
    sttSupported: true,
  },
  vi: {
    code: "vi",
    nativeName: "Tiếng Việt",
    englishName: "Vietnamese",
    script: "latin",
    direction: "ltr",
    ttsSupported: true,
    sttSupported: true,
  },
  th: {
    code: "th",
    nativeName: "ไทย",
    englishName: "Thai",
    script: "thai",
    direction: "ltr",
    ttsSupported: true,
    sttSupported: true,
  },
  id: {
    code: "id",
    nativeName: "Bahasa Indonesia",
    englishName: "Indonesian",
    script: "latin",
    direction: "ltr",
    ttsSupported: true,
    sttSupported: true,
  },
};
