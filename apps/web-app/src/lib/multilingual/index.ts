/**
 * Multilingual Module
 *
 * Orchestrates language detection, accent profiles, and
 * multilingual preferences for voice interaction.
 *
 * Phase 7: Multilingual & Accent Support
 */

// Re-export components
export { LanguageDetector, createLanguageDetector } from "./languageDetector";
export {
  AccentProfileManager,
  createAccentProfileManager,
  ACCENT_PROFILES,
} from "./accentProfiles";
export * from "./types";

import { LanguageDetector } from "./languageDetector";
import { AccentProfileManager } from "./accentProfiles";
import type {
  SupportedLanguage,
  LanguagePreferences,
  LanguageDetectionResult,
  AccentDetectionResult,
  MultilingualEvent,
  MultilingualEventCallback,
  AccentProfile,
} from "./types";
import { DEFAULT_LANGUAGE_PREFERENCES, LANGUAGE_REGISTRY } from "./types";

// ============================================================================
// Multilingual Manager
// ============================================================================

/**
 * Configuration for multilingual manager
 */
export interface MultilingualManagerConfig {
  /** Enable automatic language detection */
  autoDetect: boolean;

  /** Enable automatic language switching */
  autoSwitch: boolean;

  /** Minimum confidence to switch language */
  switchConfidence: number;

  /** Number of consistent detections required to switch */
  switchConsistency: number;

  /** Enable accent detection */
  enableAccentDetection: boolean;

  /** Default language */
  defaultLanguage: SupportedLanguage;
}

/**
 * Default configuration
 */
export const DEFAULT_MULTILINGUAL_CONFIG: MultilingualManagerConfig = {
  autoDetect: true,
  autoSwitch: false,
  switchConfidence: 0.75,
  switchConsistency: 3,
  enableAccentDetection: true,
  defaultLanguage: "en",
};

/**
 * Manager state
 */
export interface MultilingualState {
  /** Current active language */
  currentLanguage: SupportedLanguage;

  /** Current accent profile ID */
  currentAccentId: string | null;

  /** Last detection result */
  lastDetection: LanguageDetectionResult | null;

  /** Last accent detection */
  lastAccentDetection: AccentDetectionResult | null;

  /** Whether auto-switching is enabled */
  autoSwitchEnabled: boolean;

  /** Count of consistent language detections */
  consistentDetections: number;
}

/**
 * High-level manager for multilingual voice support
 */
export class MultilingualManager {
  private config: MultilingualManagerConfig;
  private languageDetector: LanguageDetector;
  private accentManager: AccentProfileManager;
  private preferences: LanguagePreferences;

  /** Current state */
  private state: MultilingualState;

  /** Event callbacks */
  private eventCallbacks: Set<MultilingualEventCallback> = new Set();

  /** Statistics */
  private stats = {
    totalDetections: 0,
    languageSwitches: 0,
    accentDetections: 0,
  };

  constructor(config: Partial<MultilingualManagerConfig> = {}) {
    this.config = { ...DEFAULT_MULTILINGUAL_CONFIG, ...config };
    this.languageDetector = new LanguageDetector({
      defaultLanguage: this.config.defaultLanguage,
    });
    this.accentManager = new AccentProfileManager();
    this.preferences = { ...DEFAULT_LANGUAGE_PREFERENCES };

    this.state = this.createInitialState();

    // Set default accent profile
    const defaultProfile = this.accentManager.getDefaultProfile(
      this.config.defaultLanguage,
    );
    if (defaultProfile) {
      this.accentManager.setActiveProfile(defaultProfile.id);
      this.state.currentAccentId = defaultProfile.id;
    }
  }

  // ==========================================================================
  // State Initialization
  // ==========================================================================

  /**
   * Create initial state
   */
  private createInitialState(): MultilingualState {
    return {
      currentLanguage: this.config.defaultLanguage,
      currentAccentId: null,
      lastDetection: null,
      lastAccentDetection: null,
      autoSwitchEnabled: this.config.autoSwitch,
      consistentDetections: 0,
    };
  }

  // ==========================================================================
  // Language Detection
  // ==========================================================================

  /**
   * Process transcript for language detection
   *
   * @param transcript - Text to analyze
   * @param prosodicFeatures - Optional prosodic features for accent detection
   * @returns Detection result
   */
  processTranscript(
    transcript: string,
    prosodicFeatures?: {
      avgPitch: number;
      pitchVariance: number;
      speakingRate: number;
      pauseDuration: number;
    },
  ): {
    language: LanguageDetectionResult;
    accent: AccentDetectionResult | null;
  } {
    this.stats.totalDetections++;

    // Detect language
    const languageResult =
      this.languageDetector.detectFromTranscript(transcript);
    this.state.lastDetection = languageResult;

    // Check for language switch
    this.checkLanguageSwitch(languageResult);

    // Emit detection event
    this.emitEvent({
      type: "language_detected",
      result: languageResult,
    });

    // Detect accent if enabled and features provided
    let accentResult: AccentDetectionResult | null = null;
    if (this.config.enableAccentDetection && prosodicFeatures) {
      accentResult = this.accentManager.detectAccent(
        languageResult.detectedLanguage,
        prosodicFeatures,
      );
      this.state.lastAccentDetection = accentResult;
      this.stats.accentDetections++;

      this.emitEvent({
        type: "accent_detected",
        result: accentResult,
      });
    }

    return {
      language: languageResult,
      accent: accentResult,
    };
  }

  /**
   * Check if we should switch language
   */
  private checkLanguageSwitch(result: LanguageDetectionResult): void {
    if (!this.state.autoSwitchEnabled) {
      return;
    }

    // Check if detected language is different from current
    if (result.detectedLanguage === this.state.currentLanguage) {
      this.state.consistentDetections = 0;
      return;
    }

    // Check confidence threshold
    if (result.confidence < this.config.switchConfidence) {
      this.state.consistentDetections = 0;
      return;
    }

    // Increment consistent detections
    this.state.consistentDetections++;

    // Check if we have enough consistent detections
    if (this.state.consistentDetections >= this.config.switchConsistency) {
      this.switchLanguage(result.detectedLanguage);
      this.state.consistentDetections = 0;
    }
  }

  /**
   * Switch to a new language
   */
  switchLanguage(language: SupportedLanguage): void {
    const previousLanguage = this.state.currentLanguage;

    if (language === previousLanguage) {
      return;
    }

    this.state.currentLanguage = language;
    this.stats.languageSwitches++;

    // Update detector preference
    this.languageDetector.setUserPreference(language);

    // Switch to default accent for new language
    const defaultProfile = this.accentManager.getDefaultProfile(language);
    if (defaultProfile) {
      this.switchAccent(defaultProfile.id);
    }

    // Emit event
    this.emitEvent({
      type: "language_changed",
      from: previousLanguage,
      to: language,
    });
  }

  /**
   * Switch to a new accent profile
   */
  switchAccent(accentId: string): void {
    const previousAccent = this.state.currentAccentId;

    if (accentId === previousAccent) {
      return;
    }

    if (this.accentManager.setActiveProfile(accentId)) {
      this.state.currentAccentId = accentId;

      if (previousAccent) {
        this.emitEvent({
          type: "accent_changed",
          from: previousAccent,
          to: accentId,
        });
      }
    }
  }

  // ==========================================================================
  // Preferences
  // ==========================================================================

  /**
   * Set user language preferences
   */
  setPreferences(preferences: Partial<LanguagePreferences>): void {
    this.preferences = { ...this.preferences, ...preferences };

    // Apply primary language
    if (preferences.primaryLanguage) {
      this.switchLanguage(preferences.primaryLanguage);
    }

    // Apply accent profile
    if (preferences.accentProfileId) {
      this.switchAccent(preferences.accentProfileId);
    }

    // Update auto-switch
    if (preferences.autoSwitch !== undefined) {
      this.state.autoSwitchEnabled = preferences.autoSwitch;
    }

    // Update detector
    if (preferences.autoDetect !== undefined) {
      this.languageDetector.updateConfig({
        useUserPreference: !preferences.autoDetect,
      });
    }

    // Emit event
    this.emitEvent({
      type: "preferences_updated",
      preferences: { ...this.preferences },
    });
  }

  /**
   * Get current preferences
   */
  getPreferences(): LanguagePreferences {
    return { ...this.preferences };
  }

  // ==========================================================================
  // Language Info
  // ==========================================================================

  /**
   * Get info for a language
   */
  getLanguageInfo(language: SupportedLanguage) {
    return LANGUAGE_REGISTRY[language];
  }

  /**
   * Get all supported languages
   */
  getSupportedLanguages(): SupportedLanguage[] {
    return Object.keys(LANGUAGE_REGISTRY) as SupportedLanguage[];
  }

  /**
   * Check if a language supports TTS
   */
  supportsTts(language: SupportedLanguage): boolean {
    return LANGUAGE_REGISTRY[language]?.ttsSupported ?? false;
  }

  /**
   * Check if a language supports STT
   */
  supportsStt(language: SupportedLanguage): boolean {
    return LANGUAGE_REGISTRY[language]?.sttSupported ?? false;
  }

  /**
   * Get text direction for language
   */
  getTextDirection(language: SupportedLanguage): "ltr" | "rtl" {
    return LANGUAGE_REGISTRY[language]?.direction ?? "ltr";
  }

  // ==========================================================================
  // Accent Profiles
  // ==========================================================================

  /**
   * Get available accent profiles for current language
   */
  getAvailableAccents(): AccentProfile[] {
    return this.accentManager.getProfilesForLanguage(
      this.state.currentLanguage,
    );
  }

  /**
   * Get all accent profiles
   */
  getAllAccents(): AccentProfile[] {
    return this.accentManager.getAllProfiles();
  }

  /**
   * Get current accent profile
   */
  getCurrentAccent(): AccentProfile | null {
    return this.accentManager.getActiveProfile();
  }

  /**
   * Get VAD adjustments for current accent
   */
  getVadAdjustments() {
    return this.accentManager.getVadAdjustments();
  }

  /**
   * Get prosodic adjustments for current accent
   */
  getProsodicAdjustments() {
    return this.accentManager.getProsodicAdjustments();
  }

  /**
   * Get additional backchannel phrases for current accent
   */
  getBackchannelAdditions(): string[] {
    return this.accentManager.getBackchannelAdditions();
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  /**
   * Subscribe to multilingual events
   */
  onEvent(callback: MultilingualEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  /**
   * Emit an event
   */
  private emitEvent(event: MultilingualEvent): void {
    this.eventCallbacks.forEach((callback) => callback(event));
  }

  // ==========================================================================
  // State and Configuration
  // ==========================================================================

  /**
   * Get current state
   */
  getState(): MultilingualState {
    return { ...this.state };
  }

  /**
   * Get current language
   */
  getCurrentLanguage(): SupportedLanguage {
    return this.state.currentLanguage;
  }

  /**
   * Get configuration
   */
  getConfig(): MultilingualManagerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MultilingualManagerConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.autoSwitch !== undefined) {
      this.state.autoSwitchEnabled = config.autoSwitch;
    }

    if (config.defaultLanguage !== undefined) {
      this.languageDetector.updateConfig({
        defaultLanguage: config.defaultLanguage,
      });
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalDetections: number;
    languageSwitches: number;
    accentDetections: number;
    detectorStats: ReturnType<LanguageDetector["getStats"]>;
  } {
    return {
      ...this.stats,
      detectorStats: this.languageDetector.getStats(),
    };
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Reset state
   */
  reset(): void {
    this.state = this.createInitialState();
    this.languageDetector.reset();
    this.accentManager.reset();
    this.stats = {
      totalDetections: 0,
      languageSwitches: 0,
      accentDetections: 0,
    };
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.eventCallbacks.clear();
    this.reset();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new MultilingualManager
 */
export function createMultilingualManager(
  config?: Partial<MultilingualManagerConfig>,
): MultilingualManager {
  return new MultilingualManager(config);
}
