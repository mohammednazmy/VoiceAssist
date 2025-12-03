/**
 * Echo Cancellation Types
 *
 * Type definitions for the advanced audio processing module.
 * Supports AEC (Acoustic Echo Cancellation), privacy filtering,
 * and speaker reference tracking.
 *
 * Phase 4: Advanced Audio Processing
 */

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for the adaptive filter
 */
export interface AdaptiveFilterConfig {
  /** Length of the filter in samples */
  filterLength: number;

  /** NLMS step size (0-1, typically 0.3-0.7) */
  stepSize: number;

  /** Regularization term to prevent division by zero */
  epsilon: number;

  /** Enable double-talk detection */
  doubleTalkDetection: boolean;

  /** Threshold for double-talk detection */
  doubleTalkThreshold: number;
}

/**
 * Default adaptive filter configuration
 */
export const DEFAULT_ADAPTIVE_FILTER_CONFIG: AdaptiveFilterConfig = {
  filterLength: 512, // ~32ms at 16kHz
  stepSize: 0.5,
  epsilon: 1e-8,
  doubleTalkDetection: true,
  doubleTalkThreshold: 0.7,
};

/**
 * Configuration for echo cancellation
 */
export interface EchoCancellationConfig {
  /** Enable AEC processing */
  enabled: boolean;

  /** Sample rate in Hz */
  sampleRate: number;

  /** Frame size in samples */
  frameSize: number;

  /** Maximum echo path delay in milliseconds */
  maxEchoPathDelayMs: number;

  /** Adaptive filter configuration */
  filterConfig: AdaptiveFilterConfig;

  /** Enable noise suppression */
  noiseSuppression: boolean;

  /** Noise suppression level (0-1) */
  noiseSuppressionLevel: number;

  /** Enable comfort noise generation */
  comfortNoise: boolean;

  /** Comfort noise level in dB */
  comfortNoiseLevel: number;
}

/**
 * Default echo cancellation configuration
 */
export const DEFAULT_AEC_CONFIG: EchoCancellationConfig = {
  enabled: true,
  sampleRate: 16000,
  frameSize: 256,
  maxEchoPathDelayMs: 200,
  filterConfig: DEFAULT_ADAPTIVE_FILTER_CONFIG,
  noiseSuppression: true,
  noiseSuppressionLevel: 0.5,
  comfortNoise: true,
  comfortNoiseLevel: -60,
};

/**
 * Configuration for speaker reference tracking
 */
export interface SpeakerReferenceConfig {
  /** Maximum buffer size in seconds */
  maxBufferSizeSeconds: number;

  /** Sample rate */
  sampleRate: number;

  /** Enable automatic gain control */
  enableAGC: boolean;

  /** Target level for AGC in dB */
  targetLevel: number;

  /** Delay estimation enabled */
  delayEstimation: boolean;

  /** Maximum delay in samples */
  maxDelaySamples: number;
}

/**
 * Default speaker reference configuration
 */
export const DEFAULT_SPEAKER_REF_CONFIG: SpeakerReferenceConfig = {
  maxBufferSizeSeconds: 2,
  sampleRate: 16000,
  enableAGC: true,
  targetLevel: -20,
  delayEstimation: true,
  maxDelaySamples: 8000, // 500ms at 16kHz
};

/**
 * Configuration for privacy filtering
 */
export interface PrivacyConfig {
  /** Encrypt audio in transit */
  encryptInTransit: boolean;

  /** Encryption key (generated if not provided) */
  encryptionKey?: CryptoKey;

  /** Anonymize telemetry data */
  anonymizeTelemetry: boolean;

  /** Strip metadata from audio */
  stripMetadata: boolean;

  /** Hash algorithm for telemetry */
  hashAlgorithm: "SHA-256" | "SHA-384" | "SHA-512";

  /** Maximum fingerprint length */
  maxFingerprintLength: number;
}

/**
 * Default privacy configuration
 */
export const DEFAULT_PRIVACY_CONFIG: PrivacyConfig = {
  encryptInTransit: false,
  anonymizeTelemetry: true,
  stripMetadata: true,
  hashAlgorithm: "SHA-256",
  maxFingerprintLength: 16,
};

// ============================================================================
// State Types
// ============================================================================

/**
 * State of the echo canceller
 */
export interface AECState {
  /** Whether AEC is active */
  isActive: boolean;

  /** Current ERLE (Echo Return Loss Enhancement) in dB */
  erle: number;

  /** Whether double-talk is detected */
  doubleTalkDetected: boolean;

  /** Estimated echo path delay in samples */
  estimatedDelay: number;

  /** Current noise floor estimate in dB */
  noiseFloor: number;

  /** Number of frames processed */
  framesProcessed: number;

  /** Average processing time per frame in ms */
  avgProcessingTime: number;
}

/**
 * State of speaker reference tracking
 */
export interface SpeakerReferenceState {
  /** Whether speaker audio is being played */
  isPlaying: boolean;

  /** Current buffer fill level (0-1) */
  bufferLevel: number;

  /** Current gain adjustment from AGC */
  currentGain: number;

  /** Estimated delay in samples */
  estimatedDelay: number;

  /** Correlation strength for delay estimation */
  correlationStrength: number;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result from AEC processing
 */
export interface AECProcessResult {
  /** Processed audio samples */
  processedAudio: Float32Array;

  /** Whether echo was detected and removed */
  echoRemoved: boolean;

  /** Echo suppression amount in dB */
  suppressionAmount: number;

  /** Whether this frame had double-talk */
  doubleTalk: boolean;

  /** Processing latency in ms */
  latencyMs: number;
}

/**
 * Result from delay estimation
 */
export interface DelayEstimationResult {
  /** Estimated delay in samples */
  delaySamples: number;

  /** Estimated delay in milliseconds */
  delayMs: number;

  /** Confidence in the estimate (0-1) */
  confidence: number;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Events emitted by the AEC module
 */
export type AECEvent =
  | { type: "initialized" }
  | { type: "error"; error: Error }
  | { type: "state_change"; state: AECState }
  | { type: "double_talk_start" }
  | { type: "double_talk_end" }
  | { type: "delay_updated"; delay: DelayEstimationResult };

/**
 * Callback for AEC events
 */
export type AECEventCallback = (event: AECEvent) => void;

// ============================================================================
// AudioWorklet Message Types
// ============================================================================

/**
 * Messages sent to the AEC AudioWorklet
 */
export type AECWorkletMessage =
  | { type: "init"; config: EchoCancellationConfig }
  | { type: "speaker_audio"; samples: Float32Array }
  | { type: "update_config"; config: Partial<EchoCancellationConfig> }
  | { type: "reset" }
  | { type: "get_state" };

/**
 * Messages received from the AEC AudioWorklet
 */
export type AECWorkletResponse =
  | { type: "initialized" }
  | { type: "processed"; samples: Float32Array; result: AECProcessResult }
  | { type: "state"; state: AECState }
  | { type: "error"; message: string };
