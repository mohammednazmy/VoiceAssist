/**
 * WebSocket Transport
 *
 * WebSocket-based transport implementation for voice streaming.
 * Provides reliable message delivery over TCP/TLS with support for
 * binary audio frames and JSON control messages.
 *
 * Phase: WebSocket Advanced Features
 */

import type {
  BinaryFrameType,
  ITransport,
  TransportEvent,
  TransportEventHandler,
  TransportEventType,
  TransportMessage,
  TransportMetrics,
  TransportQuality,
  TransportState,
  TransportType,
  WebSocketTransportConfig,
} from "./types";

// ============================================================================
// Constants
// ============================================================================

const BINARY_HEADER_SIZE = 5; // 1 byte type + 4 bytes sequence

// ============================================================================
// WebSocket Transport
// ============================================================================

/**
 * WebSocket Transport
 *
 * Implements the ITransport interface using WebSocket as the underlying
 * transport mechanism. Supports both text (JSON) and binary (audio) frames.
 */
export class WebSocketTransport implements ITransport {
  readonly type: TransportType = "websocket";

  private config: WebSocketTransportConfig;
  private ws: WebSocket | null = null;
  private _state: TransportState = "disconnected";
  private eventHandlers: Map<TransportEventType, Set<TransportEventHandler>> =
    new Map();

  // Metrics
  private _metrics: TransportMetrics;
  private connectionStartTime = 0;
  private lastPingTime = 0;
  private lastPongTime = 0;

  // Heartbeat
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;

  // Reconnection
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  // Sequence tracking
  private audioSequenceOut = 0;

  constructor(config: WebSocketTransportConfig) {
    this.config = config;
    this._metrics = this.createInitialMetrics();
  }

  // ==========================================================================
  // ITransport Properties
  // ==========================================================================

  get state(): TransportState {
    return this._state;
  }

  get isReady(): boolean {
    return this._state === "ready" && this.ws?.readyState === WebSocket.OPEN;
  }

  get metrics(): TransportMetrics {
    return {
      ...this._metrics,
      uptimeMs:
        this.connectionStartTime > 0
          ? Date.now() - this.connectionStartTime
          : 0,
    };
  }

  // ==========================================================================
  // Connection
  // ==========================================================================

  async connect(): Promise<void> {
    if (this._state === "connecting" || this._state === "connected") {
      return;
    }

    return new Promise((resolve, reject) => {
      this._state = "connecting";
      this.emitEvent({ type: "stateChange", data: { state: "connecting" } });

      const timeoutId = setTimeout(() => {
        reject(new Error("Connection timeout"));
        this.handleError(new Error("Connection timeout"));
      }, this.config.connectionTimeoutMs);

      try {
        this.ws = new WebSocket(this.config.wsUrl);
        this.ws.binaryType = "arraybuffer";

        this.ws.onopen = () => {
          clearTimeout(timeoutId);
          this.connectionStartTime = Date.now();
          this._state = "connected";
          this.reconnectAttempts = 0;

          this.emitEvent({ type: "stateChange", data: { state: "connected" } });

          // Send session init
          this.sendSessionInit();

          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onclose = (event) => {
          clearTimeout(timeoutId);
          this.handleClose(event);
        };

        this.ws.onerror = (_event) => {
          clearTimeout(timeoutId);
          const error = new Error("WebSocket error");
          this.handleError(error);
          reject(error);
        };
      } catch (error) {
        clearTimeout(timeoutId);
        this.handleError(
          error instanceof Error ? error : new Error(String(error)),
        );
        reject(error);
      }
    });
  }

  async disconnect(preserveState = false): Promise<void> {
    this.stopHeartbeat();
    this.clearReconnectTimeout();

    if (this.ws) {
      // Remove event handlers to prevent callbacks during close
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;

      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, preserveState ? "preserve_state" : "normal_close");
      }

      this.ws = null;
    }

    this._state = "disconnected";
    this.emitEvent({ type: "disconnected" });
  }

  // ==========================================================================
  // Message Handling
  // ==========================================================================

  async send(message: TransportMessage): Promise<void> {
    if (!this.isReady) {
      throw new Error("Transport not ready");
    }

    const data = JSON.stringify(message);
    this.ws!.send(data);
    this._metrics.messagesSent++;
    this._metrics.bytesSent += data.length;
  }

  async sendBinary(
    data: ArrayBuffer,
    frameType: BinaryFrameType,
    sequence: number,
  ): Promise<void> {
    if (!this.isReady) {
      throw new Error("Transport not ready");
    }

    // Build frame: [type:1][sequence:4][audio:N]
    const frame = new ArrayBuffer(BINARY_HEADER_SIZE + data.byteLength);
    const view = new DataView(frame);

    view.setUint8(0, frameType);
    view.setUint32(1, sequence, false); // big-endian

    // Copy audio data
    const audioView = new Uint8Array(frame, BINARY_HEADER_SIZE);
    audioView.set(new Uint8Array(data));

    this.ws!.send(frame);
    this._metrics.messagesSent++;
    this._metrics.bytesSent += frame.byteLength;
    this.audioSequenceOut++;
  }

  // ==========================================================================
  // Event Handling
  // ==========================================================================

  on(type: TransportEventType, handler: TransportEventHandler): () => void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, new Set());
    }

    this.eventHandlers.get(type)!.add(handler);

    return () => {
      this.eventHandlers.get(type)?.delete(handler);
    };
  }

  private emitEvent(
    partial: Partial<TransportEvent> & { type: TransportEventType },
  ): void {
    const event: TransportEvent = {
      ...partial,
      type: partial.type,
      transport: this.type,
      timestamp: Date.now(),
    };

    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error("[WebSocketTransport] Error in event handler:", error);
        }
      }
    }
  }

  // ==========================================================================
  // Quality Monitoring
  // ==========================================================================

  getQuality(): TransportQuality {
    const rttMs =
      this.lastPongTime > 0 && this.lastPingTime > 0
        ? this.lastPongTime - this.lastPingTime
        : 0;

    return {
      rttMs,
      packetLossPercent: 0, // WebSocket doesn't expose this
      jitterMs: 0, // WebSocket doesn't expose this
      bandwidthKbps: this.estimateBandwidth(),
      qualityScore: this.calculateQualityScore(rttMs),
    };
  }

  async checkQuality(): Promise<TransportQuality> {
    // Send a ping and wait for pong
    if (this.isReady) {
      this.lastPingTime = Date.now();
      await this.send({ type: "ping" });
    }

    return this.getQuality();
  }

  private estimateBandwidth(): number {
    const uptimeMs = Date.now() - this.connectionStartTime;
    if (uptimeMs <= 0) return 0;

    const totalBytes = this._metrics.bytesSent + this._metrics.bytesReceived;
    const kbps = (totalBytes * 8) / uptimeMs;

    return Math.round(kbps);
  }

  private calculateQualityScore(rttMs: number): number {
    // Score based on RTT
    if (rttMs <= 50) return 100;
    if (rttMs <= 100) return 90;
    if (rttMs <= 200) return 70;
    if (rttMs <= 500) return 50;
    return 30;
  }

  // ==========================================================================
  // Internal Message Handling
  // ==========================================================================

  private handleMessage(event: MessageEvent): void {
    this._metrics.messagesReceived++;

    if (event.data instanceof ArrayBuffer) {
      // Binary frame
      this._metrics.bytesReceived += event.data.byteLength;
      this.handleBinaryFrame(event.data);
    } else if (typeof event.data === "string") {
      // JSON message
      this._metrics.bytesReceived += event.data.length;
      this.handleJsonMessage(event.data);
    }
  }

  private handleBinaryFrame(data: ArrayBuffer): void {
    if (data.byteLength < BINARY_HEADER_SIZE) {
      console.warn("[WebSocketTransport] Binary frame too short");
      return;
    }

    const view = new DataView(data);
    const frameType = view.getUint8(0) as BinaryFrameType;
    const sequence = view.getUint32(1, false); // big-endian
    const audioData = data.slice(BINARY_HEADER_SIZE);

    this.emitEvent({
      type: "binary",
      data: { frameType, sequence, audio: audioData },
    });
  }

  private handleJsonMessage(data: string): void {
    try {
      const message = JSON.parse(data) as TransportMessage;

      // Handle special message types
      if (message.type === "pong") {
        this.lastPongTime = Date.now();
        return;
      }

      if (message.type === "session.ready") {
        this._state = "ready";
        this.emitEvent({ type: "stateChange", data: { state: "ready" } });
        this.startHeartbeat();
      }

      if (message.type === "session.init.ack") {
        // Protocol negotiation complete
        this.emitEvent({
          type: "message",
          data: message,
        });
        return;
      }

      this.emitEvent({
        type: "message",
        data: message,
      });
    } catch (error) {
      console.error("[WebSocketTransport] Failed to parse message:", error);
    }
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  private sendSessionInit(): void {
    const initMessage: TransportMessage = {
      type: "session.init",
      protocol_version: this.config.protocolVersion,
      features: this.config.features,
      session_id: this.config.sessionId,
      user_id: this.config.userId,
      conversation_id: this.config.conversationId,
    };

    this.ws!.send(JSON.stringify(initMessage));
  }

  // ==========================================================================
  // Heartbeat
  // ==========================================================================

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      if (this.isReady) {
        this.lastPingTime = Date.now();
        this.send({ type: "ping" }).catch((err) => {
          console.error("[WebSocketTransport] Heartbeat ping failed:", err);
        });

        // Set timeout for pong response
        this.heartbeatTimeout = setTimeout(() => {
          console.warn("[WebSocketTransport] Heartbeat timeout");
          this.handleError(new Error("Heartbeat timeout"));
        }, this.config.heartbeatTimeoutMs);
      }
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  private handleError(error: Error): void {
    this._metrics.lastError = error.message;

    this.emitEvent({
      type: "error",
      error,
    });

    // Attempt reconnection
    if (this._state !== "disconnected") {
      this.attemptReconnection();
    }
  }

  private handleClose(event: CloseEvent): void {
    this.stopHeartbeat();
    this._state = "disconnected";

    this.emitEvent({
      type: "disconnected",
      data: { code: event.code, reason: event.reason },
    });

    // Attempt reconnection for unexpected closes
    if (event.code !== 1000 && event.code !== 1001) {
      this.attemptReconnection();
    }
  }

  // ==========================================================================
  // Reconnection
  // ==========================================================================

  private attemptReconnection(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error("[WebSocketTransport] Max reconnection attempts reached");
      this._state = "error";
      this.emitEvent({
        type: "error",
        error: new Error("Max reconnection attempts reached"),
      });
      return;
    }

    this._state = "reconnecting";
    this.reconnectAttempts++;
    this._metrics.reconnectAttempts = this.reconnectAttempts;

    this.emitEvent({
      type: "reconnecting",
      data: { attempt: this.reconnectAttempts },
    });

    // Exponential backoff
    const delay = Math.min(
      this.config.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1),
      30000,
    );

    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect();
        this.emitEvent({ type: "reconnected" });
      } catch (error) {
        console.error("[WebSocketTransport] Reconnection failed:", error);
        this.attemptReconnection();
      }
    }, delay);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private createInitialMetrics(): TransportMetrics {
    return {
      bytesSent: 0,
      bytesReceived: 0,
      messagesSent: 0,
      messagesReceived: 0,
      uptimeMs: 0,
      reconnectAttempts: 0,
      quality: {
        rttMs: 0,
        packetLossPercent: 0,
        jitterMs: 0,
        bandwidthKbps: 0,
        qualityScore: 100,
      },
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a WebSocket transport
 */
export function createWebSocketTransport(
  config: WebSocketTransportConfig,
): WebSocketTransport {
  return new WebSocketTransport(config);
}
