/**
 * MockWebSocket for Voice Feature Testing
 *
 * Comprehensive WebSocket mock with:
 * - Connection lifecycle simulation
 * - Message helpers (send, receive, broadcast)
 * - Event simulation (open, close, error, message)
 * - Binary data support (for audio chunks)
 * - Heartbeat/pong simulation
 *
 * Phase: Voice Feature Hardening
 */

import { vi } from "vitest";

// ============================================================================
// Types
// ============================================================================

export interface MockWebSocketOptions {
  /** Auto-connect on instantiation (default: true) */
  autoConnect?: boolean;
  /** Delay before connection opens (ms) */
  connectDelay?: number;
  /** Simulate connection failure */
  simulateFailure?: boolean;
  /** Custom close code on failure */
  failureCode?: number;
  /** Custom close reason on failure */
  failureReason?: string;
}

export type MessageHandler = (data: unknown) => void;

// ============================================================================
// MockWebSocket Implementation
// ============================================================================

export class MockWebSocket {
  // WebSocket constants
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  // Instance constants
  readonly CONNECTING = MockWebSocket.CONNECTING;
  readonly OPEN = MockWebSocket.OPEN;
  readonly CLOSING = MockWebSocket.CLOSING;
  readonly CLOSED = MockWebSocket.CLOSED;

  // WebSocket properties
  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  bufferedAmount: number = 0;
  extensions: string = "";
  protocol: string = "";
  binaryType: BinaryType = "blob";

  // Event handlers
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  // Internal state
  private _eventListeners: Map<string, Set<EventListener>> = new Map();
  private _messageLog: Array<string | ArrayBuffer | Blob> = [];
  private _options: MockWebSocketOptions;

  // Spy functions for test assertions
  send = vi.fn((data: string | ArrayBuffer | Blob) => {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    this._messageLog.push(data);
    this.bufferedAmount += typeof data === "string" ? data.length : 0;
    // Simulate buffer drain
    setTimeout(() => {
      this.bufferedAmount = Math.max(0, this.bufferedAmount - 1000);
    }, 10);
  });

  close = vi.fn((code?: number, reason?: string) => {
    if (this.readyState === MockWebSocket.CLOSED) return;

    this.readyState = MockWebSocket.CLOSING;

    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      const event = new CloseEvent("close", {
        code: code ?? 1000,
        reason: reason ?? "",
        wasClean: (code ?? 1000) === 1000,
      });
      this._dispatchEvent("close", event);
    }, 0);
  });

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    if (protocols) {
      this.protocol = Array.isArray(protocols) ? protocols[0] : protocols;
    }
    this._options = (MockWebSocket._pendingOptions ||
      {}) as MockWebSocketOptions;
    MockWebSocket._pendingOptions = null;

    const {
      autoConnect = true,
      connectDelay = 0,
      simulateFailure = false,
    } = this._options;

    if (autoConnect) {
      setTimeout(() => {
        if (simulateFailure) {
          this.readyState = MockWebSocket.CLOSED;
          this._dispatchEvent("error", new Event("error"));
          this._dispatchEvent(
            "close",
            new CloseEvent("close", {
              code: this._options.failureCode ?? 1006,
              reason: this._options.failureReason ?? "Connection failed",
              wasClean: false,
            }),
          );
        } else {
          this.readyState = MockWebSocket.OPEN;
          this._dispatchEvent("open", new Event("open"));
        }
      }, connectDelay);
    }
  }

  // EventTarget methods
  addEventListener(type: string, listener: EventListener): void {
    if (!this._eventListeners.has(type)) {
      this._eventListeners.set(type, new Set());
    }
    this._eventListeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this._eventListeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    return this._dispatchEvent(event.type, event);
  }

  private _dispatchEvent(type: string, event: Event): boolean {
    // Call the on* handler
    const handler = this[`on${type}` as keyof this];
    if (typeof handler === "function") {
      (handler as EventListener)(event);
    }

    // Call registered listeners
    const listeners = this._eventListeners.get(type);
    if (listeners) {
      listeners.forEach((listener) => listener(event));
    }

    return !event.defaultPrevented;
  }

  // ============================================================================
  // Test Helper Methods
  // ============================================================================

  /**
   * Simulate receiving a message from the server
   */
  receiveMessage(data: string | object): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error("Cannot receive message: WebSocket is not open");
    }

    const messageData = typeof data === "object" ? JSON.stringify(data) : data;
    const event = new MessageEvent("message", { data: messageData });
    this._dispatchEvent("message", event);
  }

  /**
   * Simulate receiving binary data (audio chunks)
   */
  receiveBinary(data: ArrayBuffer | Uint8Array): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error("Cannot receive binary: WebSocket is not open");
    }

    const buffer = data instanceof Uint8Array ? data.buffer : data;
    const event = new MessageEvent("message", { data: buffer });
    this._dispatchEvent("message", event);
  }

  /**
   * Simulate a pong response (for heartbeat tests)
   */
  sendPong(): void {
    this.receiveMessage({ type: "pong", timestamp: Date.now() });
  }

  /**
   * Simulate session.ready event
   */
  sendSessionReady(sessionId?: string): void {
    this.receiveMessage({
      type: "session.ready",
      session_id: sessionId ?? "test-session-123",
      timestamp: Date.now(),
    });
  }

  /**
   * Simulate transcript event
   */
  sendTranscript(text: string, isFinal: boolean = true): void {
    this.receiveMessage({
      type: isFinal ? "transcript.final" : "transcript.partial",
      text,
      timestamp: Date.now(),
    });
  }

  /**
   * Simulate audio chunk from TTS
   */
  sendAudioChunk(size: number = 4096, isFinal: boolean = false): void {
    const buffer = new ArrayBuffer(size);
    const view = new Uint8Array(buffer);
    // Fill with random audio-like data
    for (let i = 0; i < size; i++) {
      view[i] = Math.floor(Math.random() * 256);
    }
    this.receiveBinary(buffer);

    if (isFinal) {
      this.receiveMessage({ type: "audio.done" });
    }
  }

  /**
   * Simulate connection error
   */
  simulateError(message: string = "Connection error"): void {
    this._dispatchEvent("error", new ErrorEvent("error", { message }));
  }

  /**
   * Simulate server-initiated close
   */
  simulateServerClose(code: number = 1000, reason: string = ""): void {
    this.readyState = MockWebSocket.CLOSED;
    this._dispatchEvent(
      "close",
      new CloseEvent("close", { code, reason, wasClean: code === 1000 }),
    );
  }

  /**
   * Get all sent messages (for assertions)
   */
  getSentMessages(): Array<string | ArrayBuffer | Blob> {
    return [...this._messageLog];
  }

  /**
   * Get sent messages parsed as JSON
   */
  getSentMessagesJSON(): unknown[] {
    return this._messageLog
      .filter((msg): msg is string => typeof msg === "string")
      .map((msg) => {
        try {
          return JSON.parse(msg);
        } catch {
          return msg;
        }
      });
  }

  /**
   * Clear message log
   */
  clearMessageLog(): void {
    this._messageLog = [];
  }

  /**
   * Check if a specific message type was sent
   */
  wasSent(type: string): boolean {
    return this.getSentMessagesJSON().some(
      (msg) =>
        typeof msg === "object" &&
        msg !== null &&
        (msg as { type?: string }).type === type,
    );
  }

  // ============================================================================
  // Static Configuration
  // ============================================================================

  private static _pendingOptions: MockWebSocketOptions | null = null;
  private static _instances: MockWebSocket[] = [];

  /**
   * Configure options for the next MockWebSocket instance
   */
  static configure(options: MockWebSocketOptions): void {
    MockWebSocket._pendingOptions = options;
  }

  /**
   * Get all MockWebSocket instances created
   */
  static getInstances(): MockWebSocket[] {
    return [...MockWebSocket._instances];
  }

  /**
   * Get the most recent MockWebSocket instance
   */
  static getLastInstance(): MockWebSocket | undefined {
    return MockWebSocket._instances[MockWebSocket._instances.length - 1];
  }

  /**
   * Clear all instances (call in afterEach)
   */
  static clearInstances(): void {
    MockWebSocket._instances = [];
    MockWebSocket._pendingOptions = null;
  }

  /**
   * Install MockWebSocket globally
   */
  static install(): void {
    (global as unknown as { WebSocket: typeof MockWebSocket }).WebSocket =
      MockWebSocket;
  }
}

// Track instances
const originalConstructor = MockWebSocket.prototype.constructor;
MockWebSocket.prototype.constructor = function (
  this: MockWebSocket,
  ...args: unknown[]
) {
  const instance = originalConstructor.apply(this, args);
  (MockWebSocket as unknown as { _instances: MockWebSocket[] })._instances.push(
    instance,
  );
  return instance;
};

export default MockWebSocket;
