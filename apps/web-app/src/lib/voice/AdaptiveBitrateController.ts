/**
 * Adaptive Bitrate Controller
 *
 * Manages audio quality levels based on network conditions.
 * Dynamically adjusts codec, sample rate, and bitrate to provide
 * the best possible audio quality given the current network state.
 *
 * Phase: WebSocket Advanced Features
 */

import {
  getNetworkMonitor,
  type NetworkQuality,
  type NetworkStatus,
} from "../offline/networkMonitor";

// ============================================================================
// Types
// ============================================================================

/**
 * Audio codec types
 */
export type AudioCodec = "pcm16" | "opus";

/**
 * Audio quality level
 */
export type AudioQualityLevel = "high" | "medium" | "low" | "minimum";

/**
 * Audio quality profile
 */
export interface AudioQualityProfile {
  /** Quality level identifier */
  level: AudioQualityLevel;
  /** Audio codec to use */
  codec: AudioCodec;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Target bitrate in bps */
  bitrate: number;
  /** Frame size in samples */
  frameSize: number;
  /** Description of this profile */
  description: string;
}

/**
 * Adaptive bitrate configuration
 */
export interface AdaptiveBitrateConfig {
  /** Enable adaptive bitrate */
  enabled: boolean;
  /** Enable aggressive mode (faster switching) */
  aggressive: boolean;
  /** Hysteresis count to prevent rapid switching */
  hysteresisCount: number;
  /** Quality profiles */
  profiles: Record<AudioQualityLevel, AudioQualityProfile>;
  /** Mapping from network quality to audio quality */
  networkQualityMapping: Record<NetworkQuality, AudioQualityLevel>;
}

/**
 * Quality change event
 */
export interface QualityChangeEvent {
  /** Previous quality level */
  previousLevel: AudioQualityLevel;
  /** New quality level */
  newLevel: AudioQualityLevel;
  /** Previous profile */
  previousProfile: AudioQualityProfile;
  /** New profile */
  newProfile: AudioQualityProfile;
  /** Reason for the change */
  reason: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * Quality change handler
 */
export type QualityChangeHandler = (event: QualityChangeEvent) => void;

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default quality profiles
 */
export const DEFAULT_QUALITY_PROFILES: Record<
  AudioQualityLevel,
  AudioQualityProfile
> = {
  high: {
    level: "high",
    codec: "pcm16",
    sampleRate: 16000,
    bitrate: 256000,
    frameSize: 480, // 30ms at 16kHz
    description: "PCM16 at 16kHz - highest quality, highest bandwidth",
  },
  medium: {
    level: "medium",
    codec: "opus",
    sampleRate: 16000,
    bitrate: 24000,
    frameSize: 480,
    description: "Opus at 24kbps - good quality, low bandwidth",
  },
  low: {
    level: "low",
    codec: "opus",
    sampleRate: 16000,
    bitrate: 16000,
    frameSize: 480,
    description: "Opus at 16kbps - acceptable quality, minimal bandwidth",
  },
  minimum: {
    level: "minimum",
    codec: "opus",
    sampleRate: 8000,
    bitrate: 12000,
    frameSize: 240, // 30ms at 8kHz
    description: "Opus at 12kbps, 8kHz - emergency mode",
  },
};

/**
 * Default network quality to audio quality mapping
 */
export const DEFAULT_NETWORK_QUALITY_MAPPING: Record<
  NetworkQuality,
  AudioQualityLevel
> = {
  excellent: "high",
  good: "medium",
  moderate: "low",
  poor: "minimum",
  offline: "minimum",
};

/**
 * Default configuration
 */
export const DEFAULT_ADAPTIVE_BITRATE_CONFIG: AdaptiveBitrateConfig = {
  enabled: true,
  aggressive: false,
  hysteresisCount: 3,
  profiles: DEFAULT_QUALITY_PROFILES,
  networkQualityMapping: DEFAULT_NETWORK_QUALITY_MAPPING,
};

// ============================================================================
// Adaptive Bitrate Controller
// ============================================================================

/**
 * Adaptive Bitrate Controller
 *
 * Monitors network quality and adjusts audio quality accordingly.
 * Uses hysteresis to prevent rapid quality switching.
 */
export class AdaptiveBitrateController {
  private config: AdaptiveBitrateConfig;
  private networkMonitor = getNetworkMonitor();
  private networkUnsubscribe: (() => void) | null = null;

  // Current state
  private _currentLevel: AudioQualityLevel = "high";
  private _currentProfile: AudioQualityProfile;
  private pendingLevel: AudioQualityLevel | null = null;
  private hysteresisCounter = 0;

  // Event handlers
  private changeHandlers: Set<QualityChangeHandler> = new Set();

  // Stats
  private qualityChanges = 0;
  private lastChangeTime = 0;

  constructor(config: Partial<AdaptiveBitrateConfig> = {}) {
    this.config = { ...DEFAULT_ADAPTIVE_BITRATE_CONFIG, ...config };
    this._currentProfile = this.config.profiles[this._currentLevel];
  }

  // ==========================================================================
  // Properties
  // ==========================================================================

  /** Current quality level */
  get currentLevel(): AudioQualityLevel {
    return this._currentLevel;
  }

  /** Current quality profile */
  get currentProfile(): AudioQualityProfile {
    return this._currentProfile;
  }

  /** Whether controller is enabled */
  get isEnabled(): boolean {
    return this.config.enabled;
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start monitoring and adapting
   */
  start(): void {
    if (!this.config.enabled) return;

    // Subscribe to network changes
    this.networkUnsubscribe = this.networkMonitor.subscribe((status) => {
      this.handleNetworkChange(status);
    });

    // Set initial quality based on current network
    const initialStatus = this.networkMonitor.getStatus();
    this.setQualityForNetwork(initialStatus.quality, "initial_setup");
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.networkUnsubscribe) {
      this.networkUnsubscribe();
      this.networkUnsubscribe = null;
    }
  }

  // ==========================================================================
  // Quality Management
  // ==========================================================================

  /**
   * Get the recommended quality level for a network quality
   */
  getQualityForNetwork(networkQuality: NetworkQuality): AudioQualityLevel {
    return this.config.networkQualityMapping[networkQuality];
  }

  /**
   * Set quality level directly
   */
  setQualityLevel(level: AudioQualityLevel, reason: string): void {
    if (level === this._currentLevel) return;

    const previousLevel = this._currentLevel;
    const previousProfile = this._currentProfile;

    this._currentLevel = level;
    this._currentProfile = this.config.profiles[level];
    this.qualityChanges++;
    this.lastChangeTime = Date.now();

    // Reset hysteresis
    this.pendingLevel = null;
    this.hysteresisCounter = 0;

    // Emit change event
    this.emitQualityChange({
      previousLevel,
      newLevel: level,
      previousProfile,
      newProfile: this._currentProfile,
      reason,
      timestamp: Date.now(),
    });
  }

  /**
   * Force a specific profile (bypasses hysteresis)
   */
  forceProfile(profile: AudioQualityProfile): void {
    const previousLevel = this._currentLevel;
    const previousProfile = this._currentProfile;

    this._currentLevel = profile.level;
    this._currentProfile = profile;
    this.qualityChanges++;
    this.lastChangeTime = Date.now();

    this.emitQualityChange({
      previousLevel,
      newLevel: profile.level,
      previousProfile,
      newProfile: profile,
      reason: "forced",
      timestamp: Date.now(),
    });
  }

  // ==========================================================================
  // Network Handling
  // ==========================================================================

  /**
   * Handle network quality changes
   */
  private handleNetworkChange(status: NetworkStatus): void {
    if (!this.config.enabled) return;

    const targetLevel = this.getQualityForNetwork(status.quality);
    this.setQualityForNetwork(status.quality, "network_change");
  }

  /**
   * Set quality based on network quality with hysteresis
   */
  private setQualityForNetwork(
    networkQuality: NetworkQuality,
    reason: string,
  ): void {
    const targetLevel = this.getQualityForNetwork(networkQuality);

    if (targetLevel === this._currentLevel) {
      // Already at target level, reset pending
      this.pendingLevel = null;
      this.hysteresisCounter = 0;
      return;
    }

    // Apply hysteresis
    const hysteresisCount = this.config.aggressive
      ? 1
      : this.config.hysteresisCount;

    if (targetLevel === this.pendingLevel) {
      // Same pending level, increment counter
      this.hysteresisCounter++;

      if (this.hysteresisCounter >= hysteresisCount) {
        // Threshold reached, apply change
        this.setQualityLevel(targetLevel, reason);
      }
    } else {
      // New pending level
      this.pendingLevel = targetLevel;
      this.hysteresisCounter = 1;

      // Immediately switch for downgrades (quality getting worse)
      if (this.isDowngrade(this._currentLevel, targetLevel)) {
        this.setQualityLevel(targetLevel, `${reason}_immediate_downgrade`);
      }
    }
  }

  /**
   * Check if a quality change is a downgrade
   */
  private isDowngrade(from: AudioQualityLevel, to: AudioQualityLevel): boolean {
    const levels: AudioQualityLevel[] = ["high", "medium", "low", "minimum"];
    return levels.indexOf(to) > levels.indexOf(from);
  }

  // ==========================================================================
  // Event Handling
  // ==========================================================================

  /**
   * Subscribe to quality changes
   */
  onQualityChange(handler: QualityChangeHandler): () => void {
    this.changeHandlers.add(handler);
    return () => {
      this.changeHandlers.delete(handler);
    };
  }

  /**
   * Emit quality change event
   */
  private emitQualityChange(event: QualityChangeEvent): void {
    for (const handler of this.changeHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error(
          "[AdaptiveBitrateController] Error in change handler:",
          error,
        );
      }
    }
  }

  // ==========================================================================
  // Stats & Diagnostics
  // ==========================================================================

  /**
   * Get controller stats
   */
  getStats(): {
    currentLevel: AudioQualityLevel;
    currentProfile: AudioQualityProfile;
    qualityChanges: number;
    lastChangeTime: number;
    pendingLevel: AudioQualityLevel | null;
    hysteresisCounter: number;
  } {
    return {
      currentLevel: this._currentLevel,
      currentProfile: this._currentProfile,
      qualityChanges: this.qualityChanges,
      lastChangeTime: this.lastChangeTime,
      pendingLevel: this.pendingLevel,
      hysteresisCounter: this.hysteresisCounter,
    };
  }

  /**
   * Reset stats
   */
  resetStats(): void {
    this.qualityChanges = 0;
    this.lastChangeTime = 0;
  }
}

// ============================================================================
// Audio Encoding Utilities
// ============================================================================

/**
 * Create an AudioEncoder configuration from a quality profile
 *
 * Note: This is for use with the Web Codecs API when available.
 * For broader browser support, consider using opus-recorder or
 * a similar library.
 */
export function createEncoderConfig(
  profile: AudioQualityProfile,
): AudioEncoderConfig | null {
  if (typeof AudioEncoder === "undefined") {
    return null;
  }

  if (profile.codec === "opus") {
    return {
      codec: "opus",
      sampleRate: profile.sampleRate,
      numberOfChannels: 1,
      bitrate: profile.bitrate,
    };
  }

  // PCM doesn't need encoding
  return null;
}

/**
 * Resample audio data from one sample rate to another
 */
export function resampleAudio(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) {
    return input;
  }

  const ratio = toRate / fromRate;
  const outputLength = Math.round(input.length * ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i / ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, input.length - 1);
    const fraction = srcIndex - srcIndexFloor;

    // Linear interpolation
    output[i] =
      input[srcIndexFloor] * (1 - fraction) + input[srcIndexCeil] * fraction;
  }

  return output;
}

/**
 * Convert Float32Array to Int16Array (PCM16)
 */
export function floatToPcm16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);

  for (let i = 0; i < input.length; i++) {
    // Clamp to [-1, 1] and scale to Int16 range
    const sample = Math.max(-1, Math.min(1, input[i]));
    output[i] = Math.round(sample * 32767);
  }

  return output;
}

/**
 * Convert Int16Array (PCM16) to Float32Array
 */
export function pcm16ToFloat(input: Int16Array): Float32Array {
  const output = new Float32Array(input.length);

  for (let i = 0; i < input.length; i++) {
    output[i] = input[i] / 32767;
  }

  return output;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an adaptive bitrate controller
 */
export function createAdaptiveBitrateController(
  config?: Partial<AdaptiveBitrateConfig>,
): AdaptiveBitrateController {
  return new AdaptiveBitrateController(config);
}
