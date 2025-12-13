/**
 * Prosodic Analyzer
 *
 * Analyzes pitch, intonation, and prosodic features of speech
 * to determine turn-taking cues. Detects rising/falling intonation,
 * questions, and end-of-turn patterns.
 *
 * Phase 5: Natural Turn-Taking
 */

import type { ProsodicFeatures, ProsodicAnalyzerConfig } from "./types";
import { DEFAULT_PROSODIC_CONFIG } from "./types";

// ============================================================================
// Prosodic Analyzer
// ============================================================================

/**
 * Analyzes prosodic features of speech for natural turn-taking
 */
export class ProsodicAnalyzer {
  private config: ProsodicAnalyzerConfig;

  /** Recent pitch values for contour analysis */
  private pitchHistory: number[] = [];
  private readonly PITCH_HISTORY_SIZE = 20;

  /** Recent energy values */
  private energyHistory: number[] = [];
  private readonly ENERGY_HISTORY_SIZE = 10;

  /** Smoothed pitch tracker */
  private smoothedPitch: number = 0;

  /** Statistics */
  private stats = {
    framesAnalyzed: 0,
    questionsDetected: 0,
    endingsDetected: 0,
    avgPitch: 0,
    avgEnergy: 0,
  };

  constructor(config: Partial<ProsodicAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_PROSODIC_CONFIG, ...config };
  }

  // ==========================================================================
  // Main Analysis
  // ==========================================================================

  /**
   * Analyze a frame of audio for prosodic features
   *
   * @param samples - Audio samples (mono, float32)
   * @returns Prosodic features
   */
  analyze(samples: Float32Array): ProsodicFeatures {
    const timestamp = Date.now();

    // Calculate energy (RMS)
    const energy = this.calculateEnergy(samples);
    this.energyHistory.push(energy);
    if (this.energyHistory.length > this.ENERGY_HISTORY_SIZE) {
      this.energyHistory.shift();
    }

    // Detect voice activity
    const voiceActivity = this.detectVoiceActivity(energy);

    // Extract pitch if voice is active
    let pitch = 0;
    let pitchVariation = 0;

    if (voiceActivity > 0.5) {
      pitch = this.estimatePitch(samples);
      if (pitch > 0) {
        this.pitchHistory.push(pitch);
        if (this.pitchHistory.length > this.PITCH_HISTORY_SIZE) {
          this.pitchHistory.shift();
        }
        pitchVariation = this.calculatePitchVariation();

        // Smooth pitch tracking
        this.smoothedPitch =
          this.config.pitchSmoothing * this.smoothedPitch +
          (1 - this.config.pitchSmoothing) * pitch;
      }
    }

    // Analyze pitch contour
    const pitchContour = this.analyzePitchContour();

    // Estimate speaking rate
    const speakingRate = this.estimateSpeakingRate(samples, energy);

    // Detect end-of-turn patterns
    const isEnding = this.detectEnding(pitch, energy, pitchContour);

    // Detect questions
    const isQuestion = this.detectQuestion(pitchContour);

    // Update statistics
    this.stats.framesAnalyzed++;
    if (pitch > 0) {
      this.stats.avgPitch = 0.99 * this.stats.avgPitch + 0.01 * pitch;
    }
    this.stats.avgEnergy = 0.99 * this.stats.avgEnergy + 0.01 * energy;

    if (isQuestion) this.stats.questionsDetected++;
    if (isEnding) this.stats.endingsDetected++;

    return {
      pitch: this.smoothedPitch,
      pitchVariation,
      speakingRate,
      energy,
      voiceActivity,
      pitchContour,
      isEnding,
      isQuestion,
      timestamp,
    };
  }

  // ==========================================================================
  // Energy Analysis
  // ==========================================================================

  /**
   * Calculate RMS energy of audio frame
   */
  private calculateEnergy(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  /**
   * Detect voice activity based on energy
   */
  private detectVoiceActivity(energy: number): number {
    if (energy < this.config.energyThreshold) {
      return 0;
    }

    // Normalized confidence based on energy
    const maxExpectedEnergy = 0.3;
    const confidence = Math.min(1, energy / maxExpectedEnergy);

    return confidence;
  }

  // ==========================================================================
  // Pitch Estimation
  // ==========================================================================

  /**
   * Estimate fundamental frequency using autocorrelation
   *
   * A simplified pitch detection algorithm. For production,
   * consider using YIN or CREPE for better accuracy.
   */
  private estimatePitch(samples: Float32Array): number {
    const minPeriod = Math.floor(this.config.sampleRate / this.config.maxPitch);
    const maxPeriod = Math.floor(this.config.sampleRate / this.config.minPitch);

    // Apply simple pre-emphasis to enhance pitch detection
    const preEmphasis = new Float32Array(samples.length);
    for (let i = 1; i < samples.length; i++) {
      preEmphasis[i] = samples[i] - 0.97 * samples[i - 1];
    }

    // Autocorrelation-based pitch detection
    let maxCorrelation = 0;
    let bestPeriod = 0;

    for (let period = minPeriod; period < maxPeriod; period++) {
      let correlation = 0;
      let denominator = 0;

      for (let i = 0; i < samples.length - period; i++) {
        correlation += preEmphasis[i] * preEmphasis[i + period];
        denominator +=
          preEmphasis[i] * preEmphasis[i] +
          preEmphasis[i + period] * preEmphasis[i + period];
      }

      // Normalized correlation
      const normalized = (2 * correlation) / (denominator + 1e-10);

      if (normalized > maxCorrelation) {
        maxCorrelation = normalized;
        bestPeriod = period;
      }
    }

    // Only return pitch if correlation is strong enough
    if (maxCorrelation > 0.4 && bestPeriod > 0) {
      return this.config.sampleRate / bestPeriod;
    }

    return 0;
  }

  /**
   * Calculate pitch variation (standard deviation)
   */
  private calculatePitchVariation(): number {
    if (this.pitchHistory.length < 2) return 0;

    const mean =
      this.pitchHistory.reduce((a, b) => a + b, 0) / this.pitchHistory.length;
    const variance =
      this.pitchHistory.reduce((sum, p) => sum + (p - mean) ** 2, 0) /
      this.pitchHistory.length;

    return Math.sqrt(variance);
  }

  // ==========================================================================
  // Pitch Contour Analysis
  // ==========================================================================

  /**
   * Analyze the pitch contour to determine intonation pattern
   */
  private analyzePitchContour(): "rising" | "falling" | "flat" | "complex" {
    if (this.pitchHistory.length < 5) {
      return "flat";
    }

    // Get recent pitch values
    const recent = this.pitchHistory.slice(-10);

    // Calculate trend using linear regression
    const trend = this.calculateTrend(recent);

    // Threshold for considering contour as rising/falling
    const trendThreshold = 5; // Hz per frame

    if (trend > trendThreshold) {
      return "rising";
    } else if (trend < -trendThreshold) {
      return "falling";
    }

    // Check for complexity (non-monotonic)
    const directions: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      directions.push(Math.sign(recent[i] - recent[i - 1]));
    }
    const directionChanges = directions.filter(
      (d, i) => i > 0 && d !== directions[i - 1],
    ).length;

    if (directionChanges > 3) {
      return "complex";
    }

    return "flat";
  }

  /**
   * Calculate trend using simple linear regression
   */
  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;

    const n = values.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX + 1e-10);

    return slope;
  }

  // ==========================================================================
  // Turn-Taking Detection
  // ==========================================================================

  /**
   * Detect end-of-turn patterns
   *
   * End of turn is typically indicated by:
   * - Falling intonation
   * - Decreasing energy
   * - Lower pitch
   */
  private detectEnding(
    pitch: number,
    energy: number,
    contour: string,
  ): boolean {
    // Check for falling contour (typical sentence ending)
    const hasFallingContour = contour === "falling";

    // Check for decreasing energy
    let hasDecreasingEnergy = false;
    if (this.energyHistory.length >= 3) {
      const recent = this.energyHistory.slice(-3);
      hasDecreasingEnergy = recent[2] < recent[1] && recent[1] < recent[0];
    }

    // Check if pitch is below average (sentence-final lowering)
    const hasFinalLowering = pitch > 0 && pitch < this.stats.avgPitch * 0.9;

    // End of turn if multiple indicators are present
    return (
      (hasFallingContour && hasDecreasingEnergy) ||
      (hasFallingContour && hasFinalLowering) ||
      (hasDecreasingEnergy && hasFinalLowering)
    );
  }

  /**
   * Detect question intonation
   *
   * Questions (in many languages) are indicated by:
   * - Rising intonation at the end
   * - Higher pitch variance
   */
  private detectQuestion(contour: string): boolean {
    // Rising contour is a strong indicator of questions
    if (contour === "rising") {
      return true;
    }

    // Complex contour with overall rising trend
    if (contour === "complex" && this.pitchHistory.length >= 5) {
      const trend = this.calculateTrend(this.pitchHistory.slice(-5));
      return trend > 3;
    }

    return false;
  }

  // ==========================================================================
  // Speaking Rate Estimation
  // ==========================================================================

  /**
   * Estimate speaking rate based on energy envelope
   *
   * This is a simplified approach that counts energy peaks
   * as syllable approximation.
   */
  private estimateSpeakingRate(
    _samples: Float32Array,
    _currentEnergy: number,
  ): number {
    if (this.energyHistory.length < 5) {
      return 0;
    }

    // Count peaks in energy history (syllable approximation)
    let peaks = 0;
    for (let i = 1; i < this.energyHistory.length - 1; i++) {
      if (
        this.energyHistory[i] > this.energyHistory[i - 1] &&
        this.energyHistory[i] > this.energyHistory[i + 1] &&
        this.energyHistory[i] > this.config.energyThreshold
      ) {
        peaks++;
      }
    }

    // Calculate time span (each frame is hopSize samples)
    const timeSpanSeconds =
      (this.energyHistory.length * this.config.hopSize) /
      this.config.sampleRate;

    // Syllables per second
    return peaks / timeSpanSeconds;
  }

  // ==========================================================================
  // Configuration and State
  // ==========================================================================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ProsodicAnalyzerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ProsodicAnalyzerConfig {
    return { ...this.config };
  }

  /**
   * Get statistics
   */
  getStats(): {
    framesAnalyzed: number;
    questionsDetected: number;
    endingsDetected: number;
    avgPitch: number;
    avgEnergy: number;
  } {
    return { ...this.stats };
  }

  /**
   * Get recent pitch history
   */
  getPitchHistory(): number[] {
    return [...this.pitchHistory];
  }

  /**
   * Reset state
   */
  reset(): void {
    this.pitchHistory = [];
    this.energyHistory = [];
    this.smoothedPitch = 0;
    this.stats = {
      framesAnalyzed: 0,
      questionsDetected: 0,
      endingsDetected: 0,
      avgPitch: 0,
      avgEnergy: 0,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new ProsodicAnalyzer with optional configuration
 */
export function createProsodicAnalyzer(
  config?: Partial<ProsodicAnalyzerConfig>,
): ProsodicAnalyzer {
  return new ProsodicAnalyzer(config);
}
