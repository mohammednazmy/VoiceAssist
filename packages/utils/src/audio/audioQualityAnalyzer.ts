/**
 * Audio Quality Analyzer
 *
 * Analyzes audio quality to detect noise, clipping, and other issues
 * that may affect voice recognition accuracy.
 *
 * Phase 6: Edge Case Hardening
 * Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md
 */

// =============================================================================
// Types
// =============================================================================

export interface AudioQualityMetrics {
  /** Signal-to-noise ratio in dB (higher is better) */
  snrDb: number;
  /** RMS energy level (0-1) */
  rmsLevel: number;
  /** Peak level (0-1) */
  peakLevel: number;
  /** Whether clipping was detected */
  isClipping: boolean;
  /** Whether audio is too quiet */
  isTooQuiet: boolean;
  /** Whether excessive noise was detected */
  isNoisy: boolean;
  /** Overall quality score (0-1) */
  qualityScore: number;
  /** Confidence in voice activity detection */
  vadConfidence: number;
}

export interface NoiseProfile {
  /** Background noise level (0-1) */
  noiseFloor: number;
  /** Type of detected noise */
  noiseType: "none" | "white" | "ambient" | "impulsive" | "unknown";
  /** Estimated SNR for voice frequency band */
  voiceBandSnr: number;
  /** Frequency with highest noise energy (Hz) */
  dominantNoiseFreq: number;
}

export interface AudioQualityConfig {
  /** Minimum acceptable SNR in dB */
  minSnrDb: number;
  /** Maximum acceptable peak level (0-1) */
  maxPeakLevel: number;
  /** Minimum acceptable RMS level (0-1) */
  minRmsLevel: number;
  /** Sample rate for analysis */
  sampleRate: number;
  /** FFT size for frequency analysis */
  fftSize: number;
}

export const DEFAULT_AUDIO_QUALITY_CONFIG: AudioQualityConfig = {
  minSnrDb: 10,
  maxPeakLevel: 0.95,
  minRmsLevel: 0.01,
  sampleRate: 16000,
  fftSize: 256,
};

// =============================================================================
// Audio Quality Analyzer
// =============================================================================

export class AudioQualityAnalyzer {
  private config: AudioQualityConfig;
  private noiseFloorEstimate: number = 0;
  private signalHistory: number[] = [];
  private readonly historySize = 50;

  constructor(config: Partial<AudioQualityConfig> = {}) {
    this.config = { ...DEFAULT_AUDIO_QUALITY_CONFIG, ...config };
  }

  // ===========================================================================
  // Main Analysis
  // ===========================================================================

  /**
   * Analyze audio quality from samples.
   */
  analyze(samples: Float32Array): AudioQualityMetrics {
    const rmsLevel = this.calculateRms(samples);
    const peakLevel = this.calculatePeak(samples);
    const snrDb = this.estimateSnr(samples);
    const vadConfidence = this.estimateVadConfidence(samples);

    // Update signal history
    this.signalHistory.push(rmsLevel);
    if (this.signalHistory.length > this.historySize) {
      this.signalHistory.shift();
    }

    // Detect issues
    const isClipping = peakLevel > this.config.maxPeakLevel;
    const isTooQuiet = rmsLevel < this.config.minRmsLevel;
    const isNoisy = snrDb < this.config.minSnrDb;

    // Calculate overall quality score
    const qualityScore = this.calculateQualityScore(
      snrDb,
      rmsLevel,
      peakLevel,
      isClipping,
      isTooQuiet,
      isNoisy
    );

    return {
      snrDb,
      rmsLevel,
      peakLevel,
      isClipping,
      isTooQuiet,
      isNoisy,
      qualityScore,
      vadConfidence,
    };
  }

  /**
   * Analyze noise profile from samples.
   */
  analyzeNoiseProfile(samples: Float32Array): NoiseProfile {
    // Estimate noise floor from quiet portions
    const sortedRms = [...this.signalHistory].sort((a, b) => a - b);
    const noiseFloor =
      sortedRms.length > 0
        ? sortedRms[Math.floor(sortedRms.length * 0.1)]
        : this.calculateRms(samples);

    // Simple noise type classification
    const zeroCrossingRate = this.calculateZeroCrossingRate(samples);
    const spectralFlatness = this.calculateSpectralFlatness(samples);

    let noiseType: NoiseProfile["noiseType"] = "none";
    if (noiseFloor > 0.01) {
      if (spectralFlatness > 0.7) {
        noiseType = "white";
      } else if (zeroCrossingRate < 0.1) {
        noiseType = "ambient";
      } else if (this.hasImpulsiveNoise(samples)) {
        noiseType = "impulsive";
      } else {
        noiseType = "unknown";
      }
    }

    // Estimate SNR in voice frequency band (300Hz - 3000Hz)
    const voiceBandEnergy = this.calculateVoiceBandEnergy(samples);
    const voiceBandSnr = this.energyToDb(voiceBandEnergy / (noiseFloor + 1e-10));

    // Find dominant noise frequency
    const dominantNoiseFreq = this.findDominantFrequency(samples);

    return {
      noiseFloor,
      noiseType,
      voiceBandSnr,
      dominantNoiseFreq,
    };
  }

  // ===========================================================================
  // Quality Recommendations
  // ===========================================================================

  /**
   * Get recommendations based on audio quality.
   */
  getRecommendations(metrics: AudioQualityMetrics): string[] {
    const recommendations: string[] = [];

    if (metrics.isClipping) {
      recommendations.push("Reduce microphone gain or speak farther from mic");
    }

    if (metrics.isTooQuiet) {
      recommendations.push("Increase microphone gain or speak louder/closer to mic");
    }

    if (metrics.isNoisy) {
      recommendations.push("Move to a quieter environment or use noise-canceling mic");
    }

    if (metrics.snrDb < 5) {
      recommendations.push("Background noise is very high, speech recognition may be unreliable");
    }

    if (metrics.qualityScore < 0.5) {
      recommendations.push("Audio quality is poor, consider troubleshooting microphone setup");
    }

    return recommendations;
  }

  /**
   * Check if audio quality is acceptable for voice recognition.
   */
  isAcceptable(metrics: AudioQualityMetrics): boolean {
    return (
      metrics.qualityScore >= 0.5 &&
      !metrics.isClipping &&
      metrics.snrDb >= this.config.minSnrDb / 2 // Allow some margin
    );
  }

  // ===========================================================================
  // Internal Calculations
  // ===========================================================================

  private calculateRms(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  private calculatePeak(samples: Float32Array): number {
    let max = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > max) max = abs;
    }
    return max;
  }

  private estimateSnr(samples: Float32Array): number {
    const rms = this.calculateRms(samples);

    // Update noise floor estimate from quiet portions
    if (rms < this.noiseFloorEstimate * 0.5 || this.noiseFloorEstimate === 0) {
      this.noiseFloorEstimate = this.noiseFloorEstimate * 0.95 + rms * 0.05;
    }

    if (this.noiseFloorEstimate < 1e-10) {
      return 60; // Very clean signal
    }

    return this.energyToDb(rms / this.noiseFloorEstimate);
  }

  private estimateVadConfidence(samples: Float32Array): number {
    const rms = this.calculateRms(samples);
    const zeroCrossing = this.calculateZeroCrossingRate(samples);

    // Higher RMS and lower zero crossing rate indicates speech
    const rmsScore = Math.min(rms / 0.1, 1);
    const zcScore = 1 - Math.min(zeroCrossing / 0.5, 1);

    return rmsScore * 0.7 + zcScore * 0.3;
  }

  private calculateQualityScore(
    snrDb: number,
    rmsLevel: number,
    peakLevel: number,
    isClipping: boolean,
    isTooQuiet: boolean,
    isNoisy: boolean
  ): number {
    let score = 1.0;

    // SNR contribution (0-40 dB range)
    score *= Math.min(snrDb / 40, 1);

    // Level contribution
    const idealRms = 0.1;
    const rmsDeviation = Math.abs(rmsLevel - idealRms) / idealRms;
    score *= Math.max(0, 1 - rmsDeviation * 0.5);

    // Penalties
    if (isClipping) score *= 0.5;
    if (isTooQuiet) score *= 0.7;
    if (isNoisy) score *= 0.8;

    return Math.max(0, Math.min(1, score));
  }

  private calculateZeroCrossingRate(samples: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < samples.length; i++) {
      if ((samples[i] >= 0 && samples[i - 1] < 0) || (samples[i] < 0 && samples[i - 1] >= 0)) {
        crossings++;
      }
    }
    return crossings / samples.length;
  }

  private calculateSpectralFlatness(samples: Float32Array): number {
    // Simple estimation using signal variance
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    let variance = 0;
    for (let i = 0; i < samples.length; i++) {
      variance += (samples[i] - mean) ** 2;
    }
    variance /= samples.length;

    // Higher variance relative to mean indicates flatter spectrum
    const rms = this.calculateRms(samples);
    if (rms < 1e-10) return 0;

    return Math.min(variance / (rms * rms), 1);
  }

  private hasImpulsiveNoise(samples: Float32Array): boolean {
    const mean = this.calculateRms(samples);
    let impulsiveCount = 0;

    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i]) > mean * 3) {
        impulsiveCount++;
      }
    }

    return impulsiveCount / samples.length > 0.01;
  }

  private calculateVoiceBandEnergy(samples: Float32Array): number {
    // Simple bandpass filter approximation
    const lowCutoff = 300 / (this.config.sampleRate / 2);
    const highCutoff = 3000 / (this.config.sampleRate / 2);

    let energy = 0;
    let prevSample = 0;

    for (let i = 0; i < samples.length; i++) {
      // Simple high-pass
      const highPassed = samples[i] - prevSample * (1 - lowCutoff);
      prevSample = samples[i];

      // Simple low-pass (very approximate)
      const filtered = highPassed * highCutoff;

      energy += filtered * filtered;
    }

    return Math.sqrt(energy / samples.length);
  }

  private findDominantFrequency(samples: Float32Array): number {
    // Simple zero-crossing based frequency estimation
    let crossings = 0;
    for (let i = 1; i < samples.length; i++) {
      if ((samples[i] >= 0 && samples[i - 1] < 0) || (samples[i] < 0 && samples[i - 1] >= 0)) {
        crossings++;
      }
    }

    // Each full cycle has 2 crossings
    const estimatedFreq =
      (crossings / 2 / (samples.length / this.config.sampleRate));

    return estimatedFreq;
  }

  private energyToDb(ratio: number): number {
    if (ratio <= 0) return -Infinity;
    return 20 * Math.log10(ratio);
  }

  // ===========================================================================
  // Reset
  // ===========================================================================

  reset(): void {
    this.noiseFloorEstimate = 0;
    this.signalHistory = [];
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createAudioQualityAnalyzer(
  config?: Partial<AudioQualityConfig>
): AudioQualityAnalyzer {
  return new AudioQualityAnalyzer(config);
}
