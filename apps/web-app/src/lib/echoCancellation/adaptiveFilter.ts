/**
 * Adaptive Filter for Echo Cancellation
 *
 * Implements NLMS (Normalized Least Mean Squares) adaptive filter
 * for acoustic echo cancellation. This filter learns the echo path
 * and subtracts the estimated echo from the microphone signal.
 *
 * Phase 4: Advanced Audio Processing
 */

import type { AdaptiveFilterConfig } from "./types";
import { DEFAULT_ADAPTIVE_FILTER_CONFIG } from "./types";

// ============================================================================
// NLMS Adaptive Filter
// ============================================================================

/**
 * Normalized Least Mean Squares (NLMS) adaptive filter
 *
 * The NLMS algorithm adapts filter coefficients to minimize
 * the error between the desired signal and the filter output.
 * It's normalized by input power for stable convergence.
 */
export class AdaptiveFilter {
  private config: AdaptiveFilterConfig;

  /** Filter coefficients */
  private coefficients: Float32Array;

  /** Circular input buffer */
  private inputBuffer: Float32Array;

  /** Current position in the circular buffer */
  private bufferIndex: number = 0;

  /** Running estimate of input power */
  private inputPower: number = 0;

  /** Power averaging factor */
  private readonly powerAlpha = 0.95;

  /** Statistics tracking */
  private stats = {
    totalUpdates: 0,
    avgError: 0,
    convergenceMetric: 0,
  };

  constructor(config: Partial<AdaptiveFilterConfig> = {}) {
    this.config = { ...DEFAULT_ADAPTIVE_FILTER_CONFIG, ...config };
    this.coefficients = new Float32Array(this.config.filterLength);
    this.inputBuffer = new Float32Array(this.config.filterLength);
  }

  // ==========================================================================
  // Core Filtering
  // ==========================================================================

  /**
   * Filter the input signal through the adaptive filter
   *
   * @param input - Reference signal (far-end/speaker audio)
   * @returns Estimated echo signal
   */
  filter(input: Float32Array): Float32Array {
    const output = new Float32Array(input.length);

    for (let i = 0; i < input.length; i++) {
      // Store input in circular buffer
      this.inputBuffer[this.bufferIndex] = input[i];

      // Compute filter output (convolution)
      let y = 0;
      for (let j = 0; j < this.config.filterLength; j++) {
        const bufIdx =
          (this.bufferIndex - j + this.config.filterLength) %
          this.config.filterLength;
        y += this.coefficients[j] * this.inputBuffer[bufIdx];
      }
      output[i] = y;

      // Update buffer index
      this.bufferIndex = (this.bufferIndex + 1) % this.config.filterLength;
    }

    return output;
  }

  /**
   * Update filter coefficients using NLMS algorithm
   *
   * @param reference - Reference signal (far-end audio)
   * @param error - Error signal (microphone - estimated echo)
   */
  update(reference: Float32Array, error: Float32Array): void {
    // Update running power estimate
    for (let i = 0; i < reference.length; i++) {
      this.inputPower =
        this.powerAlpha * this.inputPower +
        (1 - this.powerAlpha) * reference[i] * reference[i];
    }

    // Calculate normalized step size
    const normalizedStep =
      this.config.stepSize /
      (this.inputPower * this.config.filterLength + this.config.epsilon);

    // Track statistics
    let errorSum = 0;

    // Update coefficients for each sample
    for (let i = 0; i < error.length; i++) {
      const e = error[i];
      errorSum += Math.abs(e);

      // Double-talk detection: reduce adaptation during double-talk
      let adaptationRate = normalizedStep;
      if (this.config.doubleTalkDetection) {
        const dtd = this.detectDoubleTalk(e, reference[i]);
        if (dtd > this.config.doubleTalkThreshold) {
          adaptationRate *= 0.1; // Slow down adaptation
        }
      }

      // Update each coefficient
      for (let j = 0; j < this.config.filterLength; j++) {
        const refIdx =
          (this.bufferIndex - i - j + this.config.filterLength * 2) %
          this.config.filterLength;
        this.coefficients[j] += adaptationRate * e * this.inputBuffer[refIdx];
      }
    }

    // Update statistics
    this.stats.totalUpdates++;
    this.stats.avgError =
      0.99 * this.stats.avgError + 0.01 * (errorSum / error.length);
    this.stats.convergenceMetric = this.calculateConvergence();
  }

  /**
   * Process microphone signal to remove echo
   *
   * @param micSignal - Microphone input signal
   * @param speakerSignal - Speaker output signal (reference)
   * @returns Echo-cancelled signal
   */
  process(micSignal: Float32Array, speakerSignal: Float32Array): Float32Array {
    // Estimate echo from speaker signal
    const estimatedEcho = this.filter(speakerSignal);

    // Create output buffer
    const output = new Float32Array(micSignal.length);

    // Subtract estimated echo from microphone signal
    for (let i = 0; i < micSignal.length; i++) {
      output[i] = micSignal[i] - estimatedEcho[i];
    }

    // Update filter based on error
    this.update(speakerSignal, output);

    return output;
  }

  // ==========================================================================
  // Double-Talk Detection
  // ==========================================================================

  /**
   * Detect double-talk condition (both near-end and far-end speaking)
   *
   * Uses a simple energy ratio method. More sophisticated methods
   * like the Geigel DTD or cross-correlation DTD could be implemented.
   */
  private detectDoubleTalk(error: number, reference: number): number {
    const errorPower = error * error;
    const refPower = reference * reference + this.config.epsilon;

    // High error relative to reference suggests double-talk
    const ratio = errorPower / refPower;

    // Clamp to 0-1
    return Math.min(1, Math.max(0, ratio / 10));
  }

  // ==========================================================================
  // Convergence Analysis
  // ==========================================================================

  /**
   * Calculate convergence metric based on coefficient stability
   */
  private calculateConvergence(): number {
    // Simple metric: RMS of coefficients (stable filter has consistent coefficients)
    let sum = 0;
    for (let i = 0; i < this.config.filterLength; i++) {
      sum += this.coefficients[i] * this.coefficients[i];
    }
    return Math.sqrt(sum / this.config.filterLength);
  }

  /**
   * Check if filter has converged
   */
  isConverged(): boolean {
    return (
      this.stats.totalUpdates > 100 &&
      this.stats.avgError < 0.1 &&
      this.stats.convergenceMetric > 0.01
    );
  }

  // ==========================================================================
  // Configuration and State
  // ==========================================================================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AdaptiveFilterConfig>): void {
    const prevLength = this.config.filterLength;
    this.config = { ...this.config, ...config };

    // Resize if filter length changed
    if (this.config.filterLength !== prevLength) {
      const newCoeffs = new Float32Array(this.config.filterLength);
      const newBuffer = new Float32Array(this.config.filterLength);

      // Copy existing coefficients
      const copyLength = Math.min(prevLength, this.config.filterLength);
      for (let i = 0; i < copyLength; i++) {
        newCoeffs[i] = this.coefficients[i];
        newBuffer[i] = this.inputBuffer[i];
      }

      this.coefficients = newCoeffs;
      this.inputBuffer = newBuffer;
      this.bufferIndex = Math.min(
        this.bufferIndex,
        this.config.filterLength - 1,
      );
    }
  }

  /**
   * Get current filter coefficients
   */
  getCoefficients(): Float32Array {
    return this.coefficients.slice();
  }

  /**
   * Set filter coefficients (e.g., from saved state)
   */
  setCoefficients(coefficients: Float32Array): void {
    if (coefficients.length === this.config.filterLength) {
      this.coefficients.set(coefficients);
    }
  }

  /**
   * Get filter statistics
   */
  getStats(): {
    totalUpdates: number;
    avgError: number;
    convergenceMetric: number;
    inputPower: number;
  } {
    return {
      ...this.stats,
      inputPower: this.inputPower,
    };
  }

  /**
   * Reset filter state
   */
  reset(): void {
    this.coefficients.fill(0);
    this.inputBuffer.fill(0);
    this.bufferIndex = 0;
    this.inputPower = 0;
    this.stats = {
      totalUpdates: 0,
      avgError: 0,
      convergenceMetric: 0,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new AdaptiveFilter with optional configuration
 */
export function createAdaptiveFilter(
  config?: Partial<AdaptiveFilterConfig>,
): AdaptiveFilter {
  return new AdaptiveFilter(config);
}
