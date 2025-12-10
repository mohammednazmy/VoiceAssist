/**
 * Offline Fallback Orchestrator
 *
 * Manages automatic switching between online and offline modes
 * based on network status and latency.
 *
 * Phase 9: Offline & Low-Latency Fallback
 */

import type {
  FallbackConfig,
  FallbackState,
  FallbackEvent,
  FallbackEventCallback,
  NetworkStatus,
  FallbackMode,
} from "./types";
import { DEFAULT_FALLBACK_CONFIG } from "./types";
import { TTSCacheManager } from "./ttsCacheManager";
import { WebRTCVADProcessor, VADAudioManager } from "./webrtcVAD";

// ============================================================================
// Offline Fallback Manager
// ============================================================================

/**
 * Manages fallback between online and offline modes
 */
export class OfflineFallbackManager {
  private config: FallbackConfig;

  /** Current state */
  private state: FallbackState;

  /** Network check interval */
  private networkCheckTimer: number | null = null;

  /** Event callbacks */
  private eventCallbacks: Set<FallbackEventCallback> = new Set();

  /** TTS cache manager */
  private ttsCache: TTSCacheManager | null = null;

  /** Offline VAD components */
  private vadProcessor: WebRTCVADProcessor | null = null;
  private vadManager: VADAudioManager | null = null;

  /** Network check in progress */
  private isCheckingNetwork = false;

  constructor(config: Partial<FallbackConfig> = {}) {
    this.config = { ...DEFAULT_FALLBACK_CONFIG, ...config };

    // Initialize state
    this.state = {
      networkStatus: "unknown",
      mode: "normal",
      usingCachedTTS: false,
      usingOfflineVAD: false,
      lastSuccessfulRequest: null,
      currentLatency: null,
      consecutiveFailures: 0,
    };
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the fallback system
   */
  async initialize(): Promise<void> {
    // Initialize TTS cache if enabled
    if (this.config.enableTTSCache) {
      this.ttsCache = new TTSCacheManager();
      await this.ttsCache.initialize();
    }

    // Initialize offline VAD if enabled
    if (this.config.enableOfflineVAD) {
      this.vadProcessor = new WebRTCVADProcessor();
      this.vadManager = new VADAudioManager(this.vadProcessor);
    }

    // Check initial network status
    await this.checkNetworkStatus();

    // Start periodic network checks if auto-fallback enabled
    if (this.config.autoFallback) {
      this.startNetworkMonitoring();
    }

    // Listen for browser online/offline events
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
    }
  }

  // ==========================================================================
  // Network Monitoring
  // ==========================================================================

  /**
   * Start periodic network status checks
   */
  private startNetworkMonitoring(): void {
    if (this.networkCheckTimer) return;

    this.networkCheckTimer = window.setInterval(() => {
      this.checkNetworkStatus();
    }, this.config.networkCheckInterval);
  }

  /**
   * Stop network monitoring
   */
  private stopNetworkMonitoring(): void {
    if (this.networkCheckTimer) {
      window.clearInterval(this.networkCheckTimer);
      this.networkCheckTimer = null;
    }
  }

  /**
   * Check current network status
   */
  async checkNetworkStatus(): Promise<NetworkStatus> {
    if (this.isCheckingNetwork) {
      return this.state.networkStatus;
    }

    this.isCheckingNetwork = true;

    try {
      // Quick navigator.onLine check
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return this.updateNetworkStatus("offline");
      }

      // If we have a health check endpoint, measure latency
      if (this.config.healthCheckEndpoint) {
        const latency = await this.measureLatency(
          this.config.healthCheckEndpoint,
        );

        if (latency === null) {
          return this.updateNetworkStatus("offline");
        }

        this.state.currentLatency = latency;

        if (latency > this.config.slowNetworkThreshold) {
          return this.updateNetworkStatus("slow");
        }

        return this.updateNetworkStatus("online");
      }

      // Fallback: try to fetch a known resource
      const status = await this.pingNetwork();
      return this.updateNetworkStatus(status);
    } finally {
      this.isCheckingNetwork = false;
    }
  }

  /**
   * Measure latency to an endpoint
   */
  private async measureLatency(url: string): Promise<number | null> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.networkCheckTimeout,
    );

    try {
      const start = performance.now();
      const response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
        cache: "no-store",
      });
      const end = performance.now();

      clearTimeout(timeout);

      if (response.ok) {
        this.state.consecutiveFailures = 0;
        this.state.lastSuccessfulRequest = Date.now();
        return end - start;
      }

      return null;
    } catch {
      clearTimeout(timeout);
      this.state.consecutiveFailures++;
      return null;
    }
  }

  /**
   * Basic network ping test
   */
  private async pingNetwork(): Promise<NetworkStatus> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.networkCheckTimeout,
      );

      const start = performance.now();
      await fetch("/favicon.ico", {
        method: "HEAD",
        signal: controller.signal,
        cache: "no-store",
      });
      const latency = performance.now() - start;

      clearTimeout(timeout);

      this.state.currentLatency = latency;
      this.state.consecutiveFailures = 0;
      this.state.lastSuccessfulRequest = Date.now();

      if (latency > this.config.slowNetworkThreshold) {
        return "slow";
      }

      return "online";
    } catch {
      this.state.consecutiveFailures++;
      return "offline";
    }
  }

  /**
   * Update network status and trigger mode change if needed
   */
  private updateNetworkStatus(status: NetworkStatus): NetworkStatus {
    const previousStatus = this.state.networkStatus;
    this.state.networkStatus = status;

    if (status !== previousStatus) {
      this.emitEvent({
        type: "network_change",
        timestamp: Date.now(),
        data: { previousStatus, newStatus: status },
      });

      // Update mode based on network status
      this.updateMode();
    }

    return status;
  }

  /**
   * Handle browser online event
   */
  private handleOnline = (): void => {
    this.checkNetworkStatus();
  };

  /**
   * Handle browser offline event
   */
  private handleOffline = (): void => {
    this.updateNetworkStatus("offline");
  };

  // ==========================================================================
  // Mode Management
  // ==========================================================================

  /**
   * Update fallback mode based on network status
   */
  private updateMode(): void {
    const previousMode = this.state.mode;
    let newMode: FallbackMode = "normal";

    switch (this.state.networkStatus) {
      case "offline":
        newMode = "offline";
        break;
      case "slow":
        newMode = "low-latency";
        break;
      case "online":
        newMode = "normal";
        break;
    }

    if (newMode !== previousMode) {
      this.state.mode = newMode;

      // Update component states
      this.state.usingOfflineVAD = newMode !== "normal";
      this.state.usingCachedTTS = newMode !== "normal";

      this.emitEvent({
        type: "mode_change",
        timestamp: Date.now(),
        data: { previousMode, newMode },
      });
    }
  }

  /**
   * Force a specific mode
   */
  setMode(mode: FallbackMode): void {
    if (mode !== this.state.mode) {
      const previousMode = this.state.mode;
      this.state.mode = mode;

      this.state.usingOfflineVAD = mode !== "normal";
      this.state.usingCachedTTS = mode !== "normal";

      this.emitEvent({
        type: "mode_change",
        timestamp: Date.now(),
        data: { previousMode, newMode: mode, forced: true },
      });
    }
  }

  // ==========================================================================
  // TTS Caching
  // ==========================================================================

  /**
   * Get cached TTS audio or return null
   */
  async getCachedTTS(text: string, voice: string): Promise<ArrayBuffer | null> {
    if (!this.ttsCache) return null;

    const cached = await this.ttsCache.get(text, voice);

    if (cached) {
      this.emitEvent({
        type: "cache_hit",
        timestamp: Date.now(),
        data: { text, voice },
      });
    } else {
      this.emitEvent({
        type: "cache_miss",
        timestamp: Date.now(),
        data: { text, voice },
      });
    }

    return cached;
  }

  /**
   * Cache TTS audio
   */
  async cacheTTS(
    text: string,
    voice: string,
    audioBuffer: ArrayBuffer,
  ): Promise<void> {
    if (!this.ttsCache) return;
    await this.ttsCache.set(text, voice, audioBuffer);
  }

  /**
   * Check if TTS is cached
   */
  hasCachedTTS(text: string, voice: string): boolean {
    return this.ttsCache?.has(text, voice) ?? false;
  }

  /**
   * Preload common TTS phrases
   */
  async preloadTTS(
    voice: string,
    ttsFunction: (text: string) => Promise<ArrayBuffer>,
    options?: { onProgress?: (done: number, total: number) => void },
  ): Promise<void> {
    if (!this.ttsCache) return;
    await this.ttsCache.preloadCommonPhrases(voice, ttsFunction, options);
  }

  /**
   * Get TTS cache statistics
   */
  getTTSCacheStats() {
    return this.ttsCache?.getStats() ?? null;
  }

  // ==========================================================================
  // Offline VAD
  // ==========================================================================

  /**
   * Start offline VAD
   */
  async startOfflineVAD(
    stream: MediaStream,
    callbacks?: {
      onSpeechStart?: () => void;
      onSpeechEnd?: (duration: number) => void;
    },
  ): Promise<void> {
    if (!this.vadProcessor || !this.vadManager) return;

    if (callbacks) {
      this.vadProcessor.setCallbacks({
        onSpeechStart: callbacks.onSpeechStart,
        onSpeechEnd: callbacks.onSpeechEnd
          ? (segment) => callbacks.onSpeechEnd!(segment.duration)
          : undefined,
      });
    }

    await this.vadManager.start(stream);

    this.emitEvent({
      type: "vad_switch",
      timestamp: Date.now(),
      data: { mode: "offline", active: true },
    });
  }

  /**
   * Stop offline VAD
   */
  stopOfflineVAD(): void {
    if (!this.vadManager) return;

    this.vadManager.stop();

    this.emitEvent({
      type: "vad_switch",
      timestamp: Date.now(),
      data: { mode: "offline", active: false },
    });
  }

  /**
   * Check if offline VAD is active
   */
  isOfflineVADActive(): boolean {
    return this.vadManager?.isProcessing() ?? false;
  }

  /**
   * Get offline VAD processor
   */
  getOfflineVADProcessor(): WebRTCVADProcessor | null {
    return this.vadProcessor;
  }

  // ==========================================================================
  // State Access
  // ==========================================================================

  /**
   * Get current state
   */
  getState(): FallbackState {
    return { ...this.state };
  }

  /**
   * Get current mode
   */
  getMode(): FallbackMode {
    return this.state.mode;
  }

  /**
   * Get network status
   */
  getNetworkStatus(): NetworkStatus {
    return this.state.networkStatus;
  }

  /**
   * Check if online
   */
  isOnline(): boolean {
    return this.state.networkStatus === "online";
  }

  /**
   * Check if offline mode is active
   */
  isOfflineMode(): boolean {
    return this.state.mode === "offline";
  }

  /**
   * Check if low-latency mode is active
   */
  isLowLatencyMode(): boolean {
    return this.state.mode === "low-latency";
  }

  /**
   * Get current latency
   */
  getCurrentLatency(): number | null {
    return this.state.currentLatency;
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  /**
   * Subscribe to fallback events
   */
  onEvent(callback: FallbackEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  /**
   * Emit an event
   */
  private emitEvent(event: FallbackEvent): void {
    this.eventCallbacks.forEach((callback) => callback(event));
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Dispose of resources
   */
  dispose(): void {
    // Stop network monitoring
    this.stopNetworkMonitoring();

    // Remove event listeners
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
    }

    // Stop and cleanup VAD
    if (this.vadManager) {
      this.vadManager.stop();
    }

    // Close TTS cache
    if (this.ttsCache) {
      this.ttsCache.close();
    }

    // Clear callbacks
    this.eventCallbacks.clear();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create and initialize an offline fallback manager
 */
export async function createOfflineFallbackManager(
  config?: Partial<FallbackConfig>,
): Promise<OfflineFallbackManager> {
  const manager = new OfflineFallbackManager(config);
  await manager.initialize();
  return manager;
}
