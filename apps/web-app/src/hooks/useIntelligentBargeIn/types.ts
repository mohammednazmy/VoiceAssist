/**
 * Intelligent Barge-In System Types
 *
 * Comprehensive type definitions for the world-class voice barge-in system
 * supporting multilingual detection, adaptive personalization, and
 * context-aware interruption handling.
 *
 * Phase: Voice Barge-In Implementation
 */

// ============================================================================
// Core State Types
// ============================================================================

/**
 * Barge-in state machine states
 */
export type BargeInState =
  | "idle" // Voice mode inactive
  | "calibrating" // Measuring ambient noise for thresholds
  | "connecting" // Establishing WebSocket
  | "listening" // Ready, waiting for user speech
  | "speech_detected" // VAD triggered, confirming (20-30ms)
  | "user_speaking" // Confirmed user speech
  | "processing_stt" // Finalizing transcript
  | "processing_llm" // LLM generating response (may include tool calls)
  | "ai_responding" // LLM streaming tokens (no audio yet)
  | "ai_speaking" // TTS audio playing
  | "barge_in_detected" // User spoke during AI, classifying
  | "soft_barge" // Soft interruption (AI paused)
  | "awaiting_continuation" // After soft barge, waiting for user
  | "tool_call_pending" // Barge-in queued during non-interruptible tool call
  | "error"; // Error state

/**
 * Classification of user interruption
 */
export type BargeInClassification =
  | "backchannel" // "uh huh", "yeah" - continue AI
  | "soft_barge" // "wait", "hold on" - pause AI
  | "hard_barge" // Full interruption - stop AI
  | "unclear"; // Need more audio to classify

/**
 * Confidence level in speech detection
 */
export type SpeechConfidence = "low" | "medium" | "high" | "very_high";

/**
 * Supported languages for VAD and backchannel detection
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
  | "pt"
  | "ru"
  | "hi"
  | "tr";

// ============================================================================
// Event Types
// ============================================================================

/**
 * Barge-in event with full context
 */
export interface BargeInEvent {
  id: string;
  type: BargeInClassification;
  timestamp: number;
  interruptedContent: string;
  interruptedAtWord: number;
  totalWords: number;
  completionPercentage: number;
  userTranscript?: string;
  resumable: boolean;
  contextSummary?: string;
  activeToolCall?: ToolCallState;
  language: SupportedLanguage;
}

/**
 * Tool call state for interruption handling
 */
export interface ToolCallState {
  id: string;
  name: string;
  status: "pending" | "executing" | "completed" | "cancelled" | "rolled_back";
  safeToInterrupt: boolean;
  rollbackAction?: () => Promise<void>;
  startedAt: number;
}

// ============================================================================
// VAD Result Types
// ============================================================================

/**
 * Result from VAD analysis
 */
export interface VADResult {
  isSpeech: boolean;
  confidence: number;
  onsetTimestamp: number;
  duration: number;
  energy: number;
  language?: SupportedLanguage;
  spectralFeatures?: SpectralFeatures;
}

/**
 * Spectral analysis features for advanced classification
 */
export interface SpectralFeatures {
  centroid: number;
  bandwidth: number;
  rolloff: number;
}

// ============================================================================
// Calibration Types
// ============================================================================

/**
 * Result of ambient noise calibration
 */
export interface CalibrationResult {
  ambientNoiseLevel: number;
  recommendedVadThreshold: number;
  recommendedSilenceThreshold: number;
  environmentType: "quiet" | "moderate" | "noisy";
  calibratedAt: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Main barge-in configuration
 */
export interface BargeInConfig {
  // Language settings
  language: SupportedLanguage;
  autoDetectLanguage: boolean;
  accentProfile?: string;

  // Detection thresholds (adaptive)
  speechOnsetConfidence: number;
  speechConfirmMs: number;
  hardBargeMinDuration: number;

  // Audio behavior
  fadeOutDuration: number;
  softBargeFadeLevel: number;
  softBargeWaitMs: number;

  // Backchannel detection (language-aware)
  backchannelMaxDuration: number;
  backchannelPhrases: Map<SupportedLanguage, string[]>;

  // Echo cancellation
  echoSuppressionEnabled: boolean;
  echoCorrelationThreshold: number;

  // Adaptive settings
  adaptiveSilenceEnabled: boolean;
  minSilenceMs: number;
  maxSilenceMs: number;

  // Calibration
  calibrationEnabled: boolean;
  calibrationDurationMs: number;

  // Personalization
  userId?: string;
  persistUserPreferences: boolean;

  // Offline fallback
  useOfflineVAD: boolean;
  offlineVADModel: "silero-lite" | "webrtc-vad";
  offlineTTSCacheEnabled: boolean;
  offlineTTSCacheSizeMB: number;

  // Privacy
  encryptAudioInTransit: boolean;
  anonymizeTelemetry: boolean;
  audioRetentionPolicy: "none" | "session" | "24h" | "7d";

  // Tool-call integration
  allowInterruptDuringToolCalls: boolean;
  toolCallInterruptBehavior: "queue" | "cancel" | "smart";
}

/**
 * Default barge-in configuration
 */
export const DEFAULT_BARGE_IN_CONFIG: BargeInConfig = {
  // Language settings
  language: "en",
  autoDetectLanguage: true,
  accentProfile: undefined,

  // Detection thresholds
  speechOnsetConfidence: 0.7,
  speechConfirmMs: 100,
  hardBargeMinDuration: 300,

  // Audio behavior
  fadeOutDuration: 30,
  softBargeFadeLevel: 0.2,
  softBargeWaitMs: 2000,

  // Backchannel detection
  backchannelMaxDuration: 500,
  backchannelPhrases: new Map([
    [
      "en",
      ["uh huh", "yeah", "yes", "mm hmm", "okay", "right", "sure", "got it"],
    ],
    ["ar", ["اها", "نعم", "صح", "ايوه", "حسنا", "طيب", "تمام"]],
    ["es", ["sí", "ajá", "claro", "vale", "ok", "entiendo"]],
    ["fr", ["oui", "ouais", "d'accord", "ok", "je vois"]],
    ["de", ["ja", "mhm", "genau", "ok", "verstehe"]],
    ["zh", ["嗯", "好", "是的", "对", "明白"]],
    ["ja", ["はい", "うん", "そうですね", "なるほど"]],
    ["ko", ["네", "응", "알겠어요", "그래요"]],
    ["pt", ["sim", "certo", "ok", "entendi", "tá"]],
    ["ru", ["да", "угу", "понятно", "хорошо"]],
    ["hi", ["हाँ", "ठीक है", "समझ गया", "अच्छा"]],
    ["tr", ["evet", "tamam", "anladım", "peki"]],
  ]),

  // Echo cancellation
  echoSuppressionEnabled: true,
  echoCorrelationThreshold: 0.55,

  // Adaptive settings
  adaptiveSilenceEnabled: true,
  minSilenceMs: 200,
  maxSilenceMs: 800,

  // Calibration
  calibrationEnabled: true,
  calibrationDurationMs: 3000,

  // Personalization
  userId: undefined,
  persistUserPreferences: true,

  // Offline fallback
  useOfflineVAD: false,
  offlineVADModel: "silero-lite",
  offlineTTSCacheEnabled: true,
  offlineTTSCacheSizeMB: 50,

  // Privacy
  encryptAudioInTransit: true,
  anonymizeTelemetry: true,
  audioRetentionPolicy: "session",

  // Tool-call integration
  allowInterruptDuringToolCalls: true,
  toolCallInterruptBehavior: "smart",
};

// ============================================================================
// User Preferences Types
// ============================================================================

/**
 * User-specific persisted preferences
 */
export interface UserBargeInPreferences {
  userId: string;
  vadSensitivity: number;
  silenceThreshold: number;
  preferredLanguage: SupportedLanguage;
  accentProfile?: string;
  backchannelFrequency: "low" | "normal" | "high";
  feedbackPreferences: FeedbackPreferences;
  calibrationHistory: CalibrationResult[];
  lastUpdated: number;
}

/**
 * Feedback customization preferences
 */
export interface FeedbackPreferences {
  visualFeedbackEnabled: boolean;
  visualFeedbackStyle: "pulse" | "border" | "icon" | "minimal";
  hapticFeedbackEnabled: boolean;
  hapticIntensity: "light" | "medium" | "strong";
  audioFeedbackEnabled: boolean;
  audioFeedbackType: "tone" | "voice" | "none";
  voicePromptAfterHardBarge: boolean;
  voicePromptText?: string;
}

/**
 * Default feedback preferences
 */
export const DEFAULT_FEEDBACK_PREFERENCES: FeedbackPreferences = {
  visualFeedbackEnabled: true,
  visualFeedbackStyle: "pulse",
  hapticFeedbackEnabled: true,
  hapticIntensity: "medium",
  audioFeedbackEnabled: true,
  audioFeedbackType: "tone",
  voicePromptAfterHardBarge: true,
  voicePromptText: "I'm listening",
};

// ============================================================================
// Hook Return Types
// ============================================================================

/**
 * Return type for useIntelligentBargeIn hook
 */
export interface UseIntelligentBargeInReturn {
  // State
  state: BargeInState;
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  currentConfidence: number;
  detectedLanguage: SupportedLanguage | null;

  // Actions
  startListening: () => Promise<void>;
  stopListening: () => void;
  cancelBarge: () => void;
  softPause: () => void;
  hardStop: () => void;
  calibrate: () => Promise<CalibrationResult>;

  // Configuration
  config: BargeInConfig;
  updateConfig: (config: Partial<BargeInConfig>) => void;

  // Events
  lastBargeInEvent: BargeInEvent | null;
  bargeInHistory: BargeInEvent[];

  // Metrics
  metrics: BargeInMetrics;
}

/**
 * Barge-in performance metrics
 */
export interface BargeInMetrics {
  vadLatencyMs: number;
  classificationLatencyMs: number;
  totalBargeIns: number;
  backchannelCount: number;
  softBargeCount: number;
  hardBargeCount: number;
  falsePositives: number;
  sessionDuration: number;
}
