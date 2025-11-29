/**
 * WebSocket Test Utilities
 *
 * Provides synchronous control over WebSocket mock state for reliable testing.
 * Avoids race conditions between fake timers, React effect scheduling, and
 * Zustand async state updates.
 *
 * Usage:
 * 1. Call setupWebSocketMock() in beforeEach
 * 2. Use mockWs.open() to trigger connection (synchronous)
 * 3. Use mockWs.simulateMessage() to send events
 * 4. Call cleanupWebSocketMock() in afterEach
 */

import { vi } from "vitest";
import type { WebSocketEvent, Message } from "@voiceassist/types";

export interface MockWebSocket {
  url: string;
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  send: (data: string) => void;
  close: () => void;

  // Test helpers
  open: () => void;
  simulateMessage: (data: WebSocketEvent) => void;
  simulateError: () => void;
  getSentMessages: () => unknown[];
  clearSentMessages: () => void;
}

let currentMockWs: MockWebSocket | null = null;
let wsConstructorSpy: ReturnType<typeof vi.fn> | null = null;

/**
 * Creates a controllable WebSocket mock.
 * Connection is NOT opened automatically - call mockWs.open() to trigger onopen.
 */
export function createMockWebSocket(url: string): MockWebSocket {
  const messageQueue: string[] = [];

  const mockWs: MockWebSocket = {
    url,
    readyState: WebSocket.CONNECTING,
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,

    send(data: string) {
      if (this.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket is not open");
      }
      messageQueue.push(data);
    },

    close() {
      this.readyState = WebSocket.CLOSED;
      this.onclose?.(
        new CloseEvent("close", {
          code: 1000,
          reason: "Normal closure",
          wasClean: true,
        }),
      );
    },

    // Test helpers - allow synchronous control
    open() {
      this.readyState = WebSocket.OPEN;
      this.onopen?.(new Event("open"));
    },

    simulateMessage(data: WebSocketEvent) {
      this.onmessage?.(
        new MessageEvent("message", {
          data: JSON.stringify(data),
        }),
      );
    },

    simulateError() {
      this.onerror?.(new Event("error"));
    },

    getSentMessages() {
      return messageQueue.map((msg) => JSON.parse(msg));
    },

    clearSentMessages() {
      messageQueue.length = 0;
    },
  };

  return mockWs;
}

/**
 * Sets up the global WebSocket mock.
 * Returns the mock instance for direct control.
 */
export function setupWebSocketMock(): {
  getMockWs: () => MockWebSocket | null;
  getConstructorSpy: () => ReturnType<typeof vi.fn>;
} {
  wsConstructorSpy = vi.fn((url: string) => {
    currentMockWs = createMockWebSocket(url);
    return currentMockWs as unknown as WebSocket;
  });

  global.WebSocket = wsConstructorSpy as unknown as typeof WebSocket;

  // Add WebSocket constants if not present
  if (
    typeof (global.WebSocket as unknown as Record<string, number>)
      .CONNECTING === "undefined"
  ) {
    Object.assign(global.WebSocket, {
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3,
    });
  }

  return {
    getMockWs: () => currentMockWs,
    getConstructorSpy: () => wsConstructorSpy!,
  };
}

/**
 * Cleans up the WebSocket mock.
 */
export function cleanupWebSocketMock(): void {
  if (currentMockWs) {
    currentMockWs.readyState = WebSocket.CLOSED;
    currentMockWs = null;
  }
  wsConstructorSpy = null;
}

/**
 * Helper to wait for React state updates to settle.
 * Uses microtask queue to allow React to process pending updates.
 */
export async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => queueMicrotask(resolve));
  await new Promise((resolve) => queueMicrotask(resolve));
}

/**
 * Helper to wait for a condition with timeout.
 * More reliable than waitFor for synchronous mock scenarios.
 */
export async function waitForCondition(
  condition: () => boolean,
  options: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const { timeout = 1000, interval = 10 } = options;
  const start = Date.now();

  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error(`Condition not met within ${timeout}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
    await flushMicrotasks();
  }
}

/**
 * Creates a standard message.done event with optional citations.
 */
export function createMessageDoneEvent(
  messageId: string,
  content: string,
  options: {
    citations?: Message["citations"];
    metadata?: Message["metadata"];
  } = {},
): WebSocketEvent {
  return {
    type: "message.done",
    message: {
      id: messageId,
      role: "assistant" as const,
      content,
      timestamp: Date.now(),
      citations: options.citations || [],
      metadata: options.metadata,
    },
  };
}

/**
 * Creates a delta streaming event.
 */
export function createDeltaEvent(
  messageId: string,
  delta: string,
): WebSocketEvent {
  return {
    type: "delta",
    messageId,
    delta,
  };
}

/**
 * Creates an error event.
 */
export function createErrorEvent(
  code: string,
  message: string,
): WebSocketEvent {
  return {
    type: "error",
    error: {
      code,
      message,
    },
  };
}
