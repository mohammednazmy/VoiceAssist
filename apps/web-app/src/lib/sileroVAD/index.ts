/**
 * Silero VAD Integration with Multilingual Support
 *
 * Silero VAD is a neural network-based Voice Activity Detector that runs
 * in WebAssembly via ONNX Runtime Web. It provides:
 * - 95%+ accuracy on speech detection
 * - ~30ms latency for onset detection
 * - Robustness to background noise
 * - Language-agnostic core with language-specific tuning
 *
 * Model: silero_vad.onnx (~2MB) or silero_vad_lite.onnx (~500KB for offline)
 * Input: 512 samples at 16kHz (32ms chunks)
 * Output: Probability of speech (0-1)
 *
 * Phase 1: Neural VAD Integration
 */

import type { SupportedLanguage } from "../../hooks/useIntelligentBargeIn/types";
import {
  type SileroVADConfig,
  type VADProcessResult,
  type CalibrationData,
  type SileroVADState,
  DEFAULT_SILERO_CONFIG,
  INITIAL_SILERO_STATE,
  LANGUAGE_VAD_CONFIGS,
} from "./types";
import { createLogger } from "../logger";

const sileroLog = createLogger("SileroVAD");

// ============================================================================
// SileroVAD Class
// ============================================================================

/**
 * Silero VAD wrapper for speech detection
 *
 * Uses ONNX Runtime Web for inference on the Silero VAD model.
 * Supports adaptive thresholds and language-specific tuning.
 */
export class SileroVAD {
  private config: SileroVADConfig;
  private state: SileroVADState;
  private worker: Worker | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;

  // Buffer for audio samples
  private audioBuffer: Float32Array[] = [];
  private calibrationSamples: Float32Array[] = [];

  // Timing
  private lastProcessTime = 0;
  private processingTimes: number[] = [];

  constructor(config: Partial<SileroVADConfig> = {}) {
    // Apply language-specific config adjustments
    const langConfig = LANGUAGE_VAD_CONFIGS[config.language || "en"];
    const adjustedThreshold =
      (config.speechThreshold || DEFAULT_SILERO_CONFIG.speechThreshold) +
      langConfig.speechThresholdOffset;

    this.config = {
      ...DEFAULT_SILERO_CONFIG,
      ...config,
      speechThreshold: adjustedThreshold,
    };

    this.state = { ...INITIAL_SILERO_STATE };
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Initialize the VAD system
   * Loads the ONNX model and sets up the audio processing pipeline
   */
  async initialize(): Promise<void> {
    if (this.state.isLoaded) {
      sileroLog.warn("Already initialized");
      return;
    }

    try {
      // Create audio context
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate,
      });

      // Load the AudioWorklet processor
      await this.audioContext.audioWorklet.addModule("/vad-processor.js");

      // Initialize the Web Worker for ONNX inference
      this.worker = new Worker(new URL("./vadWorker.ts", import.meta.url), {
        type: "module",
      });

      // Set up worker message handling
      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = this.handleWorkerError.bind(this);

      // Initialize the model in the worker
      this.worker.postMessage({
        type: "init",
        modelPath: this.config.modelPath,
      });

      // Wait for worker to be ready
      await this.waitForWorkerReady();

      this.state.isLoaded = true;
      sileroLog.info("Initialized successfully");
    } catch (error) {
      sileroLog.error("Initialization failed:", error);
      throw error;
    }
  }

  /**
   * Start processing audio from a media stream
   */
  async start(stream?: MediaStream): Promise<void> {
    if (!this.state.isLoaded) {
      throw new Error("SileroVAD not initialized. Call initialize() first.");
    }

    if (!this.audioContext) {
      throw new Error("AudioContext not available");
    }

    // Get microphone stream if not provided
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: this.config.sampleRate,
          channelCount: 1,
        },
      });
    }

    this.stream = stream;

    // Resume audio context if suspended
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    // Create audio nodes
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.processorNode = new AudioWorkletNode(
      this.audioContext,
      "vad-processor",
      {
        processorOptions: {
          windowSize: this.config.windowSize,
          sampleRate: this.config.sampleRate,
        },
      },
    );

    // Handle audio data from the processor
    this.processorNode.port.onmessage = (event) => {
      const { audioData, timestamp } = event.data;
      this.processAudioChunk(new Float32Array(audioData), timestamp);
    };

    // Connect the audio graph
    this.sourceNode.connect(this.processorNode);

    sileroLog.info("Started audio processing");
  }

  /**
   * Stop processing audio
   */
  stop(): void {
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    // Reset state
    this.state.isSpeaking = false;
    this.state.speechStartTime = null;
    this.state.consecutiveSpeechWindows = 0;
    this.state.consecutiveSilenceWindows = 0;

    sileroLog.info("Stopped audio processing");
  }

  /**
   * Destroy the VAD instance and release resources
   */
  async destroy(): Promise<void> {
    this.stop();

    if (this.worker) {
      this.worker.postMessage({ type: "destroy" });
      this.worker.terminate();
      this.worker = null;
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.state = { ...INITIAL_SILERO_STATE };
    sileroLog.info("Destroyed");
  }

  // ============================================================================
  // Calibration Methods
  // ============================================================================

  /**
   * Start ambient noise calibration
   * Collects audio samples to determine optimal thresholds
   */
  async calibrate(): Promise<CalibrationData> {
    if (!this.state.isLoaded) {
      throw new Error("SileroVAD not initialized");
    }

    this.state.isCalibrating = true;
    this.calibrationSamples = [];

    sileroLog.info("Starting calibration...");

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.state.isCalibrating = false;
        reject(new Error("Calibration timeout"));
      }, this.config.calibrationDurationMs + 1000);

      // Collect samples during calibration period
      const collectSamples = (audioData: Float32Array) => {
        if (this.state.isCalibrating) {
          this.calibrationSamples.push(audioData);
        }
      };

      // Store original callback
      const originalCallback = this.config.onVADResult;
      this.config.onVADResult = (result) => {
        originalCallback?.(result);
      };

      // Listen for audio data during calibration
      const originalOnMessage = this.processorNode?.port.onmessage;
      if (this.processorNode) {
        this.processorNode.port.onmessage = (event) => {
          collectSamples(new Float32Array(event.data.audioData));
          if (originalOnMessage) {
            originalOnMessage.call(this.processorNode!.port, event);
          }
        };
      }

      // After calibration duration, compute thresholds
      setTimeout(() => {
        clearTimeout(timeout);
        this.state.isCalibrating = false;

        // Restore original handler
        if (this.processorNode && originalOnMessage) {
          this.processorNode.port.onmessage = originalOnMessage;
        }

        // Compute calibration result
        const result = this.computeCalibration();
        this.state.adaptedThreshold = result.recommendedVadThreshold;

        this.config.onCalibrationComplete?.(result);
        resolve(result);
      }, this.config.calibrationDurationMs);
    });
  }

  /**
   * Compute calibration thresholds from collected samples
   */
  private computeCalibration(): CalibrationData {
    if (this.calibrationSamples.length === 0) {
      return {
        ambientNoiseLevel: 0.05,
        recommendedVadThreshold: this.config.speechThreshold,
        recommendedSilenceThreshold: this.config.silenceThreshold,
        environmentType: "quiet",
        calibratedAt: Date.now(),
      };
    }

    // Calculate RMS energy of calibration samples
    let totalEnergy = 0;
    let sampleCount = 0;

    for (const chunk of this.calibrationSamples) {
      for (let i = 0; i < chunk.length; i++) {
        totalEnergy += chunk[i] * chunk[i];
        sampleCount++;
      }
    }

    const rmsEnergy = Math.sqrt(totalEnergy / sampleCount);

    // Classify environment
    let environmentType: "quiet" | "moderate" | "noisy";
    let thresholdAdjustment: number;

    if (rmsEnergy < 0.02) {
      environmentType = "quiet";
      thresholdAdjustment = -0.1; // Lower threshold for quiet environments
    } else if (rmsEnergy < 0.1) {
      environmentType = "moderate";
      thresholdAdjustment = 0;
    } else {
      environmentType = "noisy";
      thresholdAdjustment = 0.15; // Higher threshold for noisy environments
    }

    const recommendedVadThreshold = Math.max(
      0.3,
      Math.min(0.8, this.config.speechThreshold + thresholdAdjustment),
    );

    const recommendedSilenceThreshold = Math.max(
      0.2,
      recommendedVadThreshold - 0.15,
    );

    sileroLog.info(
      `Calibration complete: ${environmentType} environment, threshold: ${recommendedVadThreshold.toFixed(2)}`,
    );

    return {
      ambientNoiseLevel: rmsEnergy,
      recommendedVadThreshold,
      recommendedSilenceThreshold,
      environmentType,
      calibratedAt: Date.now(),
    };
  }

  // ============================================================================
  // Audio Processing Methods
  // ============================================================================

  /**
   * Process an audio chunk through the VAD
   */
  private processAudioChunk(audioData: Float32Array, timestamp: number): void {
    if (!this.worker || this.state.isCalibrating) {
      return;
    }

    this.lastProcessTime = performance.now();

    // Send to worker for ONNX inference
    this.worker.postMessage(
      {
        type: "process",
        audioData: audioData,
        timestamp,
      },
      [audioData.buffer],
    );
  }

  /**
   * Handle VAD result from the worker
   */
  private handleVADResult(result: VADProcessResult): void {
    const processingTime = performance.now() - this.lastProcessTime;
    this.processingTimes.push(processingTime);
    if (this.processingTimes.length > 100) {
      this.processingTimes.shift();
    }

    // Apply adaptive threshold
    const threshold = this.config.adaptiveThreshold
      ? this.state.adaptedThreshold
      : this.config.speechThreshold;

    const isSpeech = result.probability >= threshold;
    this.state.lastProbability = result.probability;

    if (isSpeech) {
      this.state.consecutiveSpeechWindows++;
      this.state.consecutiveSilenceWindows = 0;

      // Check for speech onset
      if (
        !this.state.isSpeaking &&
        this.state.consecutiveSpeechWindows >= this.config.minSpeechDuration
      ) {
        this.state.isSpeaking = true;
        this.state.speechStartTime = result.timestamp;

        const confidence = this.calculateConfidence(result.probability);
        this.config.onSpeechStart?.(confidence, this.config.language);
      }
    } else {
      this.state.consecutiveSilenceWindows++;
      this.state.consecutiveSpeechWindows = 0;

      // Check for speech end
      if (
        this.state.isSpeaking &&
        this.state.consecutiveSilenceWindows >= this.config.minSilenceDuration
      ) {
        const duration = this.state.speechStartTime
          ? result.timestamp - this.state.speechStartTime
          : 0;

        this.state.isSpeaking = false;
        this.state.speechStartTime = null;

        this.config.onSpeechEnd?.(duration);
      }
    }

    // Emit result with processing time
    const enhancedResult: VADProcessResult = {
      ...result,
      isSpeech,
      processingTime,
    };

    this.config.onVADResult?.(enhancedResult);
  }

  /**
   * Calculate confidence level from probability
   */
  private calculateConfidence(probability: number): number {
    // Normalize to 0-1 based on threshold
    const threshold = this.state.adaptedThreshold;
    const normalized = (probability - threshold) / (1 - threshold);
    return Math.max(0, Math.min(1, normalized));
  }

  // ============================================================================
  // Worker Communication
  // ============================================================================

  /**
   * Wait for the worker to signal ready
   */
  private waitForWorkerReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Worker initialization timeout"));
      }, 10000);

      const handler = (event: MessageEvent) => {
        if (event.data.type === "ready") {
          clearTimeout(timeout);
          this.worker?.removeEventListener("message", handler);
          resolve();
        } else if (event.data.type === "error") {
          clearTimeout(timeout);
          this.worker?.removeEventListener("message", handler);
          reject(new Error(event.data.message));
        }
      };

      this.worker?.addEventListener("message", handler);
    });
  }

  /**
   * Handle messages from the worker
   */
  private handleWorkerMessage(event: MessageEvent): void {
    const { type, data, message } = event.data;

    switch (type) {
      case "result":
        this.handleVADResult(data);
        break;
      case "calibration":
        this.config.onCalibrationComplete?.(data);
        break;
      case "error":
        sileroLog.error("Worker error:", message);
        break;
      case "destroyed":
        sileroLog.info("Worker destroyed");
        break;
    }
  }

  /**
   * Handle worker errors
   */
  private handleWorkerError(error: ErrorEvent): void {
    sileroLog.error("Worker error:", error);
  }

  // ============================================================================
  // Configuration Methods
  // ============================================================================

  /**
   * Update VAD configuration
   */
  updateConfig(config: Partial<SileroVADConfig>): void {
    // Apply language-specific adjustments if language changed
    if (config.language && config.language !== this.config.language) {
      const langConfig = LANGUAGE_VAD_CONFIGS[config.language];
      config.speechThreshold =
        (config.speechThreshold || this.config.speechThreshold) +
        langConfig.speechThresholdOffset;
    }

    this.config = { ...this.config, ...config };

    // Send config update to worker
    this.worker?.postMessage({
      type: "updateConfig",
      config,
    });
  }

  /**
   * Set the language for VAD tuning
   */
  setLanguage(language: SupportedLanguage): void {
    this.updateConfig({ language });
  }

  // ============================================================================
  // Getters
  // ============================================================================

  /**
   * Get current VAD state
   */
  getState(): Readonly<SileroVADState> {
    return { ...this.state };
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<SileroVADConfig> {
    return { ...this.config };
  }

  /**
   * Get average processing time
   */
  getAverageProcessingTime(): number {
    if (this.processingTimes.length === 0) return 0;
    return (
      this.processingTimes.reduce((a, b) => a + b, 0) /
      this.processingTimes.length
    );
  }

  /**
   * Check if currently speaking
   */
  isSpeaking(): boolean {
    return this.state.isSpeaking;
  }

  /**
   * Check if loaded and ready
   */
  isReady(): boolean {
    return this.state.isLoaded;
  }

  /**
   * Get current speech probability
   */
  getCurrentProbability(): number {
    return this.state.lastProbability;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new SileroVAD instance with optional configuration
 */
export function createSileroVAD(config?: Partial<SileroVADConfig>): SileroVAD {
  return new SileroVAD(config);
}

// Re-export types
export * from "./types";
