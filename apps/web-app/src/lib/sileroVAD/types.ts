/**
 * Silero VAD Type Definitions
 *
 * Types for the neural voice activity detection system based on Silero VAD.
 * Supports multilingual detection and adaptive thresholds.
 *
 * Phase 1: Neural VAD Integration
 */

import type { SupportedLanguage } from "../../hooks/useIntelligentBargeIn/types";

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Silero VAD configuration options
 */
export interface SileroVADConfig {
  /** Path to the ONNX model file */
  modelPath: string;

  /** Audio sample rate (default: 16000 Hz) */
  sampleRate: number;

  /** Window size for VAD analysis (default: 512 samples = 32ms) */
  windowSize: number;

  /** Probability threshold for speech detection (0-1) */
  speechThreshold: number;

  /** Probability threshold for silence detection (0-1) */
  silenceThreshold: number;

  /** Minimum consecutive windows for speech confirmation */
  minSpeechDuration: number;

  /** Minimum consecutive windows for silence confirmation */
  minSilenceDuration: number;

  /** Primary language for VAD tuning */
  language: SupportedLanguage;

  /** Enable adaptive threshold based on ambient noise */
  adaptiveThreshold: boolean;

  /** Duration of calibration period in milliseconds */
  calibrationDurationMs: number;

  /** Callback when speech starts */
  onSpeechStart?: (confidence: number, language?: SupportedLanguage) => void;

  /** Callback when speech ends */
  onSpeechEnd?: (duration: number) => void;

  /** Callback for each VAD result */
  onVADResult?: (result: VADProcessResult) => void;

  /** Callback when calibration completes */
  onCalibrationComplete?: (result: CalibrationData) => void;
}

/**
 * Default Silero VAD configuration
 */
export const DEFAULT_SILERO_CONFIG: SileroVADConfig = {
  modelPath: "/silero_vad.onnx",
  sampleRate: 16000,
  windowSize: 512,
  speechThreshold: 0.5,
  silenceThreshold: 0.35,
  minSpeechDuration: 64,
  minSilenceDuration: 100,
  language: "en",
  adaptiveThreshold: true,
  calibrationDurationMs: 3000,
};

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result from a single VAD inference
 */
export interface VADProcessResult {
  /** Speech probability (0-1) */
  probability: number;

  /** Whether this is classified as speech */
  isSpeech: boolean;

  /** Timestamp of this result */
  timestamp: number;

  /** Processing time in milliseconds */
  processingTime: number;

  /** Detected language if using multilingual model */
  detectedLanguage?: SupportedLanguage;
}

/**
 * Calibration data from ambient noise measurement
 */
export interface CalibrationData {
  /** Average ambient noise level (0-1) */
  ambientNoiseLevel: number;

  /** Recommended VAD speech threshold */
  recommendedVadThreshold: number;

  /** Recommended silence threshold */
  recommendedSilenceThreshold: number;

  /** Environment classification */
  environmentType: "quiet" | "moderate" | "noisy";

  /** Timestamp when calibration was performed */
  calibratedAt: number;
}

// ============================================================================
// State Types
// ============================================================================

/**
 * Internal state of the Silero VAD
 */
export interface SileroVADState {
  /** Whether the model is loaded and ready */
  isLoaded: boolean;

  /** Whether currently in speech segment */
  isSpeaking: boolean;

  /** Whether currently calibrating */
  isCalibrating: boolean;

  /** Timestamp when current speech segment started */
  speechStartTime: number | null;

  /** Number of consecutive speech windows */
  consecutiveSpeechWindows: number;

  /** Number of consecutive silence windows */
  consecutiveSilenceWindows: number;

  /** Current adapted threshold (after calibration) */
  adaptedThreshold: number;

  /** Last VAD probability */
  lastProbability: number;
}

/**
 * Initial state for Silero VAD
 */
export const INITIAL_SILERO_STATE: SileroVADState = {
  isLoaded: false,
  isSpeaking: false,
  isCalibrating: false,
  speechStartTime: null,
  consecutiveSpeechWindows: 0,
  consecutiveSilenceWindows: 0,
  adaptedThreshold: 0.5,
  lastProbability: 0,
};

// ============================================================================
// Language Configuration Types
// ============================================================================

/**
 * Language-specific VAD configuration overrides
 */
export interface LanguageVADConfig {
  /** Speech threshold adjustment for this language */
  speechThresholdOffset: number;

  /** Minimum speech duration adjustment (ms) */
  minSpeechDurationMs: number;

  /** Whether this language has tonal characteristics */
  isTonal: boolean;

  /** Whether this language uses phonetic pauses */
  hasPhoneticPauses: boolean;

  /** Typical speech rate (words per minute) */
  typicalSpeechRate: number;
}

/**
 * Language-specific VAD configurations
 */
export const LANGUAGE_VAD_CONFIGS: Record<
  SupportedLanguage,
  LanguageVADConfig
> = {
  en: {
    speechThresholdOffset: 0,
    minSpeechDurationMs: 100,
    isTonal: false,
    hasPhoneticPauses: false,
    typicalSpeechRate: 150,
  },
  ar: {
    speechThresholdOffset: -0.05, // Arabic has more varied intonation
    minSpeechDurationMs: 120,
    isTonal: false,
    hasPhoneticPauses: true,
    typicalSpeechRate: 120,
  },
  es: {
    speechThresholdOffset: 0,
    minSpeechDurationMs: 100,
    isTonal: false,
    hasPhoneticPauses: false,
    typicalSpeechRate: 160,
  },
  fr: {
    speechThresholdOffset: 0,
    minSpeechDurationMs: 100,
    isTonal: false,
    hasPhoneticPauses: false,
    typicalSpeechRate: 140,
  },
  de: {
    speechThresholdOffset: 0.02, // German has clearer word boundaries
    minSpeechDurationMs: 100,
    isTonal: false,
    hasPhoneticPauses: false,
    typicalSpeechRate: 130,
  },
  zh: {
    speechThresholdOffset: -0.05, // Tonal language needs sensitivity
    minSpeechDurationMs: 80,
    isTonal: true,
    hasPhoneticPauses: true,
    typicalSpeechRate: 100,
  },
  ja: {
    speechThresholdOffset: -0.03,
    minSpeechDurationMs: 80,
    isTonal: false, // Pitch accent, not tonal
    hasPhoneticPauses: true,
    typicalSpeechRate: 120,
  },
  ko: {
    speechThresholdOffset: -0.02,
    minSpeechDurationMs: 90,
    isTonal: false,
    hasPhoneticPauses: true,
    typicalSpeechRate: 130,
  },
  pt: {
    speechThresholdOffset: 0,
    minSpeechDurationMs: 100,
    isTonal: false,
    hasPhoneticPauses: false,
    typicalSpeechRate: 155,
  },
  ru: {
    speechThresholdOffset: 0,
    minSpeechDurationMs: 100,
    isTonal: false,
    hasPhoneticPauses: false,
    typicalSpeechRate: 125,
  },
  hi: {
    speechThresholdOffset: -0.03,
    minSpeechDurationMs: 110,
    isTonal: false,
    hasPhoneticPauses: true,
    typicalSpeechRate: 135,
  },
  tr: {
    speechThresholdOffset: 0,
    minSpeechDurationMs: 100,
    isTonal: false,
    hasPhoneticPauses: false,
    typicalSpeechRate: 140,
  },
};

// ============================================================================
// Worker Message Types
// ============================================================================

/**
 * Messages sent to the VAD worker
 */
export type VADWorkerMessage =
  | { type: "init"; modelPath: string }
  | { type: "process"; audioData: Float32Array; timestamp: number }
  | { type: "calibrate"; samples: Float32Array[] }
  | { type: "updateConfig"; config: Partial<SileroVADConfig> }
  | { type: "reset" }
  | { type: "destroy" };

/**
 * Messages received from the VAD worker
 */
export type VADWorkerResponse =
  | { type: "ready" }
  | { type: "result"; data: VADProcessResult }
  | { type: "calibration"; data: CalibrationData }
  | { type: "error"; message: string }
  | { type: "destroyed" };
