/**
 * Voice Telemetry Service - Phase 3 Observability
 *
 * Provides batched telemetry reporting for voice sessions with:
 * - Batched reporting (10s intervals)
 * - Beacon API for page unload
 * - Network quality assessment
 * - Browser performance metrics
 */

import { createLogger } from "./logger";

const telemetryLog = createLogger("VoiceTelemetry");

// ============================================================================
// Types
// ============================================================================

export interface NetworkQualityMetrics {
  effectiveType: "slow-2g" | "2g" | "3g" | "4g" | "unknown";
  rtt: number | null; // Round-trip time in ms
  downlink: number | null; // Downlink speed in Mbps
  saveData: boolean;
  quality: "excellent" | "good" | "fair" | "poor" | "unknown";
}

export interface BrowserPerformanceMetrics {
  memoryUsedMB: number | null;
  memoryLimitMB: number | null;
  memoryUsagePercent: number | null;
  jsHeapSizeLimitMB: number | null;
}

export interface AudioContextMetrics {
  state: AudioContextState | null;
  sampleRate: number | null;
  baseLatency: number | null;
  outputLatency: number | null;
}

export interface VoiceTelemetryEvent {
  type:
    | "session_start"
    | "session_end"
    | "error"
    | "latency"
    | "quality"
    | "heartbeat";
  sessionId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface VoiceTelemetryBatch {
  batchId: string;
  sessionId: string;
  startTime: number;
  endTime: number;
  events: VoiceTelemetryEvent[];
  network: NetworkQualityMetrics;
  browser: BrowserPerformanceMetrics;
  audio: AudioContextMetrics;
}

// ============================================================================
// Network Quality Assessment
// ============================================================================

export function getNetworkQuality(): NetworkQualityMetrics {
  // Use Network Information API if available
  const nav = navigator as Navigator & {
    connection?: {
      effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
      rtt?: number;
      downlink?: number;
      saveData?: boolean;
    };
  };

  const connection = nav.connection;

  const effectiveType = connection?.effectiveType || "unknown";
  const rtt = connection?.rtt ?? null;
  const downlink = connection?.downlink ?? null;
  const saveData = connection?.saveData ?? false;

  // Calculate quality score
  let quality: NetworkQualityMetrics["quality"] = "unknown";
  if (effectiveType !== "unknown") {
    if (effectiveType === "4g" && (rtt === null || rtt < 100)) {
      quality = "excellent";
    } else if (
      effectiveType === "4g" ||
      (effectiveType === "3g" && rtt !== null && rtt < 200)
    ) {
      quality = "good";
    } else if (effectiveType === "3g") {
      quality = "fair";
    } else {
      quality = "poor";
    }
  }

  return {
    effectiveType,
    rtt,
    downlink,
    saveData,
    quality,
  };
}

// ============================================================================
// Browser Performance Metrics
// ============================================================================

export function getBrowserPerformance(): BrowserPerformanceMetrics {
  // Use Performance.memory API if available (Chrome only)
  const perf = performance as Performance & {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  };

  const memory = perf.memory;

  if (!memory) {
    return {
      memoryUsedMB: null,
      memoryLimitMB: null,
      memoryUsagePercent: null,
      jsHeapSizeLimitMB: null,
    };
  }

  const usedMB = memory.usedJSHeapSize / (1024 * 1024);
  const limitMB = memory.jsHeapSizeLimit / (1024 * 1024);
  const percent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;

  return {
    memoryUsedMB: Math.round(usedMB * 100) / 100,
    memoryLimitMB: Math.round(limitMB * 100) / 100,
    memoryUsagePercent: Math.round(percent * 100) / 100,
    jsHeapSizeLimitMB: Math.round(limitMB * 100) / 100,
  };
}

// ============================================================================
// Audio Context Metrics
// ============================================================================

export function getAudioContextMetrics(
  audioContext: AudioContext | null,
): AudioContextMetrics {
  if (!audioContext) {
    return {
      state: null,
      sampleRate: null,
      baseLatency: null,
      outputLatency: null,
    };
  }

  return {
    state: audioContext.state,
    sampleRate: audioContext.sampleRate,
    baseLatency: audioContext.baseLatency ?? null,
    outputLatency:
      (audioContext as AudioContext & { outputLatency?: number })
        .outputLatency ?? null,
  };
}

// ============================================================================
// Packet Loss / Jitter Estimation
// ============================================================================

export interface NetworkJitterMetrics {
  estimatedPacketLoss: number; // Percentage
  jitterMs: number; // Estimated jitter in ms
  consecutiveDrops: number;
}

export class JitterEstimator {
  private expectedSequence = 0;
  private receivedCount = 0;
  private droppedCount = 0;
  private consecutiveDrops = 0;
  private arrivalTimes: number[] = [];
  private readonly maxSamples = 50;

  recordPacket(sequenceNumber: number): void {
    const now = performance.now();
    this.arrivalTimes.push(now);
    if (this.arrivalTimes.length > this.maxSamples) {
      this.arrivalTimes.shift();
    }

    if (sequenceNumber > this.expectedSequence) {
      // Packets were dropped
      const dropped = sequenceNumber - this.expectedSequence;
      this.droppedCount += dropped;
      this.consecutiveDrops += dropped;
    } else {
      this.consecutiveDrops = 0;
    }

    this.receivedCount++;
    this.expectedSequence = sequenceNumber + 1;
  }

  getMetrics(): NetworkJitterMetrics {
    const totalPackets = this.receivedCount + this.droppedCount;
    const packetLoss =
      totalPackets > 0 ? (this.droppedCount / totalPackets) * 100 : 0;

    // Calculate jitter from arrival time variations
    let jitter = 0;
    if (this.arrivalTimes.length >= 2) {
      const deltas: number[] = [];
      for (let i = 1; i < this.arrivalTimes.length; i++) {
        deltas.push(this.arrivalTimes[i] - this.arrivalTimes[i - 1]);
      }

      if (deltas.length >= 2) {
        const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        const variance =
          deltas.reduce((sum, d) => sum + Math.pow(d - avgDelta, 2), 0) /
          deltas.length;
        jitter = Math.sqrt(variance);
      }
    }

    return {
      estimatedPacketLoss: Math.round(packetLoss * 100) / 100,
      jitterMs: Math.round(jitter * 100) / 100,
      consecutiveDrops: this.consecutiveDrops,
    };
  }

  reset(): void {
    this.expectedSequence = 0;
    this.receivedCount = 0;
    this.droppedCount = 0;
    this.consecutiveDrops = 0;
    this.arrivalTimes = [];
  }
}

// ============================================================================
// Voice Telemetry Service
// ============================================================================

export interface VoiceTelemetryConfig {
  endpoint: string;
  batchIntervalMs: number;
  maxEventsPerBatch: number;
  enableBeacon: boolean;
  debug: boolean;
}

const DEFAULT_CONFIG: VoiceTelemetryConfig = {
  endpoint: "/api/voice/telemetry",
  batchIntervalMs: 10000, // 10 seconds
  maxEventsPerBatch: 100,
  enableBeacon: true,
  debug: false,
};

export class VoiceTelemetryService {
  private config: VoiceTelemetryConfig;
  private events: VoiceTelemetryEvent[] = [];
  private sessionId: string | null = null;
  private batchStartTime: number = Date.now();
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private audioContext: AudioContext | null = null;
  private jitterEstimator = new JitterEstimator();

  constructor(config: Partial<VoiceTelemetryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Set up unload handler for beacon
    if (this.config.enableBeacon && typeof window !== "undefined") {
      window.addEventListener("beforeunload", this.handleUnload);
      window.addEventListener("pagehide", this.handleUnload);
    }
  }

  // Start a session
  startSession(sessionId: string): void {
    this.sessionId = sessionId;
    this.batchStartTime = Date.now();
    this.jitterEstimator.reset();

    this.addEvent({
      type: "session_start",
      sessionId,
      timestamp: Date.now(),
      data: {
        userAgent: navigator.userAgent,
        screen: {
          width: window.screen.width,
          height: window.screen.height,
        },
        network: getNetworkQuality(),
        browser: getBrowserPerformance(),
      },
    });

    // Start batch timer
    if (this.batchTimer === null) {
      this.batchTimer = setInterval(
        () => this.flushBatch(),
        this.config.batchIntervalMs,
      );
    }
  }

  // End a session
  endSession(): void {
    if (!this.sessionId) return;

    this.addEvent({
      type: "session_end",
      sessionId: this.sessionId,
      timestamp: Date.now(),
      data: {
        jitter: this.jitterEstimator.getMetrics(),
        network: getNetworkQuality(),
        browser: getBrowserPerformance(),
        audio: getAudioContextMetrics(this.audioContext),
      },
    });

    this.flushBatch();
    this.stopBatchTimer();
    this.sessionId = null;
  }

  // Set audio context for metrics
  setAudioContext(ctx: AudioContext): void {
    this.audioContext = ctx;
  }

  // Add an event to the batch
  addEvent(event: VoiceTelemetryEvent): void {
    this.events.push(event);

    if (this.config.debug) {
      telemetryLog.debug("Event:", event);
    }

    // Flush if batch is full
    if (this.events.length >= this.config.maxEventsPerBatch) {
      this.flushBatch();
    }
  }

  // Record latency measurement
  recordLatency(
    type: "stt" | "tts" | "ttfa" | "connection",
    durationMs: number,
  ): void {
    if (!this.sessionId) return;

    this.addEvent({
      type: "latency",
      sessionId: this.sessionId,
      timestamp: Date.now(),
      data: {
        latencyType: type,
        durationMs,
      },
    });
  }

  // Record error
  recordError(
    code: string,
    category: string,
    message: string,
    recoverable: boolean,
  ): void {
    if (!this.sessionId) return;

    this.addEvent({
      type: "error",
      sessionId: this.sessionId,
      timestamp: Date.now(),
      data: {
        code,
        category,
        message,
        recoverable,
        network: getNetworkQuality(),
      },
    });
  }

  // Record audio quality
  recordAudioQuality(
    sampleRate: number,
    clipping: boolean,
    noiseLevel?: number,
  ): void {
    if (!this.sessionId) return;

    this.addEvent({
      type: "quality",
      sessionId: this.sessionId,
      timestamp: Date.now(),
      data: {
        sampleRate,
        clipping,
        noiseLevel,
        audio: getAudioContextMetrics(this.audioContext),
      },
    });
  }

  // Record packet arrival (for jitter estimation)
  recordPacketArrival(sequenceNumber: number): void {
    this.jitterEstimator.recordPacket(sequenceNumber);
  }

  // Flush current batch
  async flushBatch(): Promise<void> {
    if (this.events.length === 0 || !this.sessionId) return;

    const batch: VoiceTelemetryBatch = {
      batchId: `${this.sessionId}-${Date.now()}`,
      sessionId: this.sessionId,
      startTime: this.batchStartTime,
      endTime: Date.now(),
      events: [...this.events],
      network: getNetworkQuality(),
      browser: getBrowserPerformance(),
      audio: getAudioContextMetrics(this.audioContext),
    };

    // Clear events
    this.events = [];
    this.batchStartTime = Date.now();

    if (this.config.debug) {
      telemetryLog.debug("Flushing batch:", batch);
    }

    // Send batch
    try {
      await this.sendBatch(batch);
    } catch (error) {
      if (this.config.debug) {
        telemetryLog.error("Failed to send batch:", error);
      }
    }
  }

  // Send batch to server
  private async sendBatch(batch: VoiceTelemetryBatch): Promise<void> {
    const response = await fetch(this.config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(batch),
      keepalive: true, // Important for reliability
    });

    if (!response.ok) {
      throw new Error(`Telemetry send failed: ${response.status}`);
    }
  }

  // Handle page unload with beacon
  private handleUnload = (): void => {
    if (this.events.length === 0 || !this.sessionId) return;

    const batch: VoiceTelemetryBatch = {
      batchId: `${this.sessionId}-${Date.now()}-unload`,
      sessionId: this.sessionId,
      startTime: this.batchStartTime,
      endTime: Date.now(),
      events: [...this.events],
      network: getNetworkQuality(),
      browser: getBrowserPerformance(),
      audio: getAudioContextMetrics(this.audioContext),
    };

    // Use Beacon API for reliable delivery
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(batch)], {
        type: "application/json",
      });
      navigator.sendBeacon(this.config.endpoint, blob);
    }
  };

  // Stop batch timer
  private stopBatchTimer(): void {
    if (this.batchTimer !== null) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  // Cleanup
  destroy(): void {
    this.flushBatch();
    this.stopBatchTimer();

    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", this.handleUnload);
      window.removeEventListener("pagehide", this.handleUnload);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let telemetryInstance: VoiceTelemetryService | null = null;

export function getVoiceTelemetry(
  config?: Partial<VoiceTelemetryConfig>,
): VoiceTelemetryService {
  if (!telemetryInstance) {
    telemetryInstance = new VoiceTelemetryService(config);
  }
  return telemetryInstance;
}

export function resetVoiceTelemetry(): void {
  if (telemetryInstance) {
    telemetryInstance.destroy();
    telemetryInstance = null;
  }
}
