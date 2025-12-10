/**
 * Voice Transport Layer
 *
 * Unified transport abstraction for voice streaming supporting
 * WebSocket and WebRTC transports with automatic fallback.
 *
 * Phase: WebSocket Advanced Features
 */

// Types
export * from "./types";

// Transport implementations
export {
  WebSocketTransport,
  createWebSocketTransport,
} from "./WebSocketTransport";
export { WebRTCTransport, createWebRTCTransport } from "./WebRTCTransport";

// Transport manager
export { TransportManager, createTransportManager } from "./TransportManager";
