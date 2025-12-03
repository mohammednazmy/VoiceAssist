/**
 * Speaker Reference Tracking
 *
 * Tracks the audio being played through speakers to provide
 * a reference signal for echo cancellation. Handles timing,
 * delay estimation, and automatic gain control.
 *
 * Phase 4: Advanced Audio Processing
 */

import type {
  SpeakerReferenceConfig,
  SpeakerReferenceState,
  DelayEstimationResult,
} from "./types";
import { DEFAULT_SPEAKER_REF_CONFIG } from "./types";

// ============================================================================
// Speaker Reference Tracker
// ============================================================================

/**
 * Tracks speaker audio for use as AEC reference signal
 */
export class SpeakerReference {
  private config: SpeakerReferenceConfig;

  /** Circular buffer for speaker audio */
  private buffer: Float32Array;

  /** Current write position in buffer */
  private writeIndex: number = 0;

  /** Current read position in buffer */
  private readIndex: number = 0;

  /** Number of samples in buffer */
  private samplesInBuffer: number = 0;

  /** AGC gain value */
  private currentGain: number = 1.0;

  /** Estimated delay in samples */
  private estimatedDelay: number = 0;

  /** Last delay estimation confidence */
  private delayConfidence: number = 0;

  /** Whether speaker is currently playing */
  private isPlaying: boolean = false;

  /** Statistics */
  private stats = {
    totalSamplesWritten: 0,
    totalSamplesRead: 0,
    overruns: 0,
    underruns: 0,
  };

  constructor(config: Partial<SpeakerReferenceConfig> = {}) {
    this.config = { ...DEFAULT_SPEAKER_REF_CONFIG, ...config };

    // Create buffer sized for max buffer duration
    const bufferSize = Math.floor(
      this.config.maxBufferSizeSeconds * this.config.sampleRate,
    );
    this.buffer = new Float32Array(bufferSize);
  }

  // ==========================================================================
  // Buffer Management
  // ==========================================================================

  /**
   * Write speaker audio to the reference buffer
   *
   * @param samples - Speaker audio samples
   */
  write(samples: Float32Array): void {
    this.isPlaying = true;

    for (let i = 0; i < samples.length; i++) {
      // Apply AGC if enabled
      let sample = samples[i];
      if (this.config.enableAGC) {
        sample = this.applyAGC(sample);
      }

      // Write to buffer
      this.buffer[this.writeIndex] = sample;
      this.writeIndex = (this.writeIndex + 1) % this.buffer.length;

      // Check for overrun
      if (this.samplesInBuffer >= this.buffer.length) {
        // Buffer full, move read index forward
        this.readIndex = (this.readIndex + 1) % this.buffer.length;
        this.stats.overruns++;
      } else {
        this.samplesInBuffer++;
      }
    }

    this.stats.totalSamplesWritten += samples.length;
  }

  /**
   * Read speaker reference audio with delay compensation
   *
   * @param length - Number of samples to read
   * @returns Reference audio samples
   */
  read(length: number): Float32Array {
    const output = new Float32Array(length);

    // Calculate read position with delay compensation
    const delayedReadIndex =
      (this.readIndex - this.estimatedDelay + this.buffer.length * 2) %
      this.buffer.length;

    for (let i = 0; i < length; i++) {
      if (this.samplesInBuffer > 0) {
        const idx = (delayedReadIndex + i) % this.buffer.length;
        output[i] = this.buffer[idx];
        this.samplesInBuffer--;
      } else {
        // Underrun - no data available
        output[i] = 0;
        this.stats.underruns++;
      }
    }

    // Update read index
    this.readIndex = (this.readIndex + length) % this.buffer.length;
    this.stats.totalSamplesRead += length;

    // Check if buffer is empty
    if (this.samplesInBuffer <= 0) {
      this.isPlaying = false;
    }

    return output;
  }

  /**
   * Get reference audio for a specific time range
   *
   * @param startOffset - Start offset in samples from current position
   * @param length - Number of samples
   */
  getRange(startOffset: number, length: number): Float32Array {
    const output = new Float32Array(length);
    const startIdx =
      (this.writeIndex -
        this.samplesInBuffer +
        startOffset +
        this.buffer.length) %
      this.buffer.length;

    for (let i = 0; i < length; i++) {
      const idx = (startIdx + i) % this.buffer.length;
      output[i] = this.buffer[idx];
    }

    return output;
  }

  // ==========================================================================
  // Automatic Gain Control
  // ==========================================================================

  /**
   * Apply automatic gain control to maintain consistent levels
   */
  private applyAGC(sample: number): number {
    const targetLinear = Math.pow(10, this.config.targetLevel / 20);
    const sampleAbs = Math.abs(sample);

    // Slow attack, fast release
    if (sampleAbs * this.currentGain > targetLinear) {
      // Attack: reduce gain quickly
      this.currentGain *= 0.99;
    } else {
      // Release: increase gain slowly
      this.currentGain = Math.min(10, this.currentGain * 1.0001);
    }

    // Prevent extreme gains
    this.currentGain = Math.max(0.1, Math.min(10, this.currentGain));

    return sample * this.currentGain;
  }

  // ==========================================================================
  // Delay Estimation
  // ==========================================================================

  /**
   * Estimate the delay between speaker output and microphone input
   *
   * Uses cross-correlation to find the delay that maximizes
   * similarity between speaker reference and microphone signal.
   *
   * @param micSignal - Microphone input signal
   * @returns Delay estimation result
   */
  estimateDelay(micSignal: Float32Array): DelayEstimationResult {
    if (
      !this.config.delayEstimation ||
      this.samplesInBuffer < micSignal.length
    ) {
      return {
        delaySamples: this.estimatedDelay,
        delayMs: (this.estimatedDelay / this.config.sampleRate) * 1000,
        confidence: 0,
      };
    }

    // Get reference signal
    const refSignal = this.getRange(-micSignal.length, micSignal.length);

    // Calculate cross-correlation for different delays
    let maxCorrelation = 0;
    let bestDelay = 0;

    const maxDelay = Math.min(
      this.config.maxDelaySamples,
      this.samplesInBuffer,
    );
    const step = 8; // Sample every 8th delay for efficiency

    for (let delay = 0; delay < maxDelay; delay += step) {
      let correlation = 0;
      let refPower = 0;
      let micPower = 0;

      for (let i = 0; i < micSignal.length; i++) {
        const refIdx = i + delay;
        if (refIdx < refSignal.length) {
          correlation += micSignal[i] * refSignal[refIdx];
          refPower += refSignal[refIdx] * refSignal[refIdx];
          micPower += micSignal[i] * micSignal[i];
        }
      }

      // Normalize correlation
      const normFactor = Math.sqrt(refPower * micPower) + 1e-10;
      const normalizedCorr = Math.abs(correlation / normFactor);

      if (normalizedCorr > maxCorrelation) {
        maxCorrelation = normalizedCorr;
        bestDelay = delay;
      }
    }

    // Refine the estimate with finer granularity
    for (
      let delay = Math.max(0, bestDelay - step);
      delay < Math.min(maxDelay, bestDelay + step);
      delay++
    ) {
      let correlation = 0;
      let refPower = 0;
      let micPower = 0;

      for (let i = 0; i < micSignal.length; i++) {
        const refIdx = i + delay;
        if (refIdx < refSignal.length) {
          correlation += micSignal[i] * refSignal[refIdx];
          refPower += refSignal[refIdx] * refSignal[refIdx];
          micPower += micSignal[i] * micSignal[i];
        }
      }

      const normFactor = Math.sqrt(refPower * micPower) + 1e-10;
      const normalizedCorr = Math.abs(correlation / normFactor);

      if (normalizedCorr > maxCorrelation) {
        maxCorrelation = normalizedCorr;
        bestDelay = delay;
      }
    }

    // Update estimate with smoothing
    if (maxCorrelation > 0.3) {
      // Only update if correlation is significant
      this.estimatedDelay = Math.round(
        0.9 * this.estimatedDelay + 0.1 * bestDelay,
      );
      this.delayConfidence = maxCorrelation;
    }

    return {
      delaySamples: this.estimatedDelay,
      delayMs: (this.estimatedDelay / this.config.sampleRate) * 1000,
      confidence: maxCorrelation,
    };
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Get current state
   */
  getState(): SpeakerReferenceState {
    return {
      isPlaying: this.isPlaying,
      bufferLevel: this.samplesInBuffer / this.buffer.length,
      currentGain: this.currentGain,
      estimatedDelay: this.estimatedDelay,
      correlationStrength: this.delayConfidence,
    };
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalSamplesWritten: number;
    totalSamplesRead: number;
    overruns: number;
    underruns: number;
    bufferUtilization: number;
  } {
    return {
      ...this.stats,
      bufferUtilization: this.samplesInBuffer / this.buffer.length,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SpeakerReferenceConfig>): void {
    this.config = { ...this.config, ...config };

    // Resize buffer if needed
    const newSize = Math.floor(
      this.config.maxBufferSizeSeconds * this.config.sampleRate,
    );
    if (newSize !== this.buffer.length) {
      const newBuffer = new Float32Array(newSize);
      // Copy existing data
      const copyLength = Math.min(this.samplesInBuffer, newSize);
      for (let i = 0; i < copyLength; i++) {
        const srcIdx = (this.readIndex + i) % this.buffer.length;
        newBuffer[i] = this.buffer[srcIdx];
      }
      this.buffer = newBuffer;
      this.writeIndex = copyLength % newSize;
      this.readIndex = 0;
      this.samplesInBuffer = copyLength;
    }
  }

  /**
   * Set the estimated delay manually (e.g., from saved calibration)
   */
  setDelay(delaySamples: number): void {
    this.estimatedDelay = Math.max(
      0,
      Math.min(this.config.maxDelaySamples, delaySamples),
    );
  }

  /**
   * Reset buffer and state
   */
  reset(): void {
    this.buffer.fill(0);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.samplesInBuffer = 0;
    this.currentGain = 1.0;
    this.estimatedDelay = 0;
    this.delayConfidence = 0;
    this.isPlaying = false;
    this.stats = {
      totalSamplesWritten: 0,
      totalSamplesRead: 0,
      overruns: 0,
      underruns: 0,
    };
  }

  /**
   * Clear buffer but keep calibration
   */
  clearBuffer(): void {
    this.buffer.fill(0);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.samplesInBuffer = 0;
    this.isPlaying = false;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new SpeakerReference with optional configuration
 */
export function createSpeakerReference(
  config?: Partial<SpeakerReferenceConfig>,
): SpeakerReference {
  return new SpeakerReference(config);
}
