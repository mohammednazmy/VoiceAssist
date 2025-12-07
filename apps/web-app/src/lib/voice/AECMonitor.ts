/**
 * AEC Monitor
 *
 * Monitors Acoustic Echo Cancellation (AEC) performance and provides
 * feedback to the server for intelligent VAD sensitivity adjustment.
 *
 * Phase: WebSocket Advanced Features
 *
 * The browser's built-in AEC (via getUserMedia constraints) handles the
 * actual echo cancellation. This monitor:
 * - Tracks when TTS audio is playing (output active)
 * - Estimates residual echo levels by comparing input/output energy
 * - Detects AEC convergence state
 * - Reports metrics to server for adaptive barge-in gating
 */

// ============================================================================
// Types
// ============================================================================

/**
 * AEC convergence state
 */
export type AECState = "idle" | "converging" | "converged" | "diverged";

/**
 * AEC metrics for server reporting
 */
export interface AECMetrics {
  /** Whether output (TTS) is currently active */
  outputActive: boolean;
  /** Estimated residual echo level in dB */
  residualEchoDb: number;
  /** Current input energy level in dB */
  inputEnergyDb: number;
  /** Current output energy level in dB */
  outputEnergyDb: number;
  /** AEC convergence state */
  aecState: AECState;
  /** Timestamp of measurement */
  timestamp: number;
}

/**
 * AEC monitor configuration
 */
export interface AECMonitorConfig {
  /** Enable monitoring */
  enabled: boolean;
  /** Reporting interval in ms */
  reportIntervalMs: number;
  /** Echo threshold in dB (below which we consider echo cancelled) */
  echoThresholdDb: number;
  /** Convergence detection window size */
  convergenceWindowSize: number;
  /** Variance threshold for convergence detection */
  convergenceVarianceThreshold: number;
  /** Enable debug logging */
  debug: boolean;
}

/**
 * AEC event types
 */
export type AECEventType =
  | "outputStarted"
  | "outputStopped"
  | "echoDetected"
  | "convergenceChange"
  | "metrics";

/**
 * AEC event
 */
export interface AECEvent {
  type: AECEventType;
  metrics: AECMetrics;
  timestamp: number;
}

/**
 * AEC event handler
 */
export type AECEventHandler = (event: AECEvent) => void;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_AEC_CONFIG: AECMonitorConfig = {
  enabled: true,
  reportIntervalMs: 500,
  echoThresholdDb: -45,
  convergenceWindowSize: 10,
  convergenceVarianceThreshold: 3,
  debug: false,
};

// ============================================================================
// AEC Monitor
// ============================================================================

/**
 * AEC Monitor
 *
 * Monitors echo cancellation performance by tracking input/output
 * audio levels and detecting potential echo breakthrough.
 */
export class AECMonitor {
  private config: AECMonitorConfig;
  private eventHandlers: Map<AECEventType, Set<AECEventHandler>> = new Map();

  // Audio context for analysis
  private audioContext: AudioContext | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;

  // State
  private _outputActive = false;
  private _aecState: AECState = "idle";
  private _residualEchoDb = -100;
  private _inputEnergyDb = -100;
  private _outputEnergyDb = -100;

  // Convergence tracking
  private residualEchoHistory: number[] = [];

  // Reporting
  private reportInterval: ReturnType<typeof setInterval> | null = null;
  private metricsCallback: ((metrics: AECMetrics) => void) | null = null;

  // Analysis buffers
  private inputBuffer: Float32Array | null = null;
  private outputBuffer: Float32Array | null = null;

  constructor(config: Partial<AECMonitorConfig> = {}) {
    this.config = { ...DEFAULT_AEC_CONFIG, ...config };
  }

  // ==========================================================================
  // Properties
  // ==========================================================================

  /** Whether output is currently active */
  get outputActive(): boolean {
    return this._outputActive;
  }

  /** Current AEC state */
  get aecState(): AECState {
    return this._aecState;
  }

  /** Current metrics */
  get currentMetrics(): AECMetrics {
    return {
      outputActive: this._outputActive,
      residualEchoDb: this._residualEchoDb,
      inputEnergyDb: this._inputEnergyDb,
      outputEnergyDb: this._outputEnergyDb,
      aecState: this._aecState,
      timestamp: Date.now(),
    };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Initialize the monitor with audio streams
   *
   * @param inputStream Microphone input stream
   * @param audioContext Audio context to use
   */
  async initialize(
    inputStream: MediaStream,
    audioContext?: AudioContext,
  ): Promise<void> {
    if (!this.config.enabled) return;

    this.audioContext = audioContext || new AudioContext();

    // Create input analyser
    const inputSource = this.audioContext.createMediaStreamSource(inputStream);
    this.inputAnalyser = this.audioContext.createAnalyser();
    this.inputAnalyser.fftSize = 256;
    this.inputAnalyser.smoothingTimeConstant = 0.3;
    inputSource.connect(this.inputAnalyser);

    // Create analysis buffers
    this.inputBuffer = new Float32Array(this.inputAnalyser.fftSize);

    if (this.config.debug) {
      console.log("[AECMonitor] Initialized with input stream");
    }
  }

  /**
   * Connect output audio element for monitoring
   *
   * @param audioElement Audio element playing TTS
   */
  connectOutput(audioElement: HTMLAudioElement): void {
    if (!this.config.enabled || !this.audioContext) return;

    try {
      const outputSource =
        this.audioContext.createMediaElementSource(audioElement);
      this.outputAnalyser = this.audioContext.createAnalyser();
      this.outputAnalyser.fftSize = 256;
      this.outputAnalyser.smoothingTimeConstant = 0.3;

      outputSource.connect(this.outputAnalyser);
      outputSource.connect(this.audioContext.destination);

      this.outputBuffer = new Float32Array(this.outputAnalyser.fftSize);

      if (this.config.debug) {
        console.log("[AECMonitor] Connected output audio element");
      }
    } catch (error) {
      // Audio element may already be connected
      if (this.config.debug) {
        console.warn("[AECMonitor] Could not connect output:", error);
      }
    }
  }

  /**
   * Start monitoring and reporting
   */
  start(metricsCallback?: (metrics: AECMetrics) => void): void {
    if (!this.config.enabled) return;

    this.metricsCallback = metricsCallback || null;

    // Start periodic analysis and reporting
    this.reportInterval = setInterval(() => {
      this.analyze();
      this.reportMetrics();
    }, this.config.reportIntervalMs);

    if (this.config.debug) {
      console.log("[AECMonitor] Started monitoring");
    }
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }

    this._aecState = "idle";
    this._outputActive = false;

    if (this.config.debug) {
      console.log("[AECMonitor] Stopped monitoring");
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();

    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close();
    }

    this.audioContext = null;
    this.inputAnalyser = null;
    this.outputAnalyser = null;
    this.inputBuffer = null;
    this.outputBuffer = null;
  }

  // ==========================================================================
  // Output State Management
  // ==========================================================================

  /**
   * Notify that TTS output has started
   */
  notifyOutputStarted(): void {
    if (this._outputActive) return;

    this._outputActive = true;
    this._aecState = "converging";
    this.residualEchoHistory = [];

    this.emitEvent({
      type: "outputStarted",
      metrics: this.currentMetrics,
      timestamp: Date.now(),
    });

    if (this.config.debug) {
      console.log("[AECMonitor] Output started");
    }
  }

  /**
   * Notify that TTS output has stopped
   */
  notifyOutputStopped(): void {
    if (!this._outputActive) return;

    this._outputActive = false;
    this._aecState = "idle";

    this.emitEvent({
      type: "outputStopped",
      metrics: this.currentMetrics,
      timestamp: Date.now(),
    });

    if (this.config.debug) {
      console.log("[AECMonitor] Output stopped");
    }
  }

  // ==========================================================================
  // Analysis
  // ==========================================================================

  /**
   * Analyze current audio levels
   */
  private analyze(): void {
    // Analyze input
    if (this.inputAnalyser && this.inputBuffer) {
      // TypeScript DOM types have strict Float32Array<ArrayBuffer> requirement
      // but Float32Array from narrowing is Float32Array<ArrayBufferLike>
      this.inputAnalyser.getFloatTimeDomainData(
        this.inputBuffer as unknown as Float32Array<ArrayBuffer>,
      );
      this._inputEnergyDb = this.calculateEnergyDb(this.inputBuffer);
    }

    // Analyze output
    if (this.outputAnalyser && this.outputBuffer) {
      this.outputAnalyser.getFloatTimeDomainData(
        this.outputBuffer as unknown as Float32Array<ArrayBuffer>,
      );
      this._outputEnergyDb = this.calculateEnergyDb(this.outputBuffer);
    }

    // Calculate residual echo (simplified estimation)
    if (this._outputActive) {
      this.estimateResidualEcho();
      this.updateConvergenceState();
    } else {
      this._residualEchoDb = -100;
    }
  }

  /**
   * Calculate energy in dB from audio samples
   */
  private calculateEnergyDb(samples: ArrayLike<number>): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / samples.length);

    // Convert to dB (with floor to avoid -Infinity)
    return Math.max(-100, 20 * Math.log10(Math.max(rms, 1e-10)));
  }

  /**
   * Estimate residual echo level
   *
   * When output is playing, we expect most of it to be cancelled.
   * If input level is significantly higher than expected, there may
   * be echo breakthrough.
   */
  private estimateResidualEcho(): void {
    // If output is playing, compare input to expected cancelled level
    // This is a simplified estimation - true echo measurement would
    // require correlation analysis

    if (this._outputActive && this._outputEnergyDb > -60) {
      // Expected input level after AEC should be much lower than output
      // Residual echo = input - expected_cancellation
      const expectedCancellation = 40; // Typical AEC provides 40dB suppression
      const expectedInputDb = this._outputEnergyDb - expectedCancellation;

      // Residual echo is how much higher input is than expected
      this._residualEchoDb = this._inputEnergyDb - expectedInputDb;

      // Track for convergence detection
      this.residualEchoHistory.push(this._residualEchoDb);
      if (this.residualEchoHistory.length > this.config.convergenceWindowSize) {
        this.residualEchoHistory.shift();
      }

      // Check for echo breakthrough
      if (this._residualEchoDb > this.config.echoThresholdDb) {
        this.emitEvent({
          type: "echoDetected",
          metrics: this.currentMetrics,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Update AEC convergence state
   */
  private updateConvergenceState(): void {
    if (!this._outputActive) {
      return;
    }

    const previousState = this._aecState;

    if (this.residualEchoHistory.length < this.config.convergenceWindowSize) {
      // Not enough data yet
      this._aecState = "converging";
    } else {
      // Calculate variance of recent residual echo measurements
      const variance = this.calculateVariance(this.residualEchoHistory);

      if (variance < this.config.convergenceVarianceThreshold) {
        // Low variance = stable = converged
        if (this._residualEchoDb < this.config.echoThresholdDb) {
          this._aecState = "converged";
        } else {
          // Stable but high echo = diverged (not working well)
          this._aecState = "diverged";
        }
      } else {
        // High variance = still adapting
        this._aecState = "converging";
      }
    }

    // Emit state change
    if (previousState !== this._aecState) {
      this.emitEvent({
        type: "convergenceChange",
        metrics: this.currentMetrics,
        timestamp: Date.now(),
      });

      if (this.config.debug) {
        console.log(
          `[AECMonitor] State changed: ${previousState} -> ${this._aecState}`,
        );
      }
    }
  }

  /**
   * Calculate variance of samples
   */
  private calculateVariance(samples: number[]): number {
    if (samples.length === 0) return 0;

    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const squareDiffs = samples.map((value) => Math.pow(value - mean, 2));
    return squareDiffs.reduce((a, b) => a + b, 0) / samples.length;
  }

  // ==========================================================================
  // Reporting
  // ==========================================================================

  /**
   * Report current metrics
   */
  private reportMetrics(): void {
    const metrics = this.currentMetrics;

    // Call callback if provided
    if (this.metricsCallback) {
      this.metricsCallback(metrics);
    }

    // Emit event
    this.emitEvent({
      type: "metrics",
      metrics,
      timestamp: Date.now(),
    });
  }

  // ==========================================================================
  // Event Handling
  // ==========================================================================

  /**
   * Subscribe to AEC events
   */
  on(type: AECEventType, handler: AECEventHandler): () => void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, new Set());
    }

    this.eventHandlers.get(type)!.add(handler);

    return () => {
      this.eventHandlers.get(type)?.delete(handler);
    };
  }

  /**
   * Subscribe to all events
   */
  onAll(handler: AECEventHandler): () => void {
    const unsubscribes = [
      this.on("outputStarted", handler),
      this.on("outputStopped", handler),
      this.on("echoDetected", handler),
      this.on("convergenceChange", handler),
      this.on("metrics", handler),
    ];

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }

  /**
   * Emit an event
   */
  private emitEvent(event: AECEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error("[AECMonitor] Error in event handler:", error);
        }
      }
    }
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  /**
   * Get recommended barge-in enabled state based on AEC state
   */
  shouldAllowBargeIn(): boolean {
    if (!this._outputActive) {
      // No output playing, always allow
      return true;
    }

    if (this._aecState === "converged") {
      // AEC is working well, allow barge-in
      return true;
    }

    if (this._aecState === "diverged") {
      // AEC is not working well, don't allow barge-in
      // (would likely pick up echo as speech)
      return false;
    }

    // Still converging, be conservative
    return false;
  }

  /**
   * Get recommended VAD sensitivity multiplier based on AEC state
   */
  getVADSensitivityMultiplier(): number {
    if (!this._outputActive) {
      return 1.0; // Normal sensitivity
    }

    switch (this._aecState) {
      case "converged":
        return 0.8; // Slightly reduced sensitivity
      case "converging":
        return 0.5; // More reduced while adapting
      case "diverged":
        return 0.2; // Very reduced to avoid false triggers
      default:
        return 1.0;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an AEC monitor
 */
export function createAECMonitor(
  config?: Partial<AECMonitorConfig>,
): AECMonitor {
  return new AECMonitor(config);
}
