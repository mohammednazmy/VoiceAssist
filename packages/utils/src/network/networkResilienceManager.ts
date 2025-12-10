/**
 * Network Resilience Manager
 *
 * Handles network instability, latency spikes, and connection recovery
 * for voice communication. Provides graceful degradation strategies.
 *
 * Phase 6: Edge Case Hardening
 * Reference: docs/planning/VOICE_MODE_BARGE_IN_IMPROVEMENT_PLAN_V3.md
 */

// =============================================================================
// Types
// =============================================================================

export type NetworkQuality = "excellent" | "good" | "fair" | "poor" | "disconnected";

export interface NetworkMetrics {
  /** Round-trip latency in ms */
  latencyMs: number;
  /** Latency jitter (variance) in ms */
  jitterMs: number;
  /** Packet loss percentage (0-100) */
  packetLossPercent: number;
  /** Estimated bandwidth in kbps */
  bandwidthKbps: number;
  /** Connection type (wifi, cellular, etc.) */
  connectionType: string;
  /** Overall network quality assessment */
  quality: NetworkQuality;
  /** Whether connection is metered */
  isMetered: boolean;
}

export interface NetworkResilienceConfig {
  /** Threshold for "good" latency (ms) */
  goodLatencyThreshold: number;
  /** Threshold for "fair" latency (ms) */
  fairLatencyThreshold: number;
  /** Threshold for "poor" latency (ms) */
  poorLatencyThreshold: number;
  /** Maximum acceptable packet loss (%) */
  maxAcceptablePacketLoss: number;
  /** Ping interval for monitoring (ms) */
  pingIntervalMs: number;
  /** Number of samples to keep for averaging */
  sampleSize: number;
  /** Reconnection attempts before giving up */
  maxReconnectAttempts: number;
  /** Base delay for exponential backoff (ms) */
  baseReconnectDelayMs: number;
}

export const DEFAULT_NETWORK_CONFIG: NetworkResilienceConfig = {
  goodLatencyThreshold: 100,
  fairLatencyThreshold: 300,
  poorLatencyThreshold: 500,
  maxAcceptablePacketLoss: 5,
  pingIntervalMs: 5000,
  sampleSize: 10,
  maxReconnectAttempts: 5,
  baseReconnectDelayMs: 1000,
};

export interface DegradationStrategy {
  /** Action to take */
  action: "none" | "reduce_quality" | "buffer_more" | "reconnect" | "fallback_text";
  /** Human-readable recommendation */
  recommendation: string;
  /** Priority level (1=highest) */
  priority: number;
  /** Whether audio should be paused */
  pauseAudio: boolean;
  /** Suggested buffer size increase (ms) */
  bufferIncrease: number;
}

export type NetworkEventType =
  | "quality_changed"
  | "latency_spike"
  | "packet_loss"
  | "disconnected"
  | "reconnected"
  | "degradation_applied";

export interface NetworkEvent {
  type: NetworkEventType;
  timestamp: number;
  metrics: NetworkMetrics;
  previousQuality?: NetworkQuality;
  strategy?: DegradationStrategy;
}

export type NetworkEventCallback = (event: NetworkEvent) => void;

// =============================================================================
// Network Resilience Manager
// =============================================================================

export class NetworkResilienceManager {
  private config: NetworkResilienceConfig;
  private latencySamples: number[] = [];
  private packetLossSamples: number[] = [];
  private lastQuality: NetworkQuality = "excellent";
  private reconnectAttempts = 0;
  private isConnected = true;
  private eventCallback: NetworkEventCallback | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<NetworkResilienceConfig> = {}) {
    this.config = { ...DEFAULT_NETWORK_CONFIG, ...config };
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  onNetworkEvent(callback: NetworkEventCallback): void {
    this.eventCallback = callback;
  }

  private emitEvent(event: NetworkEvent): void {
    this.eventCallback?.(event);
  }

  // ===========================================================================
  // Metrics Recording
  // ===========================================================================

  /**
   * Record a latency measurement.
   */
  recordLatency(latencyMs: number): void {
    this.latencySamples.push(latencyMs);
    if (this.latencySamples.length > this.config.sampleSize) {
      this.latencySamples.shift();
    }

    // Check for latency spike
    const avgLatency = this.getAverageLatency();
    if (latencyMs > avgLatency * 3 && latencyMs > this.config.fairLatencyThreshold) {
      this.emitEvent({
        type: "latency_spike",
        timestamp: Date.now(),
        metrics: this.getMetrics(),
      });
    }

    this.checkQualityChange();
  }

  /**
   * Record packet loss.
   */
  recordPacketLoss(lostPackets: number, totalPackets: number): void {
    const lossPercent = totalPackets > 0 ? (lostPackets / totalPackets) * 100 : 0;
    this.packetLossSamples.push(lossPercent);
    if (this.packetLossSamples.length > this.config.sampleSize) {
      this.packetLossSamples.shift();
    }

    if (lossPercent > this.config.maxAcceptablePacketLoss) {
      this.emitEvent({
        type: "packet_loss",
        timestamp: Date.now(),
        metrics: this.getMetrics(),
      });
    }

    this.checkQualityChange();
  }

  /**
   * Record connection state change.
   */
  recordConnectionState(connected: boolean): void {
    const wasConnected = this.isConnected;
    this.isConnected = connected;

    if (!connected && wasConnected) {
      this.emitEvent({
        type: "disconnected",
        timestamp: Date.now(),
        metrics: this.getMetrics(),
      });
    } else if (connected && !wasConnected) {
      this.reconnectAttempts = 0;
      this.emitEvent({
        type: "reconnected",
        timestamp: Date.now(),
        metrics: this.getMetrics(),
      });
    }
  }

  // ===========================================================================
  // Metrics Access
  // ===========================================================================

  /**
   * Get current network metrics.
   */
  getMetrics(): NetworkMetrics {
    const latencyMs = this.getAverageLatency();
    const jitterMs = this.getJitter();
    const packetLossPercent = this.getAveragePacketLoss();
    const quality = this.assessQuality(latencyMs, packetLossPercent);

    // Try to get connection info from navigator (browser environment only)
    let connectionType = "unknown";
    let isMetered = false;
    let bandwidthKbps = 10000; // Default assumption

    // Check for browser environment and Network Information API
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = (globalThis as any).navigator;
      if (nav && typeof nav === "object" && "connection" in nav) {
        const conn = nav.connection;
        if (conn && typeof conn === "object") {
          connectionType = conn.effectiveType || conn.type || "unknown";
          isMetered = conn.saveData || false;
          bandwidthKbps = (conn.downlink || 10) * 1000;
        }
      }
    } catch {
      // Not in browser environment or API not available
    }

    return {
      latencyMs,
      jitterMs,
      packetLossPercent,
      bandwidthKbps,
      connectionType,
      quality,
      isMetered,
    };
  }

  /**
   * Get average latency from recent samples.
   */
  getAverageLatency(): number {
    if (this.latencySamples.length === 0) return 0;
    return (
      this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length
    );
  }

  /**
   * Get latency jitter (standard deviation).
   */
  getJitter(): number {
    if (this.latencySamples.length < 2) return 0;
    const avg = this.getAverageLatency();
    const squaredDiffs = this.latencySamples.map((x) => (x - avg) ** 2);
    return Math.sqrt(
      squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length
    );
  }

  /**
   * Get average packet loss percentage.
   */
  getAveragePacketLoss(): number {
    if (this.packetLossSamples.length === 0) return 0;
    return (
      this.packetLossSamples.reduce((a, b) => a + b, 0) /
      this.packetLossSamples.length
    );
  }

  // ===========================================================================
  // Quality Assessment
  // ===========================================================================

  /**
   * Assess network quality based on metrics.
   */
  assessQuality(latencyMs: number, packetLossPercent: number): NetworkQuality {
    if (!this.isConnected) {
      return "disconnected";
    }

    if (
      latencyMs <= this.config.goodLatencyThreshold &&
      packetLossPercent <= 1
    ) {
      return "excellent";
    }

    if (
      latencyMs <= this.config.fairLatencyThreshold &&
      packetLossPercent <= 3
    ) {
      return "good";
    }

    if (
      latencyMs <= this.config.poorLatencyThreshold &&
      packetLossPercent <= this.config.maxAcceptablePacketLoss
    ) {
      return "fair";
    }

    return "poor";
  }

  /**
   * Check if quality has changed and emit event if so.
   */
  private checkQualityChange(): void {
    const metrics = this.getMetrics();
    if (metrics.quality !== this.lastQuality) {
      this.emitEvent({
        type: "quality_changed",
        timestamp: Date.now(),
        metrics,
        previousQuality: this.lastQuality,
      });
      this.lastQuality = metrics.quality;
    }
  }

  // ===========================================================================
  // Degradation Strategies
  // ===========================================================================

  /**
   * Get recommended degradation strategy based on current network conditions.
   */
  getDegradationStrategy(): DegradationStrategy {
    const metrics = this.getMetrics();

    if (!this.isConnected) {
      return {
        action: "reconnect",
        recommendation: "Connection lost. Attempting to reconnect...",
        priority: 1,
        pauseAudio: true,
        bufferIncrease: 0,
      };
    }

    if (metrics.quality === "poor") {
      return {
        action: "fallback_text",
        recommendation:
          "Network quality is very poor. Consider using text input instead.",
        priority: 2,
        pauseAudio: false,
        bufferIncrease: 500,
      };
    }

    if (metrics.quality === "fair") {
      return {
        action: "buffer_more",
        recommendation: "Network quality is fair. Increasing buffer size.",
        priority: 3,
        pauseAudio: false,
        bufferIncrease: 200,
      };
    }

    if (metrics.latencyMs > this.config.goodLatencyThreshold) {
      return {
        action: "reduce_quality",
        recommendation: "High latency detected. Reducing audio quality.",
        priority: 4,
        pauseAudio: false,
        bufferIncrease: 100,
      };
    }

    return {
      action: "none",
      recommendation: "Network conditions are good.",
      priority: 5,
      pauseAudio: false,
      bufferIncrease: 0,
    };
  }

  /**
   * Apply degradation strategy and emit event.
   */
  applyDegradation(): DegradationStrategy {
    const strategy = this.getDegradationStrategy();

    if (strategy.action !== "none") {
      this.emitEvent({
        type: "degradation_applied",
        timestamp: Date.now(),
        metrics: this.getMetrics(),
        strategy,
      });
    }

    return strategy;
  }

  // ===========================================================================
  // Reconnection
  // ===========================================================================

  /**
   * Get reconnection delay with exponential backoff.
   */
  getReconnectDelay(): number {
    const delay =
      this.config.baseReconnectDelayMs * Math.pow(2, this.reconnectAttempts);
    return Math.min(delay, 30000); // Cap at 30 seconds
  }

  /**
   * Attempt reconnection.
   */
  async attemptReconnect(
    connectFn: () => Promise<boolean>
  ): Promise<boolean> {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      return false;
    }

    this.reconnectAttempts++;
    const delay = this.getReconnectDelay();

    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      const success = await connectFn();
      if (success) {
        this.recordConnectionState(true);
        return true;
      }
    } catch (error) {
      // Connection failed
    }

    return this.attemptReconnect(connectFn);
  }

  /**
   * Check if we should attempt reconnection.
   */
  shouldReconnect(): boolean {
    return (
      !this.isConnected &&
      this.reconnectAttempts < this.config.maxReconnectAttempts
    );
  }

  // ===========================================================================
  // Voice-Specific Recommendations
  // ===========================================================================

  /**
   * Get voice-specific adjustments based on network conditions.
   */
  getVoiceAdjustments(): {
    vadSensitivity: number;
    audioBufferMs: number;
    enableCompression: boolean;
    sampleRate: number;
  } {
    const metrics = this.getMetrics();

    // Default optimal settings
    let vadSensitivity = 0.5;
    let audioBufferMs = 100;
    let enableCompression = false;
    let sampleRate = 16000;

    switch (metrics.quality) {
      case "poor":
        vadSensitivity = 0.7; // More sensitive to avoid cutting off
        audioBufferMs = 500;
        enableCompression = true;
        sampleRate = 8000; // Lower quality for bandwidth
        break;

      case "fair":
        vadSensitivity = 0.6;
        audioBufferMs = 300;
        enableCompression = true;
        sampleRate = 16000;
        break;

      case "good":
        vadSensitivity = 0.5;
        audioBufferMs = 150;
        enableCompression = false;
        sampleRate = 16000;
        break;

      case "excellent":
        vadSensitivity = 0.5;
        audioBufferMs = 100;
        enableCompression = false;
        sampleRate = 16000;
        break;

      case "disconnected":
        // These won't be used but provide defaults
        vadSensitivity = 0.5;
        audioBufferMs = 500;
        enableCompression = true;
        sampleRate = 8000;
        break;
    }

    return {
      vadSensitivity,
      audioBufferMs,
      enableCompression,
      sampleRate,
    };
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Reset manager state.
   */
  reset(): void {
    this.latencySamples = [];
    this.packetLossSamples = [];
    this.reconnectAttempts = 0;
    this.lastQuality = "excellent";
    this.isConnected = true;
    this.stopMonitoring();
  }

  /**
   * Start periodic monitoring.
   */
  startMonitoring(pingFn: () => Promise<number>): void {
    this.stopMonitoring();

    this.pingInterval = setInterval(async () => {
      try {
        const latency = await pingFn();
        this.recordLatency(latency);
      } catch {
        this.recordConnectionState(false);
      }
    }, this.config.pingIntervalMs);
  }

  /**
   * Stop monitoring.
   */
  stopMonitoring(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createNetworkResilienceManager(
  config?: Partial<NetworkResilienceConfig>
): NetworkResilienceManager {
  return new NetworkResilienceManager(config);
}
