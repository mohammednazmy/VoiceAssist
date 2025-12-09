/**
 * Prosody Extractor
 *
 * Extracts prosodic features from audio for natural turn-taking.
 * Wraps ProsodicAnalyzer and provides WebSocket-friendly output.
 *
 * Features extracted:
 * - Pitch contour (rising = question, falling = statement)
 * - Energy decay pattern (trailing off = incomplete)
 * - Speech rate changes (slowing = finishing, speeding = continuing)
 *
 * Natural Conversation Flow: Phase 3.1 - Frontend Prosody Feature Extraction
 */

import {
  ProsodicAnalyzer,
  createProsodicAnalyzer,
} from "./turnTaking/prosodicAnalyzer";
import type {
  ProsodicFeatures,
  ProsodicAnalyzerConfig,
} from "./turnTaking/types";
import { voiceLog } from "./logger";

// ============================================================================
// Types
// ============================================================================

/**
 * Prosody features formatted for WebSocket transmission
 */
export interface ProsodyWebSocketMessage {
  /** Pitch in Hz (fundamental frequency) */
  pitch: number;
  /** Pitch contour direction */
  pitch_contour: "rising" | "falling" | "flat" | "complex";
  /** Pitch variation (std dev) */
  pitch_variation: number;
  /** Energy level (0-1 normalized RMS) */
  energy: number;
  /** Energy decay: positive = increasing, negative = decreasing */
  energy_decay: number;
  /** Speaking rate (syllables per second estimate) */
  speaking_rate: number;
  /** Voice activity confidence (0-1) */
  voice_activity: number;
  /** Whether speech appears to be ending */
  is_ending: boolean;
  /** Whether speech appears to be questioning */
  is_question: boolean;
  /** Timestamp in ms */
  timestamp: number;
}

/**
 * Configuration for ProsodyExtractor
 */
export interface ProsodyExtractorConfig extends Partial<ProsodicAnalyzerConfig> {
  /** Window size for energy decay calculation (frames) */
  energyDecayWindow?: number;
  /** Minimum voice activity to include in prosody message */
  minVoiceActivity?: number;
  /** Sample rate (must match audio input) */
  sampleRate?: number;
}

/**
 * Default prosody extractor configuration
 */
export const DEFAULT_PROSODY_EXTRACTOR_CONFIG: Required<ProsodyExtractorConfig> =
  {
    sampleRate: 16000,
    frameSize: 512, // 32ms at 16kHz
    hopSize: 160, // 10ms at 16kHz
    minPitch: 60,
    maxPitch: 500,
    pitchSmoothing: 0.9,
    energyThreshold: 0.01,
    energyDecayWindow: 5,
    minVoiceActivity: 0.3,
  };

// ============================================================================
// ProsodyExtractor Class
// ============================================================================

/**
 * Extracts prosodic features from audio frames for natural turn-taking
 */
export class ProsodyExtractor {
  private analyzer: ProsodicAnalyzer;
  private config: Required<ProsodyExtractorConfig>;
  private enabled: boolean = true;

  /** Recent energy values for decay calculation */
  private energyHistory: number[] = [];

  /** Statistics */
  private stats = {
    framesProcessed: 0,
    messagesGenerated: 0,
    avgPitch: 0,
    avgEnergy: 0,
  };

  constructor(config: ProsodyExtractorConfig = {}) {
    this.config = { ...DEFAULT_PROSODY_EXTRACTOR_CONFIG, ...config };
    this.analyzer = createProsodicAnalyzer({
      sampleRate: this.config.sampleRate,
      frameSize: this.config.frameSize,
      hopSize: this.config.hopSize,
      minPitch: this.config.minPitch,
      maxPitch: this.config.maxPitch,
      pitchSmoothing: this.config.pitchSmoothing,
      energyThreshold: this.config.energyThreshold,
    });

    voiceLog.debug("[ProsodyExtractor] Initialized with config:", this.config);
  }

  // ==========================================================================
  // Main API
  // ==========================================================================

  /**
   * Process audio samples and extract prosody features
   *
   * @param samples - Audio samples (mono, float32)
   * @returns Prosody features for WebSocket transmission, or null if insufficient data
   */
  process(samples: Float32Array): ProsodyWebSocketMessage | null {
    if (!this.enabled) {
      return null;
    }

    // Analyze with prosodic analyzer
    const features = this.analyzer.analyze(samples);

    // Track energy history for decay calculation
    this.energyHistory.push(features.energy);
    if (this.energyHistory.length > this.config.energyDecayWindow) {
      this.energyHistory.shift();
    }

    // Calculate energy decay
    const energyDecay = this.calculateEnergyDecay();

    // Update statistics
    this.stats.framesProcessed++;
    if (features.pitch > 0) {
      this.stats.avgPitch = 0.99 * this.stats.avgPitch + 0.01 * features.pitch;
    }
    this.stats.avgEnergy = 0.99 * this.stats.avgEnergy + 0.01 * features.energy;

    // Only generate message if voice activity is above threshold
    if (features.voiceActivity < this.config.minVoiceActivity) {
      return null;
    }

    this.stats.messagesGenerated++;

    return this.formatForWebSocket(features, energyDecay);
  }

  /**
   * Process a complete utterance and get summary prosody features
   *
   * @param allSamples - All audio samples from utterance
   * @returns Summary prosody features for the complete utterance
   */
  processUtterance(allSamples: Float32Array): ProsodyWebSocketMessage | null {
    if (!this.enabled || allSamples.length === 0) {
      return null;
    }

    // Reset for fresh analysis
    this.analyzer.reset();
    this.energyHistory = [];

    // Process in frames
    const frameSize = this.config.frameSize;
    const hopSize = this.config.hopSize;
    let lastFeatures: ProsodicFeatures | null = null;

    for (
      let offset = 0;
      offset + frameSize <= allSamples.length;
      offset += hopSize
    ) {
      const frame = allSamples.slice(offset, offset + frameSize);
      lastFeatures = this.analyzer.analyze(frame);
      this.energyHistory.push(lastFeatures.energy);
      if (this.energyHistory.length > this.config.energyDecayWindow) {
        this.energyHistory.shift();
      }
    }

    if (!lastFeatures) {
      return null;
    }

    // Get final energy decay
    const energyDecay = this.calculateEnergyDecay();

    return this.formatForWebSocket(lastFeatures, energyDecay);
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Calculate energy decay from history
   * Positive = energy increasing, Negative = energy decreasing
   */
  private calculateEnergyDecay(): number {
    if (this.energyHistory.length < 2) {
      return 0;
    }

    // Simple linear trend of energy
    const n = this.energyHistory.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += this.energyHistory[i];
      sumXY += i * this.energyHistory[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX + 1e-10);

    // Normalize slope to -1 to 1 range
    // Typical energy values are 0-0.3, so scale accordingly
    return Math.max(-1, Math.min(1, slope * 10));
  }

  /**
   * Format prosody features for WebSocket transmission
   */
  private formatForWebSocket(
    features: ProsodicFeatures,
    energyDecay: number,
  ): ProsodyWebSocketMessage {
    return {
      pitch: Math.round(features.pitch * 10) / 10, // Round to 1 decimal
      pitch_contour: features.pitchContour,
      pitch_variation: Math.round(features.pitchVariation * 10) / 10,
      energy: Math.round(features.energy * 1000) / 1000, // Round to 3 decimals
      energy_decay: Math.round(energyDecay * 100) / 100,
      speaking_rate: Math.round(features.speakingRate * 10) / 10,
      voice_activity: Math.round(features.voiceActivity * 100) / 100,
      is_ending: features.isEnding,
      is_question: features.isQuestion,
      timestamp: features.timestamp,
    };
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Enable or disable prosody extraction
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    voiceLog.debug(`[ProsodyExtractor] ${enabled ? "Enabled" : "Disabled"}`);
  }

  /**
   * Check if extractor is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ProsodyExtractorConfig>): void {
    this.config = { ...this.config, ...config };
    this.analyzer.updateConfig({
      sampleRate: this.config.sampleRate,
      frameSize: this.config.frameSize,
      hopSize: this.config.hopSize,
      minPitch: this.config.minPitch,
      maxPitch: this.config.maxPitch,
      pitchSmoothing: this.config.pitchSmoothing,
      energyThreshold: this.config.energyThreshold,
    });
    voiceLog.debug("[ProsodyExtractor] Config updated:", config);
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<ProsodyExtractorConfig> {
    return { ...this.config };
  }

  /**
   * Get statistics
   */
  getStats(): {
    framesProcessed: number;
    messagesGenerated: number;
    avgPitch: number;
    avgEnergy: number;
    analyzerStats: ReturnType<ProsodicAnalyzer["getStats"]>;
  } {
    return {
      ...this.stats,
      analyzerStats: this.analyzer.getStats(),
    };
  }

  /**
   * Reset state
   */
  reset(): void {
    this.analyzer.reset();
    this.energyHistory = [];
    this.stats = {
      framesProcessed: 0,
      messagesGenerated: 0,
      avgPitch: 0,
      avgEnergy: 0,
    };
    voiceLog.debug("[ProsodyExtractor] Reset");
  }

  /**
   * Destroy and clean up resources
   */
  destroy(): void {
    this.reset();
    this.enabled = false;
    voiceLog.debug("[ProsodyExtractor] Destroyed");
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new ProsodyExtractor with optional configuration
 */
export function createProsodyExtractor(
  config?: ProsodyExtractorConfig,
): ProsodyExtractor {
  return new ProsodyExtractor(config);
}

/**
 * Check if prosody extraction is supported in this environment
 */
export function isProsodyExtractionSupported(): boolean {
  // Prosody extraction requires Float32Array and basic math
  // It should work in all modern browsers
  return typeof Float32Array !== "undefined";
}
