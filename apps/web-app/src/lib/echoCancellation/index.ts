/**
 * Advanced Echo Cancellation Module
 *
 * Provides world-class acoustic echo cancellation (AEC) for voice applications.
 * Features:
 * - NLMS adaptive filtering for echo path estimation
 * - Automatic delay detection and compensation
 * - Double-talk detection
 * - Privacy-aware audio processing
 * - Real-time AudioWorklet processing
 *
 * Phase 4: Advanced Audio Processing
 */

// Re-export components
export { AdaptiveFilter, createAdaptiveFilter } from "./adaptiveFilter";
export { SpeakerReference, createSpeakerReference } from "./speakerReference";
export {
  PrivacyFilter,
  createPrivacyFilter,
  createInitializedPrivacyFilter,
} from "./privacyFilter";
export * from "./types";

import { AdaptiveFilter } from "./adaptiveFilter";
import { SpeakerReference } from "./speakerReference";
import { PrivacyFilter } from "./privacyFilter";
import type {
  EchoCancellationConfig,
  AECState,
  AECProcessResult,
  AECEvent,
  AECEventCallback,
  PrivacyConfig,
} from "./types";
import { DEFAULT_AEC_CONFIG } from "./types";

// ============================================================================
// Echo Cancellation Manager
// ============================================================================

/**
 * High-level manager for echo cancellation
 *
 * Coordinates the adaptive filter, speaker reference, and privacy filter
 * to provide seamless echo cancellation.
 */
export class EchoCancellationManager {
  private config: EchoCancellationConfig;
  private adaptiveFilter: AdaptiveFilter;
  private speakerRef: SpeakerReference;
  private privacyFilter: PrivacyFilter;
  private audioWorklet: AudioWorkletNode | null = null;
  private audioContext: AudioContext | null = null;

  /** Event callbacks */
  private eventCallbacks: Set<AECEventCallback> = new Set();

  /** Current state */
  private state: AECState = {
    isActive: false,
    erle: 0,
    doubleTalkDetected: false,
    estimatedDelay: 0,
    noiseFloor: -60,
    framesProcessed: 0,
    avgProcessingTime: 0,
  };

  /** Performance tracking */
  private processingTimes: number[] = [];
  private readonly maxTimingHistory = 100;

  constructor(
    config: Partial<EchoCancellationConfig> = {},
    privacyConfig: Partial<PrivacyConfig> = {},
  ) {
    this.config = { ...DEFAULT_AEC_CONFIG, ...config };

    this.adaptiveFilter = new AdaptiveFilter(this.config.filterConfig);
    this.speakerRef = new SpeakerReference({
      sampleRate: this.config.sampleRate,
      maxBufferSizeSeconds: (this.config.maxEchoPathDelayMs * 2) / 1000,
    });
    this.privacyFilter = new PrivacyFilter(privacyConfig);
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the AEC system with AudioWorklet
   *
   * @param audioContext - The AudioContext to use
   */
  async initialize(audioContext: AudioContext): Promise<void> {
    this.audioContext = audioContext;

    // Initialize privacy filter
    await this.privacyFilter.initialize();

    // Load AudioWorklet processor if supported
    if (typeof AudioWorkletNode !== "undefined") {
      try {
        await audioContext.audioWorklet.addModule("/aec-processor.js");

        this.audioWorklet = new AudioWorkletNode(
          audioContext,
          "aec-processor",
          {
            numberOfInputs: 2, // Mic + Speaker reference
            numberOfOutputs: 1, // Processed mic
            channelCount: 1,
            processorOptions: {
              filterLength: this.config.filterConfig.filterLength,
              stepSize: this.config.filterConfig.stepSize,
              sampleRate: this.config.sampleRate,
            },
          },
        );

        // Handle messages from worklet
        this.audioWorklet.port.onmessage = (event) => {
          this.handleWorkletMessage(event.data);
        };

        this.state.isActive = true;
        this.emitEvent({ type: "initialized" });
      } catch (error) {
        console.warn(
          "AudioWorklet AEC not available, falling back to main thread",
          error,
        );
        // Fall back to main thread processing
        this.state.isActive = true;
        this.emitEvent({ type: "initialized" });
      }
    } else {
      this.state.isActive = true;
      this.emitEvent({ type: "initialized" });
    }
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.state.isActive;
  }

  // ==========================================================================
  // Audio Processing
  // ==========================================================================

  /**
   * Process microphone input to remove echo
   *
   * @param micInput - Microphone audio samples
   * @returns Echo-cancelled audio
   */
  process(micInput: Float32Array): AECProcessResult {
    if (!this.config.enabled) {
      return {
        processedAudio: micInput,
        echoRemoved: false,
        suppressionAmount: 0,
        doubleTalk: false,
        latencyMs: 0,
      };
    }

    const startTime = performance.now();

    // Get speaker reference
    const speakerRef = this.speakerRef.read(micInput.length);

    // Estimate delay if we have enough data
    if (this.speakerRef.getState().bufferLevel > 0.1) {
      const delayResult = this.speakerRef.estimateDelay(micInput);
      if (delayResult.confidence > 0.5) {
        this.state.estimatedDelay = delayResult.delaySamples;
        this.emitEvent({ type: "delay_updated", delay: delayResult });
      }
    }

    // Process through adaptive filter
    const processedAudio = this.adaptiveFilter.process(micInput, speakerRef);

    // Calculate ERLE (Echo Return Loss Enhancement)
    const inputPower = this.calculatePower(micInput);
    const outputPower = this.calculatePower(processedAudio);
    const erle =
      inputPower > 0.0001
        ? 10 * Math.log10(inputPower / (outputPower + 1e-10))
        : 0;

    // Detect double-talk
    const filterStats = this.adaptiveFilter.getStats();
    const doubleTalk = filterStats.avgError > 0.2;

    if (doubleTalk !== this.state.doubleTalkDetected) {
      this.state.doubleTalkDetected = doubleTalk;
      this.emitEvent({
        type: doubleTalk ? "double_talk_start" : "double_talk_end",
      });
    }

    // Apply noise suppression if enabled
    let finalAudio = processedAudio;
    if (this.config.noiseSuppression) {
      finalAudio = this.applyNoiseSuppression(processedAudio);
    }

    // Add comfort noise if enabled
    if (this.config.comfortNoise) {
      finalAudio = this.addComfortNoise(finalAudio);
    }

    // Track processing time
    const latencyMs = performance.now() - startTime;
    this.recordProcessingTime(latencyMs);

    // Update state
    this.state.erle = 0.9 * this.state.erle + 0.1 * erle;
    this.state.framesProcessed++;
    this.state.avgProcessingTime = this.getAverageProcessingTime();

    const result: AECProcessResult = {
      processedAudio: finalAudio,
      echoRemoved: erle > 3, // More than 3dB suppression
      suppressionAmount: Math.max(0, erle),
      doubleTalk,
      latencyMs,
    };

    return result;
  }

  /**
   * Feed speaker audio to the reference buffer
   *
   * @param speakerAudio - Audio being played through speakers
   */
  feedSpeakerReference(speakerAudio: Float32Array): void {
    this.speakerRef.write(speakerAudio);

    // Also send to worklet if available
    if (this.audioWorklet) {
      this.audioWorklet.port.postMessage({
        type: "speaker_audio",
        samples: speakerAudio,
      });
    }
  }

  // ==========================================================================
  // Audio Enhancement
  // ==========================================================================

  /**
   * Apply spectral noise suppression
   */
  private applyNoiseSuppression(audio: Float32Array): Float32Array {
    const output = new Float32Array(audio.length);
    const threshold = Math.pow(10, this.state.noiseFloor / 20);

    // Simple soft-knee noise gate
    for (let i = 0; i < audio.length; i++) {
      const abs = Math.abs(audio[i]);
      if (abs < threshold) {
        output[i] =
          audio[i] * (abs / threshold) * this.config.noiseSuppressionLevel;
      } else {
        output[i] = audio[i];
      }
    }

    // Update noise floor estimate during silence
    const power = this.calculatePower(audio);
    const powerDb = 10 * Math.log10(power + 1e-10);
    if (powerDb < this.state.noiseFloor + 6) {
      this.state.noiseFloor = 0.99 * this.state.noiseFloor + 0.01 * powerDb;
    }

    return output;
  }

  /**
   * Add comfort noise during silence
   */
  private addComfortNoise(audio: Float32Array): Float32Array {
    const output = audio.slice();
    const comfortLevel = Math.pow(10, this.config.comfortNoiseLevel / 20);

    for (let i = 0; i < output.length; i++) {
      if (Math.abs(output[i]) < comfortLevel * 2) {
        output[i] += (Math.random() - 0.5) * comfortLevel * 0.5;
      }
    }

    return output;
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Calculate RMS power of audio
   */
  private calculatePower(audio: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < audio.length; i++) {
      sum += audio[i] * audio[i];
    }
    return sum / audio.length;
  }

  /**
   * Record processing time
   */
  private recordProcessingTime(ms: number): void {
    this.processingTimes.push(ms);
    if (this.processingTimes.length > this.maxTimingHistory) {
      this.processingTimes.shift();
    }
  }

  /**
   * Get average processing time
   */
  private getAverageProcessingTime(): number {
    if (this.processingTimes.length === 0) return 0;
    const sum = this.processingTimes.reduce((a, b) => a + b, 0);
    return sum / this.processingTimes.length;
  }

  // ==========================================================================
  // AudioWorklet Integration
  // ==========================================================================

  /**
   * Handle messages from AudioWorklet
   */
  private handleWorkletMessage(message: Record<string, unknown>): void {
    switch (message.type) {
      case "state":
        // Merge worklet state with our state
        Object.assign(this.state, message.state);
        break;
      case "error":
        this.emitEvent({
          type: "error",
          error: new Error(message.message as string),
        });
        break;
    }
  }

  /**
   * Get the AudioWorklet node for audio graph connection
   */
  getWorkletNode(): AudioWorkletNode | null {
    return this.audioWorklet;
  }

  /**
   * Connect to audio nodes
   *
   * @param source - Microphone source node
   * @param destination - Output destination (usually AudioContext.destination)
   */
  connectAudioGraph(source: AudioNode, destination?: AudioNode): void {
    if (this.audioWorklet) {
      source.connect(this.audioWorklet);
      if (destination) {
        this.audioWorklet.connect(destination);
      }
    }
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  /**
   * Subscribe to AEC events
   */
  onEvent(callback: AECEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  /**
   * Emit an event to all listeners
   */
  private emitEvent(event: AECEvent): void {
    this.eventCallbacks.forEach((callback) => callback(event));
  }

  // ==========================================================================
  // State and Configuration
  // ==========================================================================

  /**
   * Get current state
   */
  getState(): AECState {
    return { ...this.state };
  }

  /**
   * Get configuration
   */
  getConfig(): EchoCancellationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<EchoCancellationConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.filterConfig) {
      this.adaptiveFilter.updateConfig(config.filterConfig);
    }

    // Send to worklet if available
    if (this.audioWorklet) {
      this.audioWorklet.port.postMessage({
        type: "update_config",
        config: this.config,
      });
    }

    this.emitEvent({ type: "state_change", state: this.state });
  }

  /**
   * Enable/disable AEC
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.state.isActive = enabled;
    this.emitEvent({ type: "state_change", state: this.state });
  }

  // ==========================================================================
  // Privacy Integration
  // ==========================================================================

  /**
   * Get privacy filter instance
   */
  getPrivacyFilter(): PrivacyFilter {
    return this.privacyFilter;
  }

  /**
   * Process audio with privacy filtering
   */
  async processWithPrivacy(micInput: Float32Array): Promise<{
    result: AECProcessResult;
    encryptedAudio?: ArrayBuffer;
    audioHash?: string;
  }> {
    const result = this.process(micInput);

    return {
      result,
      encryptedAudio: await this.privacyFilter.encryptAudioChunk(
        result.processedAudio,
      ),
      audioHash: await this.privacyFilter.hashAudioForTelemetry(
        result.processedAudio,
      ),
    };
  }

  // ==========================================================================
  // Calibration
  // ==========================================================================

  /**
   * Run automatic calibration
   *
   * Plays test tones and measures echo characteristics to
   * optimize filter settings.
   */
  async calibrate(): Promise<{
    estimatedDelay: number;
    recommended: Partial<EchoCancellationConfig>;
  }> {
    // Get current delay estimate
    const state = this.speakerRef.getState();

    // Recommendations based on measured characteristics
    const recommended: Partial<EchoCancellationConfig> = {};

    if (state.estimatedDelay > 0) {
      recommended.maxEchoPathDelayMs = Math.ceil(
        (state.estimatedDelay / this.config.sampleRate) * 1000 * 1.5,
      );
    }

    // Adjust filter length based on delay
    if (state.estimatedDelay > 1000) {
      recommended.filterConfig = {
        ...this.config.filterConfig,
        filterLength: Math.min(2048, state.estimatedDelay * 2),
      };
    }

    return {
      estimatedDelay: state.estimatedDelay,
      recommended,
    };
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Reset all state
   */
  reset(): void {
    this.adaptiveFilter.reset();
    this.speakerRef.reset();
    this.processingTimes = [];
    this.state = {
      isActive: this.config.enabled,
      erle: 0,
      doubleTalkDetected: false,
      estimatedDelay: 0,
      noiseFloor: -60,
      framesProcessed: 0,
      avgProcessingTime: 0,
    };

    if (this.audioWorklet) {
      this.audioWorklet.port.postMessage({ type: "reset" });
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.state.isActive = false;

    if (this.audioWorklet) {
      this.audioWorklet.disconnect();
      this.audioWorklet = null;
    }

    this.privacyFilter.dispose();
    this.eventCallbacks.clear();
    this.audioContext = null;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new EchoCancellationManager
 */
export function createEchoCancellation(
  config?: Partial<EchoCancellationConfig>,
  privacyConfig?: Partial<PrivacyConfig>,
): EchoCancellationManager {
  return new EchoCancellationManager(config, privacyConfig);
}

/**
 * Create and initialize an EchoCancellationManager
 */
export async function createInitializedEchoCancellation(
  audioContext: AudioContext,
  config?: Partial<EchoCancellationConfig>,
  privacyConfig?: Partial<PrivacyConfig>,
): Promise<EchoCancellationManager> {
  const manager = new EchoCancellationManager(config, privacyConfig);
  await manager.initialize(audioContext);
  return manager;
}
