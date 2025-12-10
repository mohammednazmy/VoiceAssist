/**
 * Personalization Module
 *
 * Orchestrates adaptive personalization for voice barge-in,
 * including calibration, behavior tracking, and preference management.
 *
 * Phase 8: Adaptive Personalization
 */

// Re-export components
export {
  CalibrationManager,
  createCalibrationManager,
} from "./calibrationManager";
export { BehaviorTracker, createBehaviorTracker } from "./behaviorTracker";
export { PreferenceStore, createPreferenceStore } from "./preferenceStore";
export * from "./types";

import { CalibrationManager } from "./calibrationManager";
import { BehaviorTracker } from "./behaviorTracker";
import { PreferenceStore } from "./preferenceStore";
import type {
  PersonalizationState,
  PersonalizationConfig,
  PersonalizationEvent,
  PersonalizationEventCallback,
  CalibrationResult,
  CalibrationProgress,
  UserBargeInPreferences,
  BargeInType,
  BehaviorStats,
} from "./types";
import { DEFAULT_PERSONALIZATION_CONFIG, EMPTY_BEHAVIOR_STATS } from "./types";

// ============================================================================
// Personalization Manager
// ============================================================================

/**
 * High-level manager for adaptive personalization
 */
export class PersonalizationManager {
  private config: PersonalizationConfig;

  /** Component instances */
  private calibrationManager: CalibrationManager;
  private behaviorTracker: BehaviorTracker;
  private preferenceStore: PreferenceStore;

  /** Current state */
  private state: PersonalizationState;

  /** Event callbacks */
  private eventCallbacks: Set<PersonalizationEventCallback> = new Set();

  /** User ID */
  private userId: string;

  /** Whether initialized */
  private initialized: boolean = false;

  constructor(
    userId: string = "anonymous",
    config: Partial<PersonalizationConfig> = {},
  ) {
    this.userId = userId;
    this.config = { ...DEFAULT_PERSONALIZATION_CONFIG, ...config };

    // Initialize components
    this.calibrationManager = new CalibrationManager();
    this.behaviorTracker = new BehaviorTracker(userId);
    this.preferenceStore = new PreferenceStore(userId, this.config);

    // Initialize state
    this.state = {
      calibrated: false,
      calibrationResult: null,
      preferences: null,
      behaviorStats: this.cloneBehaviorStats(EMPTY_BEHAVIOR_STATS),
      isLearning: this.config.autoAdapt,
      lastUpdate: Date.now(),
    };
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the personalization system
   */
  async initialize(syncEndpoint?: string): Promise<void> {
    // Initialize preference store with optional backend sync
    const preferences = await this.preferenceStore.initialize(syncEndpoint);

    // Update state
    this.state.preferences = preferences;
    this.state.calibrated = preferences.calibrationHistory.length > 0;
    this.state.behaviorStats = this.behaviorTracker.getStats();

    // Use most recent calibration
    if (preferences.calibrationHistory.length > 0) {
      this.state.calibrationResult =
        preferences.calibrationHistory[
          preferences.calibrationHistory.length - 1
        ];
    }

    // Subscribe to preference changes
    this.preferenceStore.onChange((prefs, _changedKeys) => {
      this.state.preferences = prefs;
      this.emitEvent({ type: "preferences_updated", preferences: prefs });
    });

    // Start behavior tracking session
    this.behaviorTracker.startSession();

    this.initialized = true;
  }

  // ==========================================================================
  // Calibration
  // ==========================================================================

  /**
   * Start voice calibration
   */
  async runCalibration(): Promise<CalibrationResult> {
    this.emitEvent({ type: "calibration_started" });

    try {
      const result = await this.calibrationManager.startCalibration(
        (progress: CalibrationProgress) => {
          this.emitEvent({ type: "calibration_progress", progress });
        },
      );

      // Store calibration result
      this.preferenceStore.addCalibrationResult(result);
      this.state.calibrated = true;
      this.state.calibrationResult = result;

      this.emitEvent({ type: "calibration_complete", result });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.emitEvent({ type: "calibration_error", error: errorMessage });
      throw error;
    }
  }

  /**
   * Cancel ongoing calibration
   */
  cancelCalibration(): void {
    this.calibrationManager.cancel();
  }

  /**
   * Check if calibration is in progress
   */
  isCalibrating(): boolean {
    return this.calibrationManager.getState() !== "idle";
  }

  // ==========================================================================
  // Behavior Recording
  // ==========================================================================

  /**
   * Record a barge-in event
   */
  recordBargeIn(
    type: BargeInType,
    duration: number,
    vadConfidence: number,
    options: {
      transcript?: string;
      wasCorrect?: boolean;
      aiWasSpeaking?: boolean;
      contextType?:
        | "greeting"
        | "question"
        | "statement"
        | "command"
        | "unknown";
    } = {},
  ): void {
    const event = this.behaviorTracker.recordEvent(
      type,
      duration,
      vadConfidence,
      options,
    );

    // Update state
    this.state.behaviorStats = this.behaviorTracker.getStats();
    this.state.lastUpdate = Date.now();

    // Emit event
    this.emitEvent({ type: "barge_in_recorded", event });

    // Adapt thresholds if enabled
    if (this.state.isLearning) {
      this.adaptThresholds();
    }
  }

  /**
   * Mark a barge-in as correctly or incorrectly classified
   */
  markBargeInCorrectness(eventId: string, wasCorrect: boolean): void {
    this.behaviorTracker.markEventCorrectness(eventId, wasCorrect);
    this.state.behaviorStats = this.behaviorTracker.getStats();

    // Adapt if incorrect classification
    if (!wasCorrect && this.state.isLearning) {
      this.adaptThresholds();
    }
  }

  // ==========================================================================
  // Threshold Adaptation
  // ==========================================================================

  /**
   * Enable or disable adaptive learning
   */
  setLearningEnabled(enabled: boolean): void {
    this.state.isLearning = enabled;
    this.preferenceStore.update({ adaptiveLearning: enabled });
    this.emitEvent({ type: "learning_enabled", enabled });
  }

  /**
   * Adapt thresholds based on behavior
   */
  private adaptThresholds(): void {
    if (!this.state.preferences) return;

    const stats = this.state.behaviorStats;

    // Need minimum events for adaptation
    if (stats.totalBargeIns < this.config.minEventsForAdaptation) {
      return;
    }

    // Adapt VAD sensitivity
    const currentVad = this.state.preferences.vadSensitivity;
    const recommendedVad =
      this.behaviorTracker.getRecommendedVadSensitivity(currentVad);

    if (Math.abs(recommendedVad - currentVad) > 0.01) {
      this.emitEvent({
        type: "threshold_adapted",
        oldValue: currentVad,
        newValue: recommendedVad,
      });
      this.preferenceStore.setVadSensitivity(recommendedVad);
    }

    // Adapt backchannel frequency
    const recommendedFrequency =
      this.behaviorTracker.getRecommendedBackchannelTolerance();
    if (recommendedFrequency !== this.state.preferences.backchannelFrequency) {
      this.preferenceStore.setBackchannelFrequency(recommendedFrequency);
    }
  }

  // ==========================================================================
  // Recommendations
  // ==========================================================================

  /**
   * Get recommended VAD threshold
   */
  getRecommendedVadThreshold(): number {
    // Prefer calibration result if recent
    if (this.state.calibrationResult) {
      const calibrationAge =
        Date.now() - this.state.calibrationResult.timestamp;
      const oneWeek = 7 * 24 * 60 * 60 * 1000;

      if (calibrationAge < oneWeek) {
        return this.state.calibrationResult.recommendedVadThreshold;
      }
    }

    // Fall back to preference
    return this.state.preferences?.vadSensitivity ?? 0.5;
  }

  /**
   * Get user's preferred backchannel phrases
   */
  getUserPreferredBackchannels(): string[] {
    const learned = this.behaviorTracker.getTopBackchannelPhrases(10);
    const custom = this.state.preferences?.customBackchannels || [];

    // Combine and dedupe
    return [...new Set([...learned, ...custom])];
  }

  /**
   * Get detected behavior patterns
   */
  getDetectedPatterns() {
    return this.behaviorTracker.detectPatterns();
  }

  // ==========================================================================
  // State Access
  // ==========================================================================

  /**
   * Get current personalization state
   */
  getState(): PersonalizationState {
    return {
      ...this.state,
      behaviorStats: this.cloneBehaviorStats(this.state.behaviorStats),
    };
  }

  /**
   * Get current preferences
   */
  getPreferences(): UserBargeInPreferences {
    return this.preferenceStore.getPreferences();
  }

  /**
   * Get behavior statistics
   */
  getBehaviorStats(): BehaviorStats {
    return this.behaviorTracker.getStats();
  }

  /**
   * Check if user has been calibrated
   */
  isCalibrated(): boolean {
    return this.state.calibrated;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ==========================================================================
  // Preference Updates
  // ==========================================================================

  /**
   * Update preferences
   */
  updatePreferences(updates: Partial<UserBargeInPreferences>): void {
    this.preferenceStore.update(updates);
  }

  /**
   * Set VAD sensitivity
   */
  setVadSensitivity(sensitivity: number): void {
    this.preferenceStore.setVadSensitivity(sensitivity);
  }

  /**
   * Set preferred language
   */
  setPreferredLanguage(language: string): void {
    this.preferenceStore.setPreferredLanguage(language);
  }

  /**
   * Add custom backchannel phrase
   */
  addCustomBackchannel(phrase: string): void {
    this.preferenceStore.addCustomBackchannel(phrase);
  }

  /**
   * Remove custom backchannel phrase
   */
  removeCustomBackchannel(phrase: string): void {
    this.preferenceStore.removeCustomBackchannel(phrase);
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  /**
   * Subscribe to personalization events
   */
  onEvent(callback: PersonalizationEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  /**
   * Emit an event
   */
  private emitEvent(event: PersonalizationEvent): void {
    this.eventCallbacks.forEach((callback) => callback(event));
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Reset all personalization data
   */
  reset(): void {
    this.behaviorTracker.reset();
    this.preferenceStore.reset();

    this.state = {
      calibrated: false,
      calibrationResult: null,
      preferences: this.preferenceStore.getPreferences(),
      behaviorStats: this.cloneBehaviorStats(EMPTY_BEHAVIOR_STATS),
      isLearning: this.config.autoAdapt,
      lastUpdate: Date.now(),
    };
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    // End current session
    this.behaviorTracker.endSession();

    // Clean up preference store
    this.preferenceStore.dispose();

    // Clear callbacks
    this.eventCallbacks.clear();

    this.initialized = false;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Clone behavior stats
   */
  private cloneBehaviorStats(stats: BehaviorStats): BehaviorStats {
    return {
      ...stats,
      preferredBackchannelPhrases: new Map(stats.preferredBackchannelPhrases),
      hourlyPatterns: [...stats.hourlyPatterns],
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new PersonalizationManager
 */
export function createPersonalizationManager(
  userId?: string,
  config?: Partial<PersonalizationConfig>,
): PersonalizationManager {
  return new PersonalizationManager(userId, config);
}

/**
 * Create and initialize a PersonalizationManager
 */
export async function createInitializedPersonalizationManager(
  userId?: string,
  config?: Partial<PersonalizationConfig>,
  syncEndpoint?: string,
): Promise<PersonalizationManager> {
  const manager = new PersonalizationManager(userId, config);
  await manager.initialize(syncEndpoint);
  return manager;
}
