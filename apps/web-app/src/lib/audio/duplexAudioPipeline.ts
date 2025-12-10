/**
 * Duplex Audio Pipeline
 *
 * Enables full-duplex voice communication with echo cancellation.
 * Uses AudioWorklet for real-time AEC processing.
 *
 * Phase 4: Duplex Audio Architecture
 * Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md
 */

// =============================================================================
// Types
// =============================================================================

export interface DuplexAudioConfig {
  /** Enable echo cancellation */
  aecEnabled: boolean;
  /** AEC filter tail length in ms (default: 128ms) */
  aecTailLengthMs: number;

  /** Enable noise suppression */
  nsEnabled: boolean;
  /** Noise suppression level */
  nsLevel: "low" | "moderate" | "high" | "very_high";

  /** Enable automatic gain control */
  agcEnabled: boolean;
  /** AGC target level in dBFS (default: -3) */
  agcTargetLevel: number;

  /** VAD threshold during AI playback (higher = less sensitive) */
  vadThresholdDuringPlayback: number;
  /** Minimum speech duration during playback (ms) */
  vadMinSpeechDuringPlayback: number;

  /** Sample rate (default: 16000) */
  sampleRate: number;
}

export const DEFAULT_DUPLEX_CONFIG: DuplexAudioConfig = {
  aecEnabled: true,
  aecTailLengthMs: 128,
  nsEnabled: true,
  nsLevel: "moderate",
  agcEnabled: true,
  agcTargetLevel: -3,
  vadThresholdDuringPlayback: 0.7, // Higher than normal 0.5
  vadMinSpeechDuringPlayback: 200, // Longer than normal 150ms
  sampleRate: 16000,
};

export interface AECState {
  isActive: boolean;
  erle: number; // Echo Return Loss Enhancement in dB
  doubleTalkDetected: boolean;
  framesProcessed: number;
  avgProcessingTime: number;
}

export interface DuplexPipelineState {
  isInitialized: boolean;
  isMicActive: boolean;
  isPlaybackActive: boolean;
  aecState: AECState | null;
  currentVADThreshold: number;
}

export type DuplexStateChangeCallback = (state: DuplexPipelineState) => void;
export type AECStateCallback = (state: AECState) => void;

// =============================================================================
// Duplex Audio Pipeline
// =============================================================================

export class DuplexAudioPipeline {
  private audioContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private processedStream: MediaStream | null = null;

  // AEC components
  private aecProcessor: AudioWorkletNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;

  // Playback tracking
  private isPlaybackActive = false;
  private lastPlaybackSample: Float32Array | null = null;
  private playbackEndTime = 0;

  // State
  private isInitialized = false;
  private aecState: AECState | null = null;

  // Callbacks
  private stateChangeCallback: DuplexStateChangeCallback | null = null;
  private aecStateCallback: AECStateCallback | null = null;

  constructor(private config: DuplexAudioConfig = DEFAULT_DUPLEX_CONFIG) {}

  // ===========================================================================
  // Initialization
  // ===========================================================================

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn("[DuplexAudio] Already initialized");
      return;
    }

    try {
      // Create audio context with specified sample rate
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate,
      });

      // Resume if suspended (browsers require user interaction)
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      // Load AEC AudioWorklet
      await this.audioContext.audioWorklet.addModule("/aec-processor.js");

      // Create AEC processor
      this.aecProcessor = new AudioWorkletNode(
        this.audioContext,
        "aec-processor",
        {
          processorOptions: {
            filterLength: Math.floor(
              (this.config.aecTailLengthMs / 1000) * this.config.sampleRate
            ),
            stepSize: 0.5,
            sampleRate: this.config.sampleRate,
          },
        }
      );

      // Listen for AEC state updates
      this.aecProcessor.port.onmessage = (event) => {
        if (event.data.type === "state") {
          this.aecState = event.data.state;
          this.aecStateCallback?.(this.aecState);
        }
      };

      // Create destination for processed audio
      this.destinationNode =
        this.audioContext.createMediaStreamDestination();
      this.aecProcessor.connect(this.destinationNode);

      this.isInitialized = true;
      this.notifyStateChange();

      console.log("[DuplexAudio] Initialized successfully");
    } catch (error) {
      console.error("[DuplexAudio] Initialization failed:", error);
      throw error;
    }
  }

  // ===========================================================================
  // Microphone Control
  // ===========================================================================

  async startMicrophone(): Promise<MediaStream> {
    if (!this.isInitialized || !this.audioContext || !this.aecProcessor) {
      throw new Error("Pipeline not initialized");
    }

    if (this.micStream) {
      console.warn("[DuplexAudio] Microphone already active");
      return this.processedStream!;
    }

    try {
      // Request microphone with audio processing constraints
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: this.config.aecEnabled,
          noiseSuppression: this.config.nsEnabled,
          autoGainControl: this.config.agcEnabled,
          channelCount: 1,
          sampleRate: this.config.sampleRate,
        },
      });

      // Connect mic through AEC processor
      this.micSource = this.audioContext.createMediaStreamSource(
        this.micStream
      );
      this.micSource.connect(this.aecProcessor);

      // Get processed stream from destination
      this.processedStream = this.destinationNode!.stream;

      this.notifyStateChange();
      console.log("[DuplexAudio] Microphone started");

      return this.processedStream;
    } catch (error) {
      console.error("[DuplexAudio] Failed to start microphone:", error);
      throw error;
    }
  }

  stopMicrophone(): void {
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }

    this.processedStream = null;
    this.notifyStateChange();
    console.log("[DuplexAudio] Microphone stopped");
  }

  // ===========================================================================
  // Playback Reference (for AEC)
  // ===========================================================================

  /**
   * Feed playback audio as reference for echo cancellation.
   * Call this whenever AI audio is being played.
   */
  feedPlaybackReference(audioData: Float32Array): void {
    if (!this.aecProcessor) return;

    // Send reference signal to AEC processor
    this.aecProcessor.port.postMessage({
      type: "speaker_audio",
      samples: audioData,
    });

    this.lastPlaybackSample = audioData;
    this.isPlaybackActive = true;
    this.notifyStateChange();
  }

  /**
   * Signal that playback has stopped.
   */
  stopPlaybackReference(): void {
    this.isPlaybackActive = false;
    this.playbackEndTime = Date.now();
    this.notifyStateChange();
  }

  // ===========================================================================
  // VAD Threshold Management
  // ===========================================================================

  /**
   * Get current VAD threshold based on playback state.
   * Returns higher threshold during playback to avoid echo triggering VAD.
   */
  getCurrentVADThreshold(): number {
    return this.isPlaybackActive
      ? this.config.vadThresholdDuringPlayback
      : 0.5;
  }

  /**
   * Get minimum speech duration based on playback state.
   */
  getCurrentMinSpeechDuration(): number {
    return this.isPlaybackActive
      ? this.config.vadMinSpeechDuringPlayback
      : 150;
  }

  /**
   * Check if VAD should be suppressed due to recent playback.
   * Prevents echo from triggering false speech detection immediately after TTS stops.
   */
  shouldSuppressVAD(): boolean {
    if (this.isPlaybackActive) {
      return false; // During playback, VAD should work (with elevated threshold)
    }

    // Suppress for a short window after playback ends
    const timeSincePlayback = Date.now() - this.playbackEndTime;
    return timeSincePlayback < 200; // 200ms echo suppression window
  }

  // ===========================================================================
  // Echo Detection
  // ===========================================================================

  /**
   * Analyze if current mic input is likely echo.
   * Uses correlation between mic and playback signals.
   */
  isLikelyEcho(micData: Float32Array): boolean {
    if (!this.lastPlaybackSample || !this.isPlaybackActive) {
      return false;
    }

    const correlation = this.calculateCorrelation(
      micData,
      this.lastPlaybackSample
    );
    return correlation > 0.7;
  }

  private calculateCorrelation(a: Float32Array, b: Float32Array): number {
    const len = Math.min(a.length, b.length);
    if (len === 0) return 0;

    let sum = 0;
    let sumA = 0;
    let sumB = 0;
    let sumA2 = 0;
    let sumB2 = 0;

    for (let i = 0; i < len; i++) {
      sum += a[i] * b[i];
      sumA += a[i];
      sumB += b[i];
      sumA2 += a[i] * a[i];
      sumB2 += b[i] * b[i];
    }

    const num = len * sum - sumA * sumB;
    const den = Math.sqrt(
      (len * sumA2 - sumA * sumA) * (len * sumB2 - sumB * sumB)
    );

    return den === 0 ? 0 : num / den;
  }

  // ===========================================================================
  // State Management
  // ===========================================================================

  getState(): DuplexPipelineState {
    return {
      isInitialized: this.isInitialized,
      isMicActive: this.micStream !== null,
      isPlaybackActive: this.isPlaybackActive,
      aecState: this.aecState,
      currentVADThreshold: this.getCurrentVADThreshold(),
    };
  }

  onStateChange(callback: DuplexStateChangeCallback): void {
    this.stateChangeCallback = callback;
  }

  onAECStateChange(callback: AECStateCallback): void {
    this.aecStateCallback = callback;
  }

  private notifyStateChange(): void {
    this.stateChangeCallback?.(this.getState());
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  updateConfig(newConfig: Partial<DuplexAudioConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Update AEC processor config
    if (this.aecProcessor) {
      this.aecProcessor.port.postMessage({
        type: "update_config",
        config: {
          enabled: this.config.aecEnabled,
          filterConfig: {
            stepSize: 0.5,
          },
        },
      });
    }
  }

  resetAEC(): void {
    if (this.aecProcessor) {
      this.aecProcessor.port.postMessage({ type: "reset" });
    }
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  destroy(): void {
    this.stopMicrophone();

    if (this.aecProcessor) {
      this.aecProcessor.disconnect();
      this.aecProcessor = null;
    }

    if (this.destinationNode) {
      this.destinationNode.disconnect();
      this.destinationNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.isInitialized = false;
    this.aecState = null;
    console.log("[DuplexAudio] Destroyed");
  }
}

// =============================================================================
// Factory and Singleton
// =============================================================================

let duplexPipelineInstance: DuplexAudioPipeline | null = null;

export function createDuplexAudioPipeline(
  config?: Partial<DuplexAudioConfig>
): DuplexAudioPipeline {
  return new DuplexAudioPipeline({ ...DEFAULT_DUPLEX_CONFIG, ...config });
}

export function getDuplexAudioPipeline(): DuplexAudioPipeline {
  if (!duplexPipelineInstance) {
    duplexPipelineInstance = new DuplexAudioPipeline();
  }
  return duplexPipelineInstance;
}

export function destroyDuplexAudioPipeline(): void {
  if (duplexPipelineInstance) {
    duplexPipelineInstance.destroy();
    duplexPipelineInstance = null;
  }
}
