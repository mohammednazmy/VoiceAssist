/**
 * WebRTC Transport
 *
 * WebRTC-based transport implementation for voice streaming.
 * Uses data channels for lower latency compared to WebSocket.
 *
 * Phase: WebSocket Advanced Features
 *
 * Benefits over WebSocket:
 * - UDP transport (lower latency, no head-of-line blocking)
 * - Built-in ICE for NAT traversal
 * - DTLS-SRTP encryption
 * - 20-50ms latency improvement
 *
 * Tradeoffs:
 * - More complex signaling setup
 * - May not work on all networks (requires TURN fallback)
 * - Slightly higher initial connection time
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
  WebRTCTransportConfig,
} from "./types";

// ============================================================================
// Constants
// ============================================================================

const BINARY_HEADER_SIZE = 5; // 1 byte type + 4 bytes sequence

// ============================================================================
// WebRTC Transport
// ============================================================================

/**
 * WebRTC Transport
 *
 * Implements the ITransport interface using WebRTC data channels.
 * Requires a signaling mechanism (typically WebSocket) for SDP/ICE exchange.
 */
export class WebRTCTransport implements ITransport {
  readonly type: TransportType = "webrtc";

  private config: WebRTCTransportConfig;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private signalingWs: WebSocket | null = null;
  private _state: TransportState = "disconnected";
  private eventHandlers: Map<TransportEventType, Set<TransportEventHandler>> =
    new Map();

  // Metrics
  private _metrics: TransportMetrics;
  private connectionStartTime = 0;
  private lastStatsTimestamp = 0;
  private lastBytesSent = 0;
  private lastBytesReceived = 0;

  // Quality tracking
  private rttSamples: number[] = [];
  private packetLossSamples: number[] = [];
  private jitterSamples: number[] = [];

  constructor(config: WebRTCTransportConfig) {
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
    return this._state === "ready" && this.dataChannel?.readyState === "open";
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

    this._state = "connecting";
    this.emitEvent({ type: "stateChange", data: { state: "connecting" } });

    try {
      // Create peer connection
      this.peerConnection = new RTCPeerConnection({
        iceServers: this.config.iceServers,
      });

      // Set up peer connection event handlers
      this.setupPeerConnectionEvents();

      // Create data channel
      this.dataChannel = this.peerConnection.createDataChannel(
        this.config.dataChannelLabel,
        {
          ordered: this.config.dataChannelOrdered,
          maxRetransmits: this.config.maxRetransmits,
        },
      );

      this.dataChannel.binaryType = "arraybuffer";
      this.setupDataChannelEvents();

      // Connect to signaling server
      await this.connectSignaling();

      // Create and send offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      // Send offer via signaling
      this.sendSignaling({
        type: "offer",
        sdp: offer.sdp,
        session_id: this.config.sessionId,
      });

      // Wait for data channel to open
      await this.waitForDataChannel();

      this.connectionStartTime = Date.now();
      this._state = "ready";

      this.emitEvent({ type: "connected" });
      this.emitEvent({ type: "stateChange", data: { state: "ready" } });

      // Start quality monitoring
      this.startStatsCollection();
    } catch (error) {
      this._state = "error";
      this.emitEvent({
        type: "error",
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  async disconnect(_preserveState = false): Promise<void> {
    this.stopStatsCollection();

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.signalingWs) {
      this.signalingWs.close();
      this.signalingWs = null;
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
    this.dataChannel!.send(data);
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

    this.dataChannel!.send(frame);
    this._metrics.messagesSent++;
    this._metrics.bytesSent += frame.byteLength;
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
          console.error("[WebRTCTransport] Error in event handler:", error);
        }
      }
    }
  }

  // ==========================================================================
  // Quality Monitoring
  // ==========================================================================

  getQuality(): TransportQuality {
    return {
      rttMs: this.averageSamples(this.rttSamples),
      packetLossPercent: this.averageSamples(this.packetLossSamples),
      jitterMs: this.averageSamples(this.jitterSamples),
      bandwidthKbps: this.estimateBandwidth(),
      qualityScore: this.calculateQualityScore(),
    };
  }

  async checkQuality(): Promise<TransportQuality> {
    await this.collectStats();
    return this.getQuality();
  }

  private averageSamples(samples: number[]): number {
    if (samples.length === 0) return 0;
    const sum = samples.reduce((a, b) => a + b, 0);
    return Math.round(sum / samples.length);
  }

  private estimateBandwidth(): number {
    const uptimeMs = Date.now() - this.connectionStartTime;
    if (uptimeMs <= 0) return 0;

    const totalBytes = this._metrics.bytesSent + this._metrics.bytesReceived;
    return Math.round((totalBytes * 8) / uptimeMs);
  }

  private calculateQualityScore(): number {
    const rtt = this.averageSamples(this.rttSamples);
    const packetLoss = this.averageSamples(this.packetLossSamples);
    const jitter = this.averageSamples(this.jitterSamples);

    // Score based on metrics
    let score = 100;

    // RTT penalty
    if (rtt > 50) score -= Math.min((rtt - 50) / 5, 30);

    // Packet loss penalty
    score -= packetLoss * 5;

    // Jitter penalty
    if (jitter > 20) score -= Math.min((jitter - 20) / 2, 20);

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  // ==========================================================================
  // Peer Connection Setup
  // ==========================================================================

  private setupPeerConnectionEvents(): void {
    if (!this.peerConnection) return;

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignaling({
          type: "ice-candidate",
          candidate: event.candidate.toJSON(),
          session_id: this.config.sessionId,
        });
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      console.log(`[WebRTCTransport] ICE state: ${state}`);

      if (state === "failed" || state === "disconnected") {
        this.handleConnectionFailure();
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log(`[WebRTCTransport] Connection state: ${state}`);
    };
  }

  private setupDataChannelEvents(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.log("[WebRTCTransport] Data channel open");
    };

    this.dataChannel.onclose = () => {
      console.log("[WebRTCTransport] Data channel closed");
      this._state = "disconnected";
      this.emitEvent({ type: "disconnected" });
    };

    this.dataChannel.onerror = (event) => {
      console.error("[WebRTCTransport] Data channel error:", event);
      this.emitEvent({
        type: "error",
        error: new Error("Data channel error"),
      });
    };

    this.dataChannel.onmessage = (event) => {
      this.handleMessage(event);
    };
  }

  // ==========================================================================
  // Signaling
  // ==========================================================================

  private async connectSignaling(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use WebSocket base URL and add /webrtc/signal path
      const signalingUrl = this.config.wsUrl.replace(
        "/voice/ws",
        "/voice/webrtc/signal",
      );

      this.signalingWs = new WebSocket(signalingUrl);

      this.signalingWs.onopen = () => {
        console.log("[WebRTCTransport] Signaling connected");
        resolve();
      };

      this.signalingWs.onerror = (_event) => {
        reject(new Error("Signaling connection failed"));
      };

      this.signalingWs.onmessage = (event) => {
        this.handleSignalingMessage(event.data);
      };

      this.signalingWs.onclose = () => {
        console.log("[WebRTCTransport] Signaling disconnected");
      };
    });
  }

  private sendSignaling(message: Record<string, unknown>): void {
    if (this.signalingWs?.readyState === WebSocket.OPEN) {
      this.signalingWs.send(JSON.stringify(message));
    }
  }

  private async handleSignalingMessage(data: string): Promise<void> {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case "answer":
          await this.peerConnection?.setRemoteDescription({
            type: "answer",
            sdp: message.sdp,
          });
          break;

        case "ice-candidate":
          await this.peerConnection?.addIceCandidate(
            new RTCIceCandidate(message.candidate),
          );
          break;

        default:
          console.log(
            `[WebRTCTransport] Unknown signaling message: ${message.type}`,
          );
      }
    } catch (error) {
      console.error("[WebRTCTransport] Error handling signaling:", error);
    }
  }

  // ==========================================================================
  // Message Handling
  // ==========================================================================

  private handleMessage(event: MessageEvent): void {
    this._metrics.messagesReceived++;

    if (event.data instanceof ArrayBuffer) {
      this._metrics.bytesReceived += event.data.byteLength;
      this.handleBinaryFrame(event.data);
    } else if (typeof event.data === "string") {
      this._metrics.bytesReceived += event.data.length;
      this.handleJsonMessage(event.data);
    }
  }

  private handleBinaryFrame(data: ArrayBuffer): void {
    if (data.byteLength < BINARY_HEADER_SIZE) {
      console.warn("[WebRTCTransport] Binary frame too short");
      return;
    }

    const view = new DataView(data);
    const frameType = view.getUint8(0) as BinaryFrameType;
    const sequence = view.getUint32(1, false);
    const audioData = data.slice(BINARY_HEADER_SIZE);

    this.emitEvent({
      type: "binary",
      data: { frameType, sequence, audio: audioData },
    });
  }

  private handleJsonMessage(data: string): void {
    try {
      const message = JSON.parse(data) as TransportMessage;
      this.emitEvent({
        type: "message",
        data: message,
      });
    } catch (error) {
      console.error("[WebRTCTransport] Failed to parse message:", error);
    }
  }

  // ==========================================================================
  // Stats Collection
  // ==========================================================================

  private statsInterval: ReturnType<typeof setInterval> | null = null;

  private startStatsCollection(): void {
    this.statsInterval = setInterval(() => {
      this.collectStats();
    }, 1000);
  }

  private stopStatsCollection(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  private async collectStats(): Promise<void> {
    if (!this.peerConnection) return;

    try {
      const stats = await this.peerConnection.getStats();

      stats.forEach((report) => {
        if (report.type === "candidate-pair" && report.state === "succeeded") {
          // RTT
          if (report.currentRoundTripTime !== undefined) {
            this.rttSamples.push(report.currentRoundTripTime * 1000);
            if (this.rttSamples.length > 10) this.rttSamples.shift();
          }
        }

        if (report.type === "inbound-rtp" && report.kind === "audio") {
          // Packet loss
          if (report.packetsLost !== undefined && report.packetsReceived) {
            const total = report.packetsLost + report.packetsReceived;
            const lossPercent = (report.packetsLost / total) * 100;
            this.packetLossSamples.push(lossPercent);
            if (this.packetLossSamples.length > 10)
              this.packetLossSamples.shift();
          }

          // Jitter
          if (report.jitter !== undefined) {
            this.jitterSamples.push(report.jitter * 1000);
            if (this.jitterSamples.length > 10) this.jitterSamples.shift();
          }
        }
      });
    } catch (error) {
      console.error("[WebRTCTransport] Stats collection error:", error);
    }
  }

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  private handleConnectionFailure(): void {
    this._state = "error";
    this.emitEvent({
      type: "error",
      error: new Error("WebRTC connection failed"),
    });
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private waitForDataChannel(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.dataChannel?.readyState === "open") {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error("Data channel open timeout"));
      }, this.config.connectionTimeoutMs);

      if (this.dataChannel) {
        this.dataChannel.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };
      }
    });
  }

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
 * Create a WebRTC transport
 */
export function createWebRTCTransport(
  config: WebRTCTransportConfig,
): WebRTCTransport {
  return new WebRTCTransport(config);
}
