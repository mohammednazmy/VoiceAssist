/**
 * Voice Transport Layer Types
 *
 * Type definitions for the transport abstraction layer that supports
 * multiple transport mechanisms (WebSocket, WebRTC) for voice streaming.
 *
 * Phase: WebSocket Advanced Features
 */

// ============================================================================
// Transport Types
// ============================================================================

/**
 * Supported transport types
 */
export type TransportType = "websocket" | "webrtc";

/**
 * Transport connection states
 */
export type TransportState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "ready"
  | "reconnecting"
  | "error"
  | "closed";

/**
 * Transport quality indicators
 */
export interface TransportQuality {
  /** Round-trip time in milliseconds */
  rttMs: number;
  /** Packet loss percentage (0-100) */
  packetLossPercent: number;
  /** Jitter in milliseconds */
  jitterMs: number;
  /** Estimated bandwidth in kbps */
  bandwidthKbps: number;
  /** Quality score (0-100) */
  qualityScore: number;
}

/**
 * Transport metrics for monitoring
 */
export interface TransportMetrics {
  /** Total bytes sent */
  bytesSent: number;
  /** Total bytes received */
  bytesReceived: number;
  /** Total messages sent */
  messagesSent: number;
  /** Total messages received */
  messagesReceived: number;
  /** Connection uptime in milliseconds */
  uptimeMs: number;
  /** Number of reconnection attempts */
  reconnectAttempts: number;
  /** Current quality metrics */
  quality: TransportQuality;
  /** Last error if any */
  lastError?: string;
}

// ============================================================================
// Message Types
// ============================================================================

/**
 * Binary frame types for audio protocol
 */
export const BINARY_FRAME_TYPE = {
  AUDIO_INPUT: 0x01,
  AUDIO_OUTPUT: 0x02,
  AUDIO_INPUT_OPUS: 0x03, // Opus-encoded input
  AUDIO_OUTPUT_OPUS: 0x04, // Opus-encoded output
} as const;

export type BinaryFrameType =
  (typeof BINARY_FRAME_TYPE)[keyof typeof BINARY_FRAME_TYPE];

/**
 * Transport message (JSON or binary)
 */
export interface TransportMessage {
  /** Message type for JSON messages */
  type?: string;
  /** Sequence number for ordering */
  seq?: number;
  /** Binary data for audio frames */
  binary?: ArrayBuffer;
  /** Frame type for binary messages */
  frameType?: BinaryFrameType;
  /** Additional message data */
  [key: string]: unknown;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Base transport configuration
 */
export interface TransportConfig {
  /** WebSocket URL for WS transport */
  wsUrl: string;
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Conversation ID */
  conversationId?: string;
  /** Connection timeout in milliseconds */
  connectionTimeoutMs: number;
  /** Heartbeat interval in milliseconds */
  heartbeatIntervalMs: number;
  /** Heartbeat timeout in milliseconds */
  heartbeatTimeoutMs: number;
  /** Maximum reconnection attempts */
  maxReconnectAttempts: number;
  /** Reconnection delay in milliseconds */
  reconnectDelayMs: number;
  /** Features to negotiate */
  features: string[];
}

/**
 * WebSocket-specific configuration
 */
export interface WebSocketTransportConfig extends TransportConfig {
  /** Protocol version */
  protocolVersion: string;
  /** Enable binary protocol */
  binaryProtocol: boolean;
  /** Enable message batching */
  messageBatching: boolean;
}

/**
 * WebRTC-specific configuration
 */
export interface WebRTCTransportConfig extends TransportConfig {
  /** ICE servers for STUN/TURN */
  iceServers: RTCIceServer[];
  /** Data channel label */
  dataChannelLabel: string;
  /** Data channel ordered delivery */
  dataChannelOrdered: boolean;
  /** Maximum retransmits for unreliable mode */
  maxRetransmits?: number;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Transport event types
 */
export type TransportEventType =
  | "connected"
  | "disconnected"
  | "message"
  | "binary"
  | "error"
  | "stateChange"
  | "qualityChange"
  | "reconnecting"
  | "reconnected";

/**
 * Transport event payload
 */
export interface TransportEvent {
  type: TransportEventType;
  transport: TransportType;
  timestamp: number;
  data?: unknown;
  error?: Error;
}

/**
 * Transport event handler
 */
export type TransportEventHandler = (event: TransportEvent) => void;

// ============================================================================
// Transport Interface
// ============================================================================

/**
 * Abstract transport interface
 *
 * All transport implementations must implement this interface.
 */
export interface ITransport {
  /** Transport type identifier */
  readonly type: TransportType;

  /** Current connection state */
  readonly state: TransportState;

  /** Whether the transport is connected and ready */
  readonly isReady: boolean;

  /** Current transport metrics */
  readonly metrics: TransportMetrics;

  /**
   * Connect to the remote endpoint
   * @returns Promise that resolves when connected
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the remote endpoint
   * @param preserveState Whether to preserve state for reconnection
   */
  disconnect(preserveState?: boolean): Promise<void>;

  /**
   * Send a JSON message
   * @param message Message to send
   */
  send(message: TransportMessage): Promise<void>;

  /**
   * Send binary audio data
   * @param data Audio data to send
   * @param frameType Binary frame type
   * @param sequence Sequence number
   */
  sendBinary(
    data: ArrayBuffer,
    frameType: BinaryFrameType,
    sequence: number,
  ): Promise<void>;

  /**
   * Subscribe to transport events
   * @param type Event type to subscribe to
   * @param handler Event handler
   * @returns Unsubscribe function
   */
  on(type: TransportEventType, handler: TransportEventHandler): () => void;

  /**
   * Get current quality metrics
   */
  getQuality(): TransportQuality;

  /**
   * Force a quality check
   */
  checkQuality(): Promise<TransportQuality>;
}

// ============================================================================
// Transport Manager Types
// ============================================================================

/**
 * Transport selection strategy
 */
export type TransportStrategy = "websocket-only" | "webrtc-prefer" | "adaptive";

/**
 * Transport manager configuration
 */
export interface TransportManagerConfig {
  /** Transport selection strategy */
  strategy: TransportStrategy;
  /** WebSocket configuration */
  websocket: WebSocketTransportConfig;
  /** WebRTC configuration (optional) */
  webrtc?: WebRTCTransportConfig;
  /** Enable automatic fallback */
  autoFallback: boolean;
  /** Quality threshold for switching transports */
  qualitySwitchThreshold: number;
}

/**
 * Transport manager events
 */
export type TransportManagerEventType =
  | TransportEventType
  | "transportSwitch"
  | "fallback";

/**
 * Transport manager event
 */
export interface TransportManagerEvent extends Omit<TransportEvent, "type"> {
  /** Event type (includes manager-specific events) */
  type: TransportManagerEventType;
  /** Previous transport (for switch events) */
  previousTransport?: TransportType;
  /** Reason for the event */
  reason?: string;
}

/**
 * Transport manager event handler
 */
export type TransportManagerEventHandler = (
  event: TransportManagerEvent,
) => void;
