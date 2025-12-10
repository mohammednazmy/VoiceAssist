/**
 * Barge-In Classifier Types
 *
 * Type definitions for the context-aware interruption classification system.
 * Supports multilingual intent detection and backchannel recognition.
 *
 * Phase 3: Context-Aware Interruption Intelligence
 */

import type { SupportedLanguage } from "../../hooks/useIntelligentBargeIn/types";

// ============================================================================
// Classification Types
// ============================================================================

/**
 * Primary classification of a barge-in event
 */
export type BargeInClassificationType =
  | "backchannel" // Non-interrupting acknowledgment (e.g., "uh-huh", "mm-hmm")
  | "soft_barge" // Polite interruption, wants to add something
  | "hard_barge" // Urgent interruption, wants to take over
  | "command" // Direct command or question
  | "correction" // Correcting something the AI said
  | "clarification" // Asking for clarification
  | "topic_change" // Changing the subject
  | "agreement" // Strong agreement, wants to elaborate
  | "disagreement" // Disagreement, may want to argue
  | "unknown"; // Could not classify

/**
 * Intent behind the user's interruption
 */
export type UserIntent =
  | "acknowledge" // Just acknowledging
  | "continue" // Wants AI to continue
  | "stop" // Wants AI to stop
  | "pause" // Wants AI to pause briefly
  | "ask_question" // Has a question
  | "provide_info" // Wants to provide information
  | "correct" // Correcting the AI
  | "change_topic" // Changing the subject
  | "express_emotion" // Expressing emotion/reaction
  | "clarify" // Asking for clarification
  | "command" // Issuing a command
  | "uncertain"; // Intent unclear

/**
 * Priority level for handling the interruption
 */
export type InterruptionPriority = "low" | "medium" | "high" | "critical";

// ============================================================================
// Pattern Types
// ============================================================================

/**
 * Pattern for detecting backchannel utterances
 */
export interface BackchannelPattern {
  /** Phrases that match this pattern */
  phrases: string[];

  /** Maximum duration in ms for this to be considered a backchannel */
  maxDuration: number;

  /** Optional confidence boost/penalty for this pattern */
  confidence?: number;
}

/**
 * Pattern for detecting soft barge-in phrases
 */
export interface SoftBargePattern {
  /** Phrases that match this pattern */
  phrases: string[];

  /** Whether this pattern requires a follow-up utterance */
  requiresFollowUp: boolean;
}

/**
 * Pattern for detecting hard barge-in phrases
 */
export interface HardBargePattern {
  /** Phrases that match this pattern */
  phrases: string[];

  /** The implied intent of this pattern */
  intent: UserIntent;
}

/**
 * Pattern for detecting command phrases
 */
export interface CommandPattern {
  /** Phrases that match this pattern */
  phrases: string[];

  /** The command type (stop, repeat, louder, etc.) */
  commandType: string;

  /** Priority of this command */
  priority: InterruptionPriority;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result from the backchannel detector
 */
export interface BackchannelResult {
  /** Whether this is a backchannel */
  isBackchannel: boolean;

  /** The matched pattern if any */
  matchedPattern?: string;

  /** Confidence score (0-1) */
  score: number;

  /** Detected language */
  language: SupportedLanguage;

  /** Whether repeated backchannels suggest user wants to speak */
  shouldEscalate: boolean;
}

/**
 * Result from the soft barge detector
 */
export interface SoftBargeResult {
  /** Whether this is a soft barge */
  isSoftBarge: boolean;

  /** The matched pattern if any */
  matchedPattern?: string;

  /** Whether we should wait for more input */
  requiresFollowUp: boolean;

  /** Detected language */
  language: SupportedLanguage;
}

/**
 * Complete classification result
 */
export interface ClassificationResult {
  /** Primary classification */
  classification: BargeInClassificationType;

  /** Detected user intent */
  intent: UserIntent;

  /** Priority for handling */
  priority: InterruptionPriority;

  /** Confidence in the classification (0-1) */
  confidence: number;

  /** Detected language */
  language: SupportedLanguage;

  /** Original transcript */
  transcript: string;

  /** Duration of the utterance in ms */
  duration: number;

  /** Recommended action */
  action: ClassificationAction;

  /** Additional metadata */
  metadata: ClassificationMetadata;
}

/**
 * Recommended action based on classification
 */
export interface ClassificationAction {
  /** What the AI should do */
  type:
    | "continue" // Continue speaking normally
    | "pause" // Pause briefly
    | "stop" // Stop speaking
    | "acknowledge" // Acknowledge and continue
    | "yield" // Stop and let user speak
    | "respond" // Stop and respond to user
    | "wait"; // Wait for more input

  /** Whether to acknowledge the user's input */
  shouldAcknowledge: boolean;

  /** Optional acknowledgment phrase to use */
  acknowledgmentPhrase?: string;

  /** How long to pause if pausing (ms) */
  pauseDuration?: number;

  /** Whether to save context for resumption */
  shouldSaveContext: boolean;
}

/**
 * Additional metadata about the classification
 */
export interface ClassificationMetadata {
  /** Raw VAD probability */
  vadProbability: number;

  /** Whether this was detected during AI speech */
  duringAISpeech: boolean;

  /** Time since last user utterance (ms) */
  timeSinceLastUtterance: number;

  /** Count of recent backchannels */
  recentBackchannelCount: number;

  /** Whether prosodic features suggest urgency */
  prosodicUrgency: boolean;

  /** Audio features used in classification */
  audioFeatures?: AudioFeatures;
}

/**
 * Audio features extracted for classification
 */
export interface AudioFeatures {
  /** Average pitch (Hz) */
  avgPitch: number;

  /** Pitch variation */
  pitchVariance: number;

  /** Average volume (dB) */
  avgVolume: number;

  /** Speaking rate (syllables/second estimate) */
  speakingRate: number;

  /** Whether intonation suggests question */
  risingIntonation: boolean;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for the barge-in classifier
 */
export interface BargeInClassifierConfig {
  /** Primary language for classification */
  language: SupportedLanguage;

  /** Secondary languages to check */
  fallbackLanguages: SupportedLanguage[];

  /** Enable automatic language detection */
  autoDetectLanguage: boolean;

  /** Minimum confidence to accept classification */
  minConfidence: number;

  /** Enable prosodic analysis */
  enableProsodicAnalysis: boolean;

  /** Time window for backchannel escalation (ms) */
  backchannelEscalationWindow: number;

  /** Number of backchannels before escalation */
  backchannelEscalationThreshold: number;

  /** Maximum duration for backchannel (ms) */
  maxBackchannelDuration: number;

  /** Minimum duration for hard barge (ms) */
  minHardBargeDuration: number;

  /** Whether to use server-side classification for complex cases */
  enableServerSideClassification: boolean;

  /** Custom patterns to add */
  customPatterns?: CustomPatterns;
}

/**
 * Custom patterns that can be added by users or applications
 */
export interface CustomPatterns {
  backchannels?: BackchannelPattern[];
  softBarges?: SoftBargePattern[];
  hardBarges?: HardBargePattern[];
  commands?: CommandPattern[];
}

/**
 * Default classifier configuration
 */
export const DEFAULT_CLASSIFIER_CONFIG: BargeInClassifierConfig = {
  language: "en",
  fallbackLanguages: [],
  autoDetectLanguage: false,
  minConfidence: 0.6,
  enableProsodicAnalysis: true,
  backchannelEscalationWindow: 5000,
  backchannelEscalationThreshold: 3,
  maxBackchannelDuration: 800,
  minHardBargeDuration: 300,
  enableServerSideClassification: false,
};

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event emitted when classification is complete
 */
export interface ClassificationEvent {
  type: "classification";
  result: ClassificationResult;
  timestamp: number;
}

/**
 * Event emitted when backchannel escalation occurs
 */
export interface EscalationEvent {
  type: "escalation";
  reason: "repeated_backchannels" | "increasing_urgency" | "explicit_request";
  count: number;
  timestamp: number;
}

/**
 * Union of all classifier events
 */
export type ClassifierEvent = ClassificationEvent | EscalationEvent;

/**
 * Callback for classifier events
 */
export type ClassifierEventCallback = (event: ClassifierEvent) => void;
