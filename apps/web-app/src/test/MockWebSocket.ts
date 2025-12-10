/**
 * MockWebSocket - Controllable WebSocket mock for testing
 *
 * This provides precise control over WebSocket lifecycle and events,
 * avoiding race conditions in tests that use real timers or React effects.
 */

import { vi } from "vitest";
import type { WebSocketEvent } from "@voiceassist/types";

// Track all created mock instances for test assertions
const mockInstances: MockWebSocket[] = [];

export interface MockWebSocketOptions {
  /** Auto-connect after construction (default: false for test control) */
  autoConnect?: boolean;
  /** Delay before auto-connect in ms */
  connectDelay?: number;
}

export class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  protocol: string = "";
  extensions: string = "";
  binaryType: BinaryType = "blob";
  bufferedAmount: number = 0;

  // Event handlers
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  // Spy functions for test assertions
  send = vi.fn((data: string | ArrayBuffer | Blob | ArrayBufferView) => {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new DOMException(
        "WebSocket is not in OPEN state",
        "InvalidStateError",
      );
    }
    this._sentMessages.push(data as string);
  });

  close = vi.fn((code?: number, reason?: string) => {
    if (
      this.readyState === MockWebSocket.CLOSING ||
      this.readyState === MockWebSocket.CLOSED
    ) {
      return;
    }

    this.readyState = MockWebSocket.CLOSING;
    // Simulate async close
    queueMicrotask(() => {
      this.readyState = MockWebSocket.CLOSED;
      const closeEvent = new CloseEvent("close", {
        wasClean: true,
        code: code ?? 1000,
        reason: reason ?? "",
      });
      this.onclose?.(closeEvent);
      this.dispatchEvent(closeEvent);
    });
  });

  // Internal storage for test assertions
  private _sentMessages: string[] = [];
  private _eventListeners: Map<string, Set<EventListener>> = new Map();

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    if (typeof protocols === "string") {
      this.protocol = protocols;
    } else if (Array.isArray(protocols) && protocols.length > 0) {
      this.protocol = protocols[0];
    }

    mockInstances.push(this);
  }

  // Event listener methods
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
    const listeners = this._eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach((listener) => {
        if (typeof listener === "function") {
          listener.call(this, event);
        }
      });
    }
    return true;
  }

  // =========================================================================
  // Test Control Methods
  // =========================================================================

  /**
   * Simulate successful connection open
   */
  simulateOpen(): void {
    if (this.readyState !== MockWebSocket.CONNECTING) {
      console.warn("MockWebSocket.simulateOpen called when not CONNECTING");
      return;
    }

    this.readyState = MockWebSocket.OPEN;
    const event = new Event("open");
    this.onopen?.(event);
    this.dispatchEvent(event);
  }

  /**
   * Simulate receiving a message
   */
  simulateMessage(data: WebSocketEvent | string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      console.warn("MockWebSocket.simulateMessage called when not OPEN");
      return;
    }

    const messageData = typeof data === "string" ? data : JSON.stringify(data);
    const event = new MessageEvent("message", { data: messageData });
    this.onmessage?.(event);
    this.dispatchEvent(event);
  }

  /**
   * Simulate connection error
   */
  simulateError(errorMessage?: string): void {
    const event = new Event("error");
    (event as any).message = errorMessage || "WebSocket error";
    this.onerror?.(event);
    this.dispatchEvent(event);
  }

  /**
   * Simulate server-initiated close
   */
  simulateClose(code: number = 1000, reason: string = ""): void {
    if (this.readyState === MockWebSocket.CLOSED) {
      return;
    }

    this.readyState = MockWebSocket.CLOSED;
    const event = new CloseEvent("close", {
      wasClean: code === 1000 || code === 1001,
      code,
      reason,
    });
    this.onclose?.(event);
    this.dispatchEvent(event);
  }

  /**
   * Get all messages sent through this socket
   */
  getSentMessages(): string[] {
    return [...this._sentMessages];
  }

  /**
   * Get parsed JSON from sent messages
   */
  getSentMessagesAsJson<T = unknown>(): T[] {
    return this._sentMessages.map((msg) => JSON.parse(msg) as T);
  }

  /**
   * Clear sent message history
   */
  clearSentMessages(): void {
    this._sentMessages = [];
  }

  // =========================================================================
  // Static Test Helpers
  // =========================================================================

  /**
   * Get all MockWebSocket instances created during tests
   */
  static getInstances(): MockWebSocket[] {
    return [...mockInstances];
  }

  /**
   * Get the most recently created instance
   */
  static getLatestInstance(): MockWebSocket | undefined {
    return mockInstances[mockInstances.length - 1];
  }

  /**
   * Clear all tracked instances (call in afterEach)
   */
  static clearInstances(): void {
    mockInstances.length = 0;
  }

  /**
   * Install MockWebSocket as global WebSocket
   */
  static install(): void {
    (global as any).WebSocket = MockWebSocket;
  }

  /**
   * Create and auto-connect a mock instance
   */
  static createConnected(url: string): MockWebSocket {
    const ws = new MockWebSocket(url);
    ws.simulateOpen();
    return ws;
  }
}

/**
 * Helper to wait for a mock WebSocket to be created
 */
export async function waitForWebSocket(
  timeoutMs: number = 1000,
): Promise<MockWebSocket> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const instance = MockWebSocket.getLatestInstance();
    if (instance) {
      return instance;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timeout waiting for WebSocket to be created");
}

/**
 * Helper to wait for WebSocket to reach a specific ready state
 */
export async function waitForReadyState(
  ws: MockWebSocket,
  state: number,
  timeoutMs: number = 1000,
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (ws.readyState === state) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    `Timeout waiting for readyState ${state}, current: ${ws.readyState}`,
  );
}
