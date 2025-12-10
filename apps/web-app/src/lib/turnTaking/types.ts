/**
 * Turn-Taking Types
 *
 * Type definitions for natural turn-taking in voice conversations.
 * Supports prosodic analysis, silence prediction, and context-aware
 * resumption after interruptions.
 *
 * Phase 5: Natural Turn-Taking
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Supported languages for turn-taking
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
  | "it";

/**
 * Turn state in the conversation
 */
export type TurnState =
  | "ai_turn" // AI is speaking
  | "user_turn" // User is speaking
  | "transition" // Switching turns
  | "overlap" // Both speaking (brief)
  | "pause" // Silence, waiting
  | "ai_yielding" // AI finished, expecting user
  | "ai_resuming"; // AI resuming after interrupt with summary

/**
 * Turn transition type
 */
export type TransitionType =
  | "smooth" // Natural turn completion
  | "interrupted" // Hard barge-in
  | "yielded" // AI yielded to user
  | "timeout" // Silence timeout
  | "backchannel"; // Acknowledgment without turn change

// ============================================================================
// Prosodic Analysis Types
// ============================================================================

/**
 * Prosodic features extracted from audio
 */
export interface ProsodicFeatures {
  /** Fundamental frequency (pitch) in Hz */
  pitch: number;

  /** Pitch variation (std dev) */
  pitchVariation: number;

  /** Speaking rate (syllables per second estimate) */
  speakingRate: number;

  /** Energy level (RMS) */
  energy: number;

  /** Voice activity confidence */
  voiceActivity: number;

  /** Detected pitch contour */
  pitchContour: "rising" | "falling" | "flat" | "complex";

  /** Whether speech appears to be ending */
  isEnding: boolean;

  /** Whether speech appears to be questioning */
  isQuestion: boolean;

  /** Timestamp in ms */
  timestamp: number;
}

/**
 * Configuration for prosodic analyzer
 */
export interface ProsodicAnalyzerConfig {
  /** Sample rate in Hz */
  sampleRate: number;

  /** Frame size in samples */
  frameSize: number;

  /** Hop size in samples */
  hopSize: number;

  /** Minimum pitch to detect (Hz) */
  minPitch: number;

  /** Maximum pitch to detect (Hz) */
  maxPitch: number;

  /** Smoothing factor for pitch tracking */
  pitchSmoothing: number;

  /** Energy threshold for voice activity */
  energyThreshold: number;
}

/**
 * Default prosodic analyzer configuration
 */
export const DEFAULT_PROSODIC_CONFIG: ProsodicAnalyzerConfig = {
  sampleRate: 16000,
  frameSize: 512, // 32ms at 16kHz
  hopSize: 160, // 10ms at 16kHz
  minPitch: 60, // Lower bound for male voice
  maxPitch: 500, // Upper bound for female voice
  pitchSmoothing: 0.9,
  energyThreshold: 0.01,
};

// ============================================================================
// Silence Prediction Types
// ============================================================================

/**
 * Silence prediction result
 */
export interface SilencePrediction {
  /** Is current segment silence? */
  isSilence: boolean;

  /** Predicted silence duration (ms) */
  predictedDuration: number;

  /** Confidence in prediction (0-1) */
  confidence: number;

  /** Type of silence */
  silenceType: "end_of_turn" | "pause" | "hesitation" | "thinking";

  /** Should we wait for more speech? */
  shouldWait: boolean;

  /** Recommended action */
  recommendation: "wait" | "take_turn" | "prompt_user";
}

/**
 * Configuration for silence predictor
 */
export interface SilencePredictorConfig {
  /** Base silence threshold for end of turn (ms) */
  baseSilenceThreshold: number;

  /** Minimum silence threshold (ms) */
  minSilenceThreshold: number;

  /** Maximum silence threshold (ms) */
  maxSilenceThreshold: number;

  /** Adaptation rate for threshold */
  adaptationRate: number;

  /** Context window size for analysis */
  contextWindowSize: number;

  /** Enable prosodic-aware prediction */
  useProsody: boolean;

  /** Consider conversation history */
  useHistory: boolean;
}

/**
 * Default silence predictor configuration
 */
export const DEFAULT_SILENCE_CONFIG: SilencePredictorConfig = {
  baseSilenceThreshold: 600, // 600ms default
  minSilenceThreshold: 300, // 300ms minimum
  maxSilenceThreshold: 1500, // 1.5s maximum
  adaptationRate: 0.1,
  contextWindowSize: 10,
  useProsody: true,
  useHistory: true,
};

// ============================================================================
// Context Resumption Types
// ============================================================================

/**
 * Context captured when interrupted
 */
export interface ResumptionContext {
  /** Full content that was being delivered */
  interruptedContent: string;

  /** Word index where interruption occurred */
  interruptedAtWord: number;

  /** Total words in content */
  totalWords: number;

  /** Percentage of content delivered */
  completionPercentage: number;

  /** Key points extracted from content */
  keyPoints: string[];

  /** Brief summary of what was said */
  summary: string;

  /** Timestamp of interruption */
  timestamp: number;

  /** Reason for interruption */
  interruptionReason: "user_barge_in" | "error" | "timeout" | "user_request";
}

/**
 * Configuration for context resumer
 */
export interface ResumptionConfig {
  /** Language for resumption phrases */
  language: SupportedLanguage;

  /** Maximum summary length in characters */
  maxSummaryLength: number;

  /** Include summary in resumption */
  includeSummaryInResumption: boolean;

  /** Style of resumption */
  resumptionStyle: "brief" | "detailed" | "ask-user";

  /** Auto-resume after brief interruption */
  autoResume: boolean;

  /** Auto-resume if completion was below this percentage */
  autoResumeThreshold: number;
}

/**
 * Default resumption configuration
 */
export const DEFAULT_RESUMPTION_CONFIG: ResumptionConfig = {
  language: "en",
  maxSummaryLength: 100,
  includeSummaryInResumption: true,
  resumptionStyle: "brief",
  autoResume: true,
  autoResumeThreshold: 30, // Auto-resume if <30% complete
};

// ============================================================================
// Turn-Taking Manager Types
// ============================================================================

/**
 * Turn-taking state snapshot
 */
export interface TurnTakingState {
  /** Current turn state */
  currentTurn: TurnState;

  /** Previous turn state */
  previousTurn: TurnState;

  /** Current speaker */
  currentSpeaker: "user" | "ai" | "none";

  /** Time in current state (ms) */
  timeInState: number;

  /** Silence duration (ms) */
  silenceDuration: number;

  /** Latest prosodic features */
  prosodicFeatures: ProsodicFeatures | null;

  /** Latest silence prediction */
  silencePrediction: SilencePrediction | null;

  /** Pending resumption context */
  resumptionContext: ResumptionContext | null;

  /** Turn count in session */
  turnCount: number;

  /** Average turn duration (ms) */
  avgTurnDuration: number;
}

/**
 * Configuration for turn-taking manager
 */
export interface TurnTakingConfig {
  /** Prosodic analyzer configuration */
  prosodicConfig: ProsodicAnalyzerConfig;

  /** Silence predictor configuration */
  silenceConfig: SilencePredictorConfig;

  /** Resumption configuration */
  resumptionConfig: ResumptionConfig;

  /** Enable natural turn-taking (vs simple VAD) */
  enableNaturalTurnTaking: boolean;

  /** Maximum overlap duration (ms) */
  maxOverlapDuration: number;

  /** Minimum user turn duration (ms) */
  minUserTurnDuration: number;

  /** Timeout to prompt user (ms) */
  userPromptTimeout: number;
}

/**
 * Default turn-taking configuration
 */
export const DEFAULT_TURN_TAKING_CONFIG: TurnTakingConfig = {
  prosodicConfig: DEFAULT_PROSODIC_CONFIG,
  silenceConfig: DEFAULT_SILENCE_CONFIG,
  resumptionConfig: DEFAULT_RESUMPTION_CONFIG,
  enableNaturalTurnTaking: true,
  maxOverlapDuration: 500,
  minUserTurnDuration: 200,
  userPromptTimeout: 5000,
};

// ============================================================================
// Event Types
// ============================================================================

/**
 * Turn-taking events
 */
export type TurnTakingEvent =
  | { type: "turn_started"; speaker: "user" | "ai"; timestamp: number }
  | { type: "turn_ended"; speaker: "user" | "ai"; duration: number }
  | {
      type: "transition";
      from: TurnState;
      to: TurnState;
      transitionType: TransitionType;
    }
  | { type: "overlap_started"; timestamp: number }
  | { type: "overlap_ended"; duration: number }
  | {
      type: "silence_detected";
      duration: number;
      prediction: SilencePrediction;
    }
  | { type: "resumption_available"; context: ResumptionContext }
  | { type: "prompt_user"; reason: string }
  | { type: "prosodic_update"; features: ProsodicFeatures };

/**
 * Callback for turn-taking events
 */
export type TurnTakingEventCallback = (event: TurnTakingEvent) => void;
