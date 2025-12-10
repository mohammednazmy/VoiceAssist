/**
 * Transport Manager
 *
 * Manages voice transport connections with support for multiple transport types
 * (WebSocket, WebRTC) and automatic fallback between them.
 *
 * Phase: WebSocket Advanced Features
 */

import {
  getNetworkMonitor,
  type NetworkStatus,
} from "../../offline/networkMonitor";
import type {
  ITransport,
  TransportConfig,
  TransportEvent,
  TransportEventType,
  TransportManagerConfig,
  TransportManagerEvent,
  TransportManagerEventHandler,
  TransportManagerEventType,
  TransportMetrics,
  TransportQuality,
  TransportState,
  TransportType,
  BinaryFrameType,
  TransportMessage,
} from "./types";

// ============================================================================
// Types
// ============================================================================

type EventHandlerMap = Map<
  TransportManagerEventType,
  Set<TransportManagerEventHandler>
>;

// ============================================================================
// Transport Manager
// ============================================================================

/**
 * Transport Manager
 *
 * Provides a unified interface for managing voice transport connections.
 * Supports multiple transport types and automatic fallback.
 *
 * Features:
 * - Automatic transport selection based on network quality
 * - Seamless fallback between WebSocket and WebRTC
 * - Quality monitoring and adaptive switching
 * - Unified event handling
 */
export class TransportManager {
  private config: TransportManagerConfig;
  private activeTransport: ITransport | null = null;
  private fallbackTransport: ITransport | null = null;
  private eventHandlers: EventHandlerMap = new Map();
  private networkMonitor = getNetworkMonitor();
  private networkUnsubscribe: (() => void) | null = null;
  private qualityCheckInterval: ReturnType<typeof setInterval> | null = null;
  private _state: TransportState = "disconnected";

  // Transport factories (injected)
  private wsFactory: ((config: TransportConfig) => ITransport) | null = null;
  private webrtcFactory: ((config: TransportConfig) => ITransport) | null =
    null;

  constructor(config: TransportManagerConfig) {
    this.config = config;
  }

  // ==========================================================================
  // Properties
  // ==========================================================================

  /** Current connection state */
  get state(): TransportState {
    return this._state;
  }

  /** Whether connected and ready */
  get isReady(): boolean {
    return this.activeTransport?.isReady ?? false;
  }

  /** Current transport type */
  get transportType(): TransportType | null {
    return this.activeTransport?.type ?? null;
  }

  /** Current transport metrics */
  get metrics(): TransportMetrics | null {
    return this.activeTransport?.metrics ?? null;
  }

  // ==========================================================================
  // Factory Registration
  // ==========================================================================

  /**
   * Register WebSocket transport factory
   */
  registerWebSocketFactory(
    factory: (config: TransportConfig) => ITransport,
  ): void {
    this.wsFactory = factory;
  }

  /**
   * Register WebRTC transport factory
   */
  registerWebRTCFactory(
    factory: (config: TransportConfig) => ITransport,
  ): void {
    this.webrtcFactory = factory;
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  /**
   * Connect using the configured strategy
   */
  async connect(): Promise<void> {
    if (this._state === "connecting" || this._state === "connected") {
      console.warn("[TransportManager] Already connected or connecting");
      return;
    }

    this._state = "connecting";
    this.emitEvent({
      type: "stateChange",
      transport: "websocket",
      timestamp: Date.now(),
      data: { state: "connecting" },
    });

    try {
      // Determine which transport to use based on strategy
      const transport = await this.selectTransport();

      if (!transport) {
        throw new Error("No transport available");
      }

      // Set up event forwarding
      this.setupTransportEvents(transport);

      // Connect
      await transport.connect();

      this.activeTransport = transport;
      this._state = "connected";

      this.emitEvent({
        type: "connected",
        transport: transport.type,
        timestamp: Date.now(),
      });

      // Start monitoring
      this.startQualityMonitoring();
      this.startNetworkMonitoring();

      // Initialize fallback transport if configured
      if (this.config.autoFallback) {
        this.initializeFallbackTransport();
      }
    } catch (error) {
      this._state = "error";
      this.emitEvent({
        type: "error",
        transport: "websocket",
        timestamp: Date.now(),
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /**
   * Disconnect from all transports
   */
  async disconnect(preserveState = false): Promise<void> {
    this.stopQualityMonitoring();
    this.stopNetworkMonitoring();

    if (this.activeTransport) {
      await this.activeTransport.disconnect(preserveState);
      this.activeTransport = null;
    }

    if (this.fallbackTransport) {
      await this.fallbackTransport.disconnect(false);
      this.fallbackTransport = null;
    }

    this._state = "disconnected";
    this.emitEvent({
      type: "disconnected",
      transport: "websocket",
      timestamp: Date.now(),
    });
  }

  // ==========================================================================
  // Message Handling
  // ==========================================================================

  /**
   * Send a JSON message
   */
  async send(message: TransportMessage): Promise<void> {
    if (!this.activeTransport?.isReady) {
      throw new Error("Transport not ready");
    }

    await this.activeTransport.send(message);
  }

  /**
   * Send binary audio data
   */
  async sendBinary(
    data: ArrayBuffer,
    frameType: BinaryFrameType,
    sequence: number,
  ): Promise<void> {
    if (!this.activeTransport?.isReady) {
      throw new Error("Transport not ready");
    }

    await this.activeTransport.sendBinary(data, frameType, sequence);
  }

  // ==========================================================================
  // Event Handling
  // ==========================================================================

  /**
   * Subscribe to transport events
   */
  on(
    type: TransportManagerEventType,
    handler: TransportManagerEventHandler,
  ): () => void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, new Set());
    }

    this.eventHandlers.get(type)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.eventHandlers.get(type)?.delete(handler);
    };
  }

  /**
   * Emit an event to all handlers
   */
  private emitEvent(event: TransportManagerEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error("[TransportManager] Error in event handler:", error);
        }
      }
    }
  }

  // ==========================================================================
  // Transport Selection
  // ==========================================================================

  /**
   * Select transport based on strategy
   */
  private async selectTransport(): Promise<ITransport | null> {
    const strategy = this.config.strategy;

    switch (strategy) {
      case "websocket-only":
        return this.createWebSocketTransport();

      case "webrtc-prefer":
        // Try WebRTC first, fall back to WebSocket
        if (this.webrtcFactory && this.isWebRTCSupported()) {
          try {
            return this.createWebRTCTransport();
          } catch (error) {
            console.warn(
              "[TransportManager] WebRTC not available, falling back to WebSocket:",
              error,
            );
          }
        }
        return this.createWebSocketTransport();

      case "adaptive":
        // Choose based on network quality
        return this.selectAdaptiveTransport();

      default:
        return this.createWebSocketTransport();
    }
  }

  /**
   * Select transport adaptively based on network conditions
   */
  private async selectAdaptiveTransport(): Promise<ITransport | null> {
    const networkStatus = this.networkMonitor.getStatus();

    // Use WebRTC for excellent/good networks (lower latency)
    if (
      this.webrtcFactory &&
      this.isWebRTCSupported() &&
      (networkStatus.quality === "excellent" ||
        networkStatus.quality === "good")
    ) {
      try {
        return this.createWebRTCTransport();
      } catch {
        // Fall through to WebSocket
      }
    }

    // Use WebSocket for moderate/poor networks (more reliable)
    return this.createWebSocketTransport();
  }

  /**
   * Create WebSocket transport
   */
  private createWebSocketTransport(): ITransport | null {
    if (!this.wsFactory) {
      console.error("[TransportManager] WebSocket factory not registered");
      return null;
    }

    return this.wsFactory(this.config.websocket);
  }

  /**
   * Create WebRTC transport
   */
  private createWebRTCTransport(): ITransport | null {
    if (!this.webrtcFactory || !this.config.webrtc) {
      console.error("[TransportManager] WebRTC factory not registered");
      return null;
    }

    return this.webrtcFactory(this.config.webrtc);
  }

  /**
   * Check if WebRTC is supported
   */
  private isWebRTCSupported(): boolean {
    return (
      typeof RTCPeerConnection !== "undefined" &&
      typeof RTCDataChannel !== "undefined"
    );
  }

  // ==========================================================================
  // Fallback Management
  // ==========================================================================

  /**
   * Initialize fallback transport
   */
  private async initializeFallbackTransport(): Promise<void> {
    if (!this.activeTransport) return;

    const activeType = this.activeTransport.type;

    // Create the opposite transport as fallback
    if (activeType === "webrtc" && this.wsFactory) {
      this.fallbackTransport = this.createWebSocketTransport();
    } else if (
      activeType === "websocket" &&
      this.webrtcFactory &&
      this.isWebRTCSupported()
    ) {
      this.fallbackTransport = this.createWebRTCTransport();
    }

    // Pre-connect fallback transport (optional optimization)
    // await this.fallbackTransport?.connect();
  }

  /**
   * Switch to fallback transport
   */
  async switchToFallback(reason: string): Promise<boolean> {
    if (!this.fallbackTransport) {
      console.warn("[TransportManager] No fallback transport available");
      return false;
    }

    const previousTransport = this.activeTransport?.type;

    try {
      // Set up events on fallback
      this.setupTransportEvents(this.fallbackTransport);

      // Connect fallback if not already connected
      if (!this.fallbackTransport.isReady) {
        await this.fallbackTransport.connect();
      }

      // Disconnect active
      if (this.activeTransport) {
        await this.activeTransport.disconnect(true);
      }

      // Swap transports
      const temp = this.activeTransport;
      this.activeTransport = this.fallbackTransport;
      this.fallbackTransport = temp;

      this.emitEvent({
        type: "transportSwitch",
        transport: this.activeTransport.type,
        timestamp: Date.now(),
        previousTransport,
        reason,
      } as TransportManagerEvent);

      return true;
    } catch (error) {
      console.error("[TransportManager] Failed to switch to fallback:", error);

      this.emitEvent({
        type: "fallback",
        transport: this.activeTransport?.type ?? "websocket",
        timestamp: Date.now(),
        error: error instanceof Error ? error : new Error(String(error)),
        reason: "switch_failed",
      } as TransportManagerEvent);

      return false;
    }
  }

  // ==========================================================================
  // Event Forwarding
  // ==========================================================================

  /**
   * Set up event forwarding from transport
   */
  private setupTransportEvents(transport: ITransport): void {
    const eventTypes: TransportEventType[] = [
      "connected",
      "disconnected",
      "message",
      "binary",
      "error",
      "stateChange",
      "qualityChange",
      "reconnecting",
      "reconnected",
    ];

    for (const eventType of eventTypes) {
      transport.on(eventType, (event: TransportEvent) => {
        this.handleTransportEvent(event);
      });
    }
  }

  /**
   * Handle transport events
   */
  private handleTransportEvent(event: TransportEvent): void {
    // Handle disconnection
    if (event.type === "disconnected" && this.config.autoFallback) {
      this.switchToFallback("transport_disconnected");
    }

    // Handle errors
    if (event.type === "error" && this.config.autoFallback) {
      this.switchToFallback("transport_error");
    }

    // Forward event
    this.emitEvent({
      ...event,
    });
  }

  // ==========================================================================
  // Quality Monitoring
  // ==========================================================================

  /**
   * Start quality monitoring
   */
  private startQualityMonitoring(): void {
    // Check quality every 5 seconds
    this.qualityCheckInterval = setInterval(() => {
      this.checkQualityAndSwitch();
    }, 5000);
  }

  /**
   * Stop quality monitoring
   */
  private stopQualityMonitoring(): void {
    if (this.qualityCheckInterval) {
      clearInterval(this.qualityCheckInterval);
      this.qualityCheckInterval = null;
    }
  }

  /**
   * Check quality and potentially switch transports
   */
  private async checkQualityAndSwitch(): Promise<void> {
    if (!this.activeTransport || this.config.strategy !== "adaptive") {
      return;
    }

    const quality = await this.activeTransport.checkQuality();

    // Switch to fallback if quality is poor
    if (quality.qualityScore < this.config.qualitySwitchThreshold) {
      await this.switchToFallback("quality_degraded");
    }
  }

  /**
   * Get current quality
   */
  getQuality(): TransportQuality | null {
    return this.activeTransport?.getQuality() ?? null;
  }

  // ==========================================================================
  // Network Monitoring
  // ==========================================================================

  /**
   * Start network monitoring
   */
  private startNetworkMonitoring(): void {
    this.networkUnsubscribe = this.networkMonitor.subscribe(
      (status: NetworkStatus) => {
        this.handleNetworkChange(status);
      },
    );
  }

  /**
   * Stop network monitoring
   */
  private stopNetworkMonitoring(): void {
    if (this.networkUnsubscribe) {
      this.networkUnsubscribe();
      this.networkUnsubscribe = null;
    }
  }

  /**
   * Handle network status changes
   */
  private handleNetworkChange(status: NetworkStatus): void {
    if (!status.isOnline) {
      // Network went offline
      this._state = "disconnected";
      this.emitEvent({
        type: "disconnected",
        transport: this.activeTransport?.type ?? "websocket",
        timestamp: Date.now(),
        data: { reason: "network_offline" },
      });
    } else if (this._state === "disconnected" && status.isOnline) {
      // Network came back online - trigger reconnection
      this.emitEvent({
        type: "reconnecting",
        transport: this.activeTransport?.type ?? "websocket",
        timestamp: Date.now(),
      });
    }
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.disconnect(false);
    this.eventHandlers.clear();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new TransportManager instance
 */
export function createTransportManager(
  config: TransportManagerConfig,
): TransportManager {
  return new TransportManager(config);
}
