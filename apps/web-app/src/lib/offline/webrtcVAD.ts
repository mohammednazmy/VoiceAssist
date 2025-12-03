/**
 * WebRTC-style Voice Activity Detection
 *
 * Lightweight on-device VAD implementation using energy and
 * zero-crossing rate analysis. Works offline without network.
 *
 * Phase 9: Offline & Low-Latency Fallback
 */

import type {
  VADConfig,
  VADFrameResult,
  VADSpeechSegment,
  VADMode,
} from "./types";
import { DEFAULT_VAD_CONFIG } from "./types";

// ============================================================================
// Types
// ============================================================================

/**
 * VAD processor state
 */
type VADProcessorState = "idle" | "listening" | "speech" | "silence";

/**
 * Internal frame buffer for smoothing
 */
interface FrameBuffer {
  energyHistory: number[];
  zcrHistory: number[];
  maxHistorySize: number;
}

// ============================================================================
// WebRTC VAD Processor
// ============================================================================

/**
 * WebRTC-style VAD processor
 *
 * Uses energy-based detection with zero-crossing rate analysis
 * for robust speech detection without neural networks.
 */
export class WebRTCVADProcessor {
  private config: VADConfig;
  private state: VADProcessorState = "idle";

  /** Frame processing state */
  private consecutiveSpeechFrames = 0;
  private consecutiveSilenceFrames = 0;

  /** Current speech segment tracking */
  private speechStartTime: number | null = null;
  private segmentEnergies: number[] = [];
  private peakEnergy = 0;

  /** Adaptive thresholds */
  private noiseFloor = 0.01;
  private noiseFloorAlpha = 0.995;

  /** Frame buffer for smoothing */
  private buffer: FrameBuffer;

  /** Callbacks */
  private onSpeechStart?: () => void;
  private onSpeechEnd?: (segment: VADSpeechSegment) => void;
  private onFrame?: (result: VADFrameResult) => void;

  constructor(config: Partial<VADConfig> = {}) {
    this.config = { ...DEFAULT_VAD_CONFIG, ...config };
    this.buffer = {
      energyHistory: [],
      zcrHistory: [],
      maxHistorySize: 5,
    };
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Set VAD mode
   */
  setMode(mode: VADMode): void {
    this.config.mode = mode;

    // Adjust thresholds based on mode
    switch (mode) {
      case 0: // Quality - most sensitive
        this.config.energyThreshold = 0.01;
        this.config.minSpeechFrames = 5;
        this.config.minSilenceFrames = 15;
        break;
      case 1:
        this.config.energyThreshold = 0.015;
        this.config.minSpeechFrames = 4;
        this.config.minSilenceFrames = 12;
        break;
      case 2: // Balanced (default)
        this.config.energyThreshold = 0.02;
        this.config.minSpeechFrames = 3;
        this.config.minSilenceFrames = 10;
        break;
      case 3: // Aggressive - least sensitive
        this.config.energyThreshold = 0.03;
        this.config.minSpeechFrames = 2;
        this.config.minSilenceFrames = 8;
        break;
    }
  }

  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: {
    onSpeechStart?: () => void;
    onSpeechEnd?: (segment: VADSpeechSegment) => void;
    onFrame?: (result: VADFrameResult) => void;
  }): void {
    this.onSpeechStart = callbacks.onSpeechStart;
    this.onSpeechEnd = callbacks.onSpeechEnd;
    this.onFrame = callbacks.onFrame;
  }

  // ==========================================================================
  // Audio Processing
  // ==========================================================================

  /**
   * Process an audio frame
   */
  processFrame(audioData: Float32Array): VADFrameResult {
    const timestamp = performance.now();

    // Calculate features
    const energy = this.calculateRMSEnergy(audioData);
    const zcr = this.calculateZeroCrossingRate(audioData);

    // Update adaptive noise floor
    this.updateNoiseFloor(energy);

    // Add to buffer for smoothing
    this.updateBuffer(energy, zcr);

    // Get smoothed values
    const smoothedEnergy = this.getSmoothedEnergy();
    const smoothedZcr = this.getSmoothedZCR();

    // Detect speech using adaptive threshold
    const adaptiveThreshold = Math.max(
      this.config.energyThreshold,
      this.noiseFloor * 3,
    );

    const isSpeech =
      smoothedEnergy > adaptiveThreshold &&
      smoothedZcr < this.config.zcrThreshold;

    const result: VADFrameResult = {
      isSpeech,
      energy: smoothedEnergy,
      zeroCrossingRate: smoothedZcr,
      timestamp,
    };

    // Update state machine
    this.updateState(isSpeech, smoothedEnergy);

    // Notify frame callback
    this.onFrame?.(result);

    return result;
  }

  /**
   * Calculate RMS energy of audio frame
   */
  private calculateRMSEnergy(audioData: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    return Math.sqrt(sum / audioData.length);
  }

  /**
   * Calculate zero-crossing rate
   */
  private calculateZeroCrossingRate(audioData: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < audioData.length; i++) {
      if (audioData[i] >= 0 !== audioData[i - 1] >= 0) {
        crossings++;
      }
    }
    return crossings / audioData.length;
  }

  /**
   * Update adaptive noise floor
   */
  private updateNoiseFloor(energy: number): void {
    // Only update during silence
    if (this.state !== "speech" && energy < this.noiseFloor * 2) {
      this.noiseFloor =
        this.noiseFloorAlpha * this.noiseFloor +
        (1 - this.noiseFloorAlpha) * energy;
    }
  }

  /**
   * Update frame buffer
   */
  private updateBuffer(energy: number, zcr: number): void {
    this.buffer.energyHistory.push(energy);
    this.buffer.zcrHistory.push(zcr);

    if (this.buffer.energyHistory.length > this.buffer.maxHistorySize) {
      this.buffer.energyHistory.shift();
    }
    if (this.buffer.zcrHistory.length > this.buffer.maxHistorySize) {
      this.buffer.zcrHistory.shift();
    }
  }

  /**
   * Get smoothed energy (moving average)
   */
  private getSmoothedEnergy(): number {
    if (this.buffer.energyHistory.length === 0) return 0;
    const sum = this.buffer.energyHistory.reduce((a, b) => a + b, 0);
    return sum / this.buffer.energyHistory.length;
  }

  /**
   * Get smoothed ZCR (moving average)
   */
  private getSmoothedZCR(): number {
    if (this.buffer.zcrHistory.length === 0) return 0;
    const sum = this.buffer.zcrHistory.reduce((a, b) => a + b, 0);
    return sum / this.buffer.zcrHistory.length;
  }

  // ==========================================================================
  // State Machine
  // ==========================================================================

  /**
   * Update VAD state based on frame result
   */
  private updateState(isSpeech: boolean, energy: number): void {
    if (isSpeech) {
      this.consecutiveSpeechFrames++;
      this.consecutiveSilenceFrames = 0;

      // Track segment energy
      this.segmentEnergies.push(energy);
      if (energy > this.peakEnergy) {
        this.peakEnergy = energy;
      }

      // Transition to speech state
      if (
        this.state !== "speech" &&
        this.consecutiveSpeechFrames >= this.config.minSpeechFrames
      ) {
        this.state = "speech";
        this.speechStartTime = performance.now();
        this.onSpeechStart?.();
      }
    } else {
      this.consecutiveSilenceFrames++;

      // Transition to silence state
      if (
        this.state === "speech" &&
        this.consecutiveSilenceFrames >= this.config.minSilenceFrames
      ) {
        const endTime = performance.now();
        const duration = this.speechStartTime
          ? endTime - this.speechStartTime
          : 0;

        const segment: VADSpeechSegment = {
          startTime: this.speechStartTime || endTime,
          endTime,
          duration,
          averageEnergy: this.calculateAverageEnergy(),
          peakEnergy: this.peakEnergy,
        };

        this.onSpeechEnd?.(segment);

        // Reset segment tracking
        this.state = "silence";
        this.speechStartTime = null;
        this.segmentEnergies = [];
        this.peakEnergy = 0;
        this.consecutiveSpeechFrames = 0;
      }
    }
  }

  /**
   * Calculate average energy for current segment
   */
  private calculateAverageEnergy(): number {
    if (this.segmentEnergies.length === 0) return 0;
    const sum = this.segmentEnergies.reduce((a, b) => a + b, 0);
    return sum / this.segmentEnergies.length;
  }

  // ==========================================================================
  // State Access
  // ==========================================================================

  /**
   * Get current state
   */
  getState(): VADProcessorState {
    return this.state;
  }

  /**
   * Check if currently detecting speech
   */
  isSpeaking(): boolean {
    return this.state === "speech";
  }

  /**
   * Get current noise floor estimate
   */
  getNoiseFloor(): number {
    return this.noiseFloor;
  }

  /**
   * Get configuration
   */
  getConfig(): VADConfig {
    return { ...this.config };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start listening
   */
  start(): void {
    this.state = "listening";
  }

  /**
   * Stop listening
   */
  stop(): void {
    this.state = "idle";
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.state = "idle";
    this.consecutiveSpeechFrames = 0;
    this.consecutiveSilenceFrames = 0;
    this.speechStartTime = null;
    this.segmentEnergies = [];
    this.peakEnergy = 0;
    this.noiseFloor = 0.01;
    this.buffer.energyHistory = [];
    this.buffer.zcrHistory = [];
  }
}

// ============================================================================
// Audio Context Manager
// ============================================================================

/**
 * Manages AudioContext and ScriptProcessor for VAD
 */
export class VADAudioManager {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private vadProcessor: WebRTCVADProcessor;

  constructor(vadProcessor: WebRTCVADProcessor) {
    this.vadProcessor = vadProcessor;
  }

  /**
   * Start processing audio from media stream
   */
  async start(stream: MediaStream): Promise<void> {
    const config = this.vadProcessor.getConfig();

    // Create audio context with target sample rate
    this.audioContext = new AudioContext({
      sampleRate: config.sampleRate,
    });

    // Create source from stream
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);

    // Calculate buffer size for frame duration
    const frameSize = (config.frameDuration / 1000) * config.sampleRate;

    // Create script processor (using deprecated API for wide browser support)
    // In production, consider using AudioWorklet for better performance
    this.processorNode = this.audioContext.createScriptProcessor(
      frameSize,
      1,
      1,
    );

    // Process audio frames
    this.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      const audioData = event.inputBuffer.getChannelData(0);
      this.vadProcessor.processFrame(audioData);
    };

    // Connect nodes
    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

    // Start VAD
    this.vadProcessor.start();
  }

  /**
   * Stop processing
   */
  stop(): void {
    this.vadProcessor.stop();

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  /**
   * Check if currently processing
   */
  isProcessing(): boolean {
    return this.audioContext !== null && this.audioContext.state === "running";
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new VAD processor
 */
export function createVADProcessor(
  config?: Partial<VADConfig>,
): WebRTCVADProcessor {
  return new WebRTCVADProcessor(config);
}

/**
 * Create a VAD audio manager with processor
 */
export function createVADAudioManager(config?: Partial<VADConfig>): {
  processor: WebRTCVADProcessor;
  manager: VADAudioManager;
} {
  const processor = new WebRTCVADProcessor(config);
  const manager = new VADAudioManager(processor);
  return { processor, manager };
}
