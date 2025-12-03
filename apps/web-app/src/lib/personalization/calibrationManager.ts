/**
 * Calibration Manager
 *
 * Manages voice calibration sessions to optimize VAD and
 * speech detection thresholds for individual users.
 *
 * Phase 8: Adaptive Personalization
 */

import type {
  CalibrationResult,
  CalibrationState,
  CalibrationProgress,
} from "./types";

// ============================================================================
// Types
// ============================================================================

/**
 * Calibration manager configuration
 */
export interface CalibrationManagerConfig {
  /** Duration to measure background noise (ms) */
  noiseMeasurementDuration: number;

  /** Duration to measure voice (ms) */
  voiceMeasurementDuration: number;

  /** Minimum samples needed for calibration */
  minSamples: number;

  /** Sample rate for audio analysis */
  sampleRate: number;

  /** Frame size for analysis (samples) */
  frameSize: number;
}

/**
 * Default calibration configuration
 */
const DEFAULT_CONFIG: CalibrationManagerConfig = {
  noiseMeasurementDuration: 3000,
  voiceMeasurementDuration: 5000,
  minSamples: 100,
  sampleRate: 16000,
  frameSize: 512,
};

/**
 * Calibration measurement data
 */
interface CalibrationMeasurements {
  noiseEnergies: number[];
  voiceEnergies: number[];
  pitchValues: number[];
  zeroCrossingRates: number[];
  timestamps: number[];
}

// ============================================================================
// Calibration Manager
// ============================================================================

/**
 * Manages voice calibration sessions
 */
export class CalibrationManager {
  private config: CalibrationManagerConfig;

  /** Current state */
  private state: CalibrationState = "idle";

  /** Measurements collected during calibration */
  private measurements: CalibrationMeasurements | null = null;

  /** Audio context for analysis */
  private audioContext: AudioContext | null = null;

  /** Analyser node */
  private analyser: AnalyserNode | null = null;

  /** Media stream source */
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;

  /** Active media stream */
  private mediaStream: MediaStream | null = null;

  /** Analysis interval */
  private analysisInterval: number | null = null;

  /** State change callback */
  private onProgressCallback: ((progress: CalibrationProgress) => void) | null =
    null;

  constructor(config: Partial<CalibrationManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Start a calibration session
   */
  async startCalibration(
    onProgress?: (progress: CalibrationProgress) => void,
  ): Promise<CalibrationResult> {
    if (this.state !== "idle") {
      throw new Error("Calibration already in progress");
    }

    this.onProgressCallback = onProgress ?? null;

    try {
      // Initialize
      this.updateState("preparing", 0, "Preparing calibration...");
      await this.initializeAudio();

      // Measure background noise
      this.updateState(
        "measuring_noise",
        10,
        "Measuring background noise...",
        "Please remain quiet for a few seconds",
      );
      await this.measureNoise();

      // Wait for user to start speaking
      this.updateState(
        "waiting_speech",
        40,
        "Waiting for speech...",
        "Please say a few sentences naturally",
      );
      await this.waitForSpeech();

      // Measure voice characteristics
      this.updateState(
        "measuring_voice",
        50,
        "Measuring voice characteristics...",
        "Keep talking naturally",
      );
      await this.measureVoice();

      // Analyze and generate result
      this.updateState("analyzing", 90, "Analyzing measurements...");
      const result = this.analyzeAndGenerateResult();

      // Complete
      this.updateState("complete", 100, "Calibration complete!");

      return result;
    } catch (error) {
      this.updateState(
        "error",
        0,
        `Calibration failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      throw error;
    } finally {
      this.cleanup();
    }
  }

  /**
   * Cancel ongoing calibration
   */
  cancel(): void {
    if (this.state !== "idle") {
      this.cleanup();
      this.state = "idle";
    }
  }

  /**
   * Get current calibration state
   */
  getState(): CalibrationState {
    return this.state;
  }

  // ==========================================================================
  // Audio Initialization
  // ==========================================================================

  /**
   * Initialize audio context and get microphone access
   */
  private async initializeAudio(): Promise<void> {
    // Get microphone access
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false, // We want raw audio for calibration
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: this.config.sampleRate,
      },
    });

    // Create audio context
    this.audioContext = new AudioContext({
      sampleRate: this.config.sampleRate,
    });

    // Create analyser
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = this.config.frameSize * 2;
    this.analyser.smoothingTimeConstant = 0.3;

    // Connect microphone to analyser
    this.mediaStreamSource = this.audioContext.createMediaStreamSource(
      this.mediaStream,
    );
    this.mediaStreamSource.connect(this.analyser);

    // Initialize measurements
    this.measurements = {
      noiseEnergies: [],
      voiceEnergies: [],
      pitchValues: [],
      zeroCrossingRates: [],
      timestamps: [],
    };
  }

  // ==========================================================================
  // Measurement Methods
  // ==========================================================================

  /**
   * Measure background noise
   */
  private async measureNoise(): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const buffer = new Float32Array(this.analyser!.fftSize);

      this.analysisInterval = window.setInterval(() => {
        this.analyser!.getFloatTimeDomainData(buffer);
        const energy = this.calculateRMS(buffer);
        this.measurements!.noiseEnergies.push(energy);

        const elapsed = Date.now() - startTime;
        const progress =
          10 + (elapsed / this.config.noiseMeasurementDuration) * 30;
        this.updateState(
          "measuring_noise",
          Math.min(40, progress),
          "Measuring background noise...",
        );

        if (elapsed >= this.config.noiseMeasurementDuration) {
          window.clearInterval(this.analysisInterval!);
          this.analysisInterval = null;
          resolve();
        }
      }, 50);
    });
  }

  /**
   * Wait for user to start speaking
   */
  private async waitForSpeech(): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const buffer = new Float32Array(this.analyser!.fftSize);
      const noiseFloor = this.getNoiseFloor();
      const speechThreshold = noiseFloor * 3; // Voice should be 3x louder than noise
      let _speechDetected = false;

      this.analysisInterval = window.setInterval(() => {
        this.analyser!.getFloatTimeDomainData(buffer);
        const energy = this.calculateRMS(buffer);

        if (energy > speechThreshold) {
          _speechDetected = true;
          window.clearInterval(this.analysisInterval!);
          this.analysisInterval = null;
          resolve();
        }

        const elapsed = Date.now() - startTime;
        if (elapsed > 15000) {
          // 15 second timeout
          window.clearInterval(this.analysisInterval!);
          this.analysisInterval = null;
          reject(new Error("Timeout waiting for speech"));
        }
      }, 50);
    });
  }

  /**
   * Measure voice characteristics
   */
  private async measureVoice(): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const buffer = new Float32Array(this.analyser!.fftSize);
      const noiseFloor = this.getNoiseFloor();

      this.analysisInterval = window.setInterval(() => {
        this.analyser!.getFloatTimeDomainData(buffer);
        const energy = this.calculateRMS(buffer);
        const zcr = this.calculateZeroCrossingRate(buffer);

        // Only record if likely speech (above noise floor)
        if (energy > noiseFloor * 2) {
          this.measurements!.voiceEnergies.push(energy);
          this.measurements!.zeroCrossingRates.push(zcr);
          this.measurements!.timestamps.push(Date.now());

          // Estimate pitch
          const pitch = this.estimatePitch(buffer);
          if (pitch > 0) {
            this.measurements!.pitchValues.push(pitch);
          }
        }

        const elapsed = Date.now() - startTime;
        const progress =
          50 + (elapsed / this.config.voiceMeasurementDuration) * 40;
        this.updateState(
          "measuring_voice",
          Math.min(90, progress),
          "Measuring voice characteristics...",
        );

        if (elapsed >= this.config.voiceMeasurementDuration) {
          window.clearInterval(this.analysisInterval!);
          this.analysisInterval = null;
          resolve();
        }
      }, 50);
    });
  }

  // ==========================================================================
  // Analysis Methods
  // ==========================================================================

  /**
   * Analyze measurements and generate calibration result
   */
  private analyzeAndGenerateResult(): CalibrationResult {
    if (!this.measurements) {
      throw new Error("No measurements available");
    }

    const noiseFloor = this.getNoiseFloor();
    const voiceLevel = this.getVoiceLevel();
    const snr = voiceLevel / Math.max(noiseFloor, 0.0001);

    // Calculate pitch statistics
    const pitchStats = this.calculatePitchStats();

    // Calculate speaking rate estimate
    const speakingRate = this.estimateSpeakingRate();

    // Determine environment type
    const environment = this.classifyEnvironment(noiseFloor);

    // Calculate recommended thresholds
    const recommendedVadThreshold = this.calculateRecommendedVadThreshold(
      noiseFloor,
      voiceLevel,
    );
    const recommendedSilenceThreshold =
      this.calculateRecommendedSilenceThreshold(noiseFloor, voiceLevel);

    // Calculate quality score
    const qualityScore = this.calculateQualityScore(snr);

    return {
      id: this.generateId(),
      timestamp: Date.now(),
      backgroundNoiseLevel: this.toDecibels(noiseFloor),
      voiceEnergyLevel: this.toDecibels(voiceLevel),
      recommendedVadThreshold,
      recommendedSilenceThreshold,
      pitchRange: pitchStats,
      speakingRate,
      qualityScore,
      duration:
        this.config.noiseMeasurementDuration +
        this.config.voiceMeasurementDuration,
      environment,
    };
  }

  /**
   * Get noise floor from measurements
   */
  private getNoiseFloor(): number {
    if (!this.measurements || this.measurements.noiseEnergies.length === 0) {
      return 0.01;
    }
    // Use median for robustness
    const sorted = [...this.measurements.noiseEnergies].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  /**
   * Get voice level from measurements
   */
  private getVoiceLevel(): number {
    if (!this.measurements || this.measurements.voiceEnergies.length === 0) {
      return 0.1;
    }
    // Use 75th percentile for typical voice level
    const sorted = [...this.measurements.voiceEnergies].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.75)];
  }

  /**
   * Calculate pitch statistics
   */
  private calculatePitchStats(): { min: number; max: number; mean: number } {
    if (!this.measurements || this.measurements.pitchValues.length === 0) {
      return { min: 85, max: 255, mean: 150 };
    }

    const pitches = this.measurements.pitchValues.filter(
      (p) => p > 50 && p < 500,
    );
    if (pitches.length === 0) {
      return { min: 85, max: 255, mean: 150 };
    }

    return {
      min: Math.min(...pitches),
      max: Math.max(...pitches),
      mean: pitches.reduce((a, b) => a + b, 0) / pitches.length,
    };
  }

  /**
   * Estimate speaking rate from voice segments
   */
  private estimateSpeakingRate(): number {
    if (!this.measurements || this.measurements.timestamps.length < 2) {
      return 4.5; // Default syllables per second
    }

    // Count transitions between speech and silence as rough syllable boundaries
    const energies = this.measurements.voiceEnergies;
    const noiseFloor = this.getNoiseFloor();
    let transitions = 0;
    let inSpeech = false;

    for (const energy of energies) {
      const isSpeech = energy > noiseFloor * 2;
      if (isSpeech !== inSpeech) {
        transitions++;
        inSpeech = isSpeech;
      }
    }

    // Rough estimate: transitions / 2 = syllables, divide by duration
    const durationSec = this.config.voiceMeasurementDuration / 1000;
    return Math.max(2, Math.min(8, transitions / 2 / durationSec));
  }

  /**
   * Classify environment based on noise level
   */
  private classifyEnvironment(
    noiseFloor: number,
  ): "quiet" | "moderate" | "noisy" | "outdoor" {
    const noiseDb = this.toDecibels(noiseFloor);
    if (noiseDb < -50) return "quiet";
    if (noiseDb < -35) return "moderate";
    if (noiseDb < -20) return "noisy";
    return "outdoor";
  }

  /**
   * Calculate recommended VAD threshold
   */
  private calculateRecommendedVadThreshold(
    noiseFloor: number,
    voiceLevel: number,
  ): number {
    const snr = voiceLevel / Math.max(noiseFloor, 0.0001);

    // Higher SNR allows lower threshold
    if (snr > 20) return 0.4;
    if (snr > 10) return 0.5;
    if (snr > 5) return 0.6;
    return 0.7;
  }

  /**
   * Calculate recommended silence threshold
   */
  private calculateRecommendedSilenceThreshold(
    noiseFloor: number,
    voiceLevel: number,
  ): number {
    // Silence threshold should be between noise and voice
    const midpoint = (noiseFloor + voiceLevel) / 2;
    return Math.min(0.5, Math.max(0.2, midpoint * 2));
  }

  /**
   * Calculate quality score
   */
  private calculateQualityScore(snr: number): number {
    // Quality based on SNR and sample count
    let score = 0;

    // SNR contribution (0-0.5)
    if (snr > 20) score += 0.5;
    else if (snr > 10) score += 0.4;
    else if (snr > 5) score += 0.3;
    else score += 0.1;

    // Sample count contribution (0-0.3)
    if (this.measurements) {
      const sampleCount = this.measurements.voiceEnergies.length;
      if (sampleCount > this.config.minSamples) score += 0.3;
      else score += 0.3 * (sampleCount / this.config.minSamples);
    }

    // Pitch detection contribution (0-0.2)
    if (this.measurements && this.measurements.pitchValues.length > 10) {
      score += 0.2;
    }

    return Math.min(1, score);
  }

  // ==========================================================================
  // Audio Analysis Helpers
  // ==========================================================================

  /**
   * Calculate RMS energy
   */
  private calculateRMS(buffer: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  }

  /**
   * Calculate zero crossing rate
   */
  private calculateZeroCrossingRate(buffer: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < buffer.length; i++) {
      if (buffer[i] >= 0 !== buffer[i - 1] >= 0) {
        crossings++;
      }
    }
    return crossings / buffer.length;
  }

  /**
   * Simple pitch estimation using autocorrelation
   */
  private estimatePitch(buffer: Float32Array): number {
    const sampleRate = this.config.sampleRate;
    const minPeriod = Math.floor(sampleRate / 500); // Max 500 Hz
    const maxPeriod = Math.floor(sampleRate / 50); // Min 50 Hz

    let bestCorrelation = 0;
    let bestPeriod = 0;

    for (let period = minPeriod; period < maxPeriod; period++) {
      let correlation = 0;
      let normalization = 0;

      for (let i = 0; i < buffer.length - period; i++) {
        correlation += buffer[i] * buffer[i + period];
        normalization += buffer[i] * buffer[i];
      }

      if (normalization > 0) {
        correlation /= normalization;
        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestPeriod = period;
        }
      }
    }

    if (bestCorrelation > 0.5 && bestPeriod > 0) {
      return sampleRate / bestPeriod;
    }

    return 0; // No clear pitch detected
  }

  /**
   * Convert linear amplitude to decibels
   */
  private toDecibels(amplitude: number): number {
    return 20 * Math.log10(Math.max(amplitude, 0.0001));
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Update state and notify callback
   */
  private updateState(
    state: CalibrationState,
    progress: number,
    message: string,
    instruction?: string,
  ): void {
    this.state = state;

    if (this.onProgressCallback) {
      this.onProgressCallback({
        state,
        progress,
        message,
        instruction,
      });
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `cal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.analysisInterval) {
      window.clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }

    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }

    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.measurements = null;
    this.state = "idle";
    this.onProgressCallback = null;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new CalibrationManager
 */
export function createCalibrationManager(
  config?: Partial<CalibrationManagerConfig>,
): CalibrationManager {
  return new CalibrationManager(config);
}
