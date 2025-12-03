/**
 * Personalization Types
 *
 * Type definitions for adaptive personalization system.
 * Includes calibration, preferences, and behavior tracking types.
 *
 * Phase 8: Adaptive Personalization
 */

// ============================================================================
// Calibration Types
// ============================================================================

/**
 * Result from voice calibration session
 */
export interface CalibrationResult {
  /** Unique calibration ID */
  id: string;

  /** Timestamp of calibration */
  timestamp: number;

  /** Measured background noise level (dB) */
  backgroundNoiseLevel: number;

  /** Measured voice energy during calibration */
  voiceEnergyLevel: number;

  /** Recommended VAD threshold based on calibration */
  recommendedVadThreshold: number;

  /** Recommended silence threshold based on calibration */
  recommendedSilenceThreshold: number;

  /** Measured pitch range */
  pitchRange: {
    min: number;
    max: number;
    mean: number;
  };

  /** Measured speaking rate (syllables per second) */
  speakingRate: number;

  /** Calibration quality score (0-1) */
  qualityScore: number;

  /** Duration of calibration session (ms) */
  duration: number;

  /** Environment type detected */
  environment: "quiet" | "moderate" | "noisy" | "outdoor";
}

/**
 * Calibration session state
 */
export type CalibrationState =
  | "idle"
  | "preparing"
  | "measuring_noise"
  | "waiting_speech"
  | "measuring_voice"
  | "analyzing"
  | "complete"
  | "error";

/**
 * Calibration progress event
 */
export interface CalibrationProgress {
  state: CalibrationState;
  progress: number; // 0-100
  message: string;
  instruction?: string;
}

// ============================================================================
// User Preferences Types
// ============================================================================

/**
 * Visual feedback style preferences
 */
export type VisualFeedbackStyle =
  | "pulse"
  | "glow"
  | "ring"
  | "bar"
  | "wave"
  | "minimal"
  | "none";

/**
 * Haptic feedback intensity
 */
export type HapticIntensity = "light" | "medium" | "strong" | "none";

/**
 * Audio feedback type
 */
export type AudioFeedbackType = "tone" | "click" | "voice" | "none";

/**
 * Backchannel frequency preference
 */
export type BackchannelFrequency = "low" | "normal" | "high";

/**
 * User feedback preferences
 */
export interface FeedbackPreferences {
  /** Enable visual feedback */
  visualFeedbackEnabled: boolean;

  /** Visual feedback style */
  visualFeedbackStyle: VisualFeedbackStyle;

  /** Enable haptic feedback */
  hapticFeedbackEnabled: boolean;

  /** Haptic feedback intensity */
  hapticIntensity: HapticIntensity;

  /** Enable audio feedback */
  audioFeedbackEnabled: boolean;

  /** Audio feedback type */
  audioFeedbackType: AudioFeedbackType;

  /** Show voice prompt after hard barge-in */
  voicePromptAfterHardBarge: boolean;
}

/**
 * User barge-in preferences
 */
export interface UserBargeInPreferences {
  /** User identifier */
  userId: string;

  /** VAD sensitivity (0-1) */
  vadSensitivity: number;

  /** Silence threshold for end-of-speech detection */
  silenceThreshold: number;

  /** Preferred language */
  preferredLanguage: string;

  /** Backchannel frequency setting */
  backchannelFrequency: BackchannelFrequency;

  /** Feedback preferences */
  feedbackPreferences: FeedbackPreferences;

  /** History of calibration results */
  calibrationHistory: CalibrationResult[];

  /** Last updated timestamp */
  lastUpdated: number;

  /** Custom backchannel phrases added by user */
  customBackchannels?: string[];

  /** Preferred interruption mode */
  interruptionMode?: "conservative" | "balanced" | "aggressive";

  /** Enable learning from behavior */
  adaptiveLearning?: boolean;
}

/**
 * Default feedback preferences
 */
export const DEFAULT_FEEDBACK_PREFERENCES: FeedbackPreferences = {
  visualFeedbackEnabled: true,
  visualFeedbackStyle: "pulse",
  hapticFeedbackEnabled: true,
  hapticIntensity: "medium",
  audioFeedbackEnabled: false,
  audioFeedbackType: "none",
  voicePromptAfterHardBarge: false,
};

// ============================================================================
// Behavior Tracking Types
// ============================================================================

/**
 * Types of barge-in events
 */
export type BargeInType = "backchannel" | "soft_barge" | "hard_barge";

/**
 * Individual barge-in event record
 */
export interface BargeInEvent {
  /** Event ID */
  id: string;

  /** Timestamp */
  timestamp: number;

  /** Type of barge-in */
  type: BargeInType;

  /** Duration in milliseconds */
  duration: number;

  /** Transcript if available */
  transcript?: string;

  /** VAD confidence at detection */
  vadConfidence: number;

  /** Whether this was classified correctly */
  wasCorrect?: boolean;

  /** AI was speaking when barge-in occurred */
  aiWasSpeaking: boolean;

  /** Context of the conversation */
  contextType?: "greeting" | "question" | "statement" | "command" | "unknown";
}

/**
 * Aggregated behavior statistics
 */
export interface BehaviorStats {
  /** Total number of barge-ins recorded */
  totalBargeIns: number;

  /** Count of backchannels */
  backchannelCount: number;

  /** Count of soft barge-ins */
  softBargeCount: number;

  /** Count of hard barge-ins */
  hardBargeCount: number;

  /** Estimated false positive rate */
  falsePositiveRate: number;

  /** Average barge-in duration (ms) */
  averageBargeInDuration: number;

  /** User's preferred backchannel phrases (phrase -> count) */
  preferredBackchannelPhrases: Map<string, number>;

  /** Number of sessions tracked */
  sessionCount: number;

  /** Average session duration (ms) */
  averageSessionDuration: number;

  /** Time of day patterns (hour -> barge-in count) */
  hourlyPatterns: number[];

  /** Words per minute estimate */
  estimatedWpm: number;

  /** Preferred speaking pace */
  speakingPace: "slow" | "normal" | "fast";
}

/**
 * Default empty behavior stats
 */
export const EMPTY_BEHAVIOR_STATS: BehaviorStats = {
  totalBargeIns: 0,
  backchannelCount: 0,
  softBargeCount: 0,
  hardBargeCount: 0,
  falsePositiveRate: 0,
  averageBargeInDuration: 0,
  preferredBackchannelPhrases: new Map(),
  sessionCount: 0,
  averageSessionDuration: 0,
  hourlyPatterns: new Array(24).fill(0),
  estimatedWpm: 150,
  speakingPace: "normal",
};

// ============================================================================
// Personalization State Types
// ============================================================================

/**
 * Full personalization state
 */
export interface PersonalizationState {
  /** Whether user has been calibrated */
  calibrated: boolean;

  /** Most recent calibration result */
  calibrationResult: CalibrationResult | null;

  /** User preferences */
  preferences: UserBargeInPreferences | null;

  /** Aggregated behavior statistics */
  behaviorStats: BehaviorStats;

  /** Whether adaptive learning is active */
  isLearning: boolean;

  /** Time since last preference update */
  lastUpdate: number;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Personalization events
 */
export type PersonalizationEvent =
  | { type: "calibration_started" }
  | { type: "calibration_progress"; progress: CalibrationProgress }
  | { type: "calibration_complete"; result: CalibrationResult }
  | { type: "calibration_error"; error: string }
  | { type: "preferences_updated"; preferences: UserBargeInPreferences }
  | { type: "barge_in_recorded"; event: BargeInEvent }
  | { type: "threshold_adapted"; oldValue: number; newValue: number }
  | { type: "learning_enabled"; enabled: boolean };

/**
 * Callback for personalization events
 */
export type PersonalizationEventCallback = (
  event: PersonalizationEvent,
) => void;

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Personalization configuration
 */
export interface PersonalizationConfig {
  /** Minimum barge-ins before adapting */
  minEventsForAdaptation: number;

  /** Maximum false positive rate before adjusting */
  maxFalsePositiveRate: number;

  /** How quickly to adapt (0-1, higher = faster) */
  adaptationRate: number;

  /** Enable automatic threshold adaptation */
  autoAdapt: boolean;

  /** How many calibration results to keep */
  maxCalibrationHistory: number;

  /** Sync preferences with backend */
  syncWithBackend: boolean;

  /** Backend sync interval (ms) */
  syncInterval: number;
}

/**
 * Default personalization configuration
 */
export const DEFAULT_PERSONALIZATION_CONFIG: PersonalizationConfig = {
  minEventsForAdaptation: 10,
  maxFalsePositiveRate: 0.1,
  adaptationRate: 0.05,
  autoAdapt: true,
  maxCalibrationHistory: 5,
  syncWithBackend: true,
  syncInterval: 60000, // 1 minute
};
