/**
 * WebSocket Mock Utility for E2E Tests
 *
 * Provides utilities to mock WebSocket connections for reliable testing:
 * - Mock connection states (connected, connecting, disconnected, error)
 * - Mock message sending/receiving
 * - Simulate connection events
 */

import { Page } from "@playwright/test";

export type ConnectionState = "connected" | "connecting" | "disconnected" | "error";

export interface WebSocketMockOptions {
  initialState?: ConnectionState;
  autoConnect?: boolean;
  connectDelay?: number;
}

/**
 * Mock WebSocket class that will be injected into the page
 */
const WEBSOCKET_MOCK_SCRIPT = `
  window.__wsInstances = [];
  window.__wsMockState = {
    shouldConnect: true,
    connectDelay: 100,
    messageHandlers: [],
  };

  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = WebSocket.CONNECTING;
      this.onopen = null;
      this.onclose = null;
      this.onerror = null;
      this.onmessage = null;
      this._messageQueue = [];

      window.__wsInstances.push(this);

      if (window.__wsMockState.shouldConnect) {
        setTimeout(() => {
          this.readyState = WebSocket.OPEN;
          if (this.onopen) this.onopen({ type: 'open' });
        }, window.__wsMockState.connectDelay);
      }
    }

    send(data) {
      this._messageQueue.push(data);
      // Notify handlers
      window.__wsMockState.messageHandlers.forEach(handler => {
        try {
          handler(data);
        } catch (e) {
          console.error('Message handler error:', e);
        }
      });
    }

    close(code, reason) {
      this.readyState = WebSocket.CLOSED;
      if (this.onclose) {
        this.onclose({ type: 'close', code: code || 1000, reason: reason || '' });
      }
    }

    // Mock method to simulate receiving a message
    _receiveMessage(data) {
      if (this.onmessage) {
        this.onmessage({ type: 'message', data: JSON.stringify(data) });
      }
    }

    // Mock method to simulate error
    _triggerError(error) {
      this.readyState = WebSocket.CLOSED;
      if (this.onerror) {
        this.onerror({ type: 'error', error });
      }
    }
  }

  // Store original WebSocket
  window.__OriginalWebSocket = window.WebSocket;
`;

/**
 * Set up WebSocket mocking on the page
 */
export async function setupWebSocketMock(
  page: Page,
  options: WebSocketMockOptions = {}
): Promise<void> {
  const {
    initialState = "connected",
    autoConnect = true,
    connectDelay = 100,
  } = options;

  // Inject mock before page scripts run
  await page.addInitScript(`
    ${WEBSOCKET_MOCK_SCRIPT}

    window.__wsMockState.shouldConnect = ${autoConnect && initialState === "connected"};
    window.__wsMockState.connectDelay = ${connectDelay};

    // Replace WebSocket
    window.WebSocket = MockWebSocket;
    window.WebSocket.CONNECTING = 0;
    window.WebSocket.OPEN = 1;
    window.WebSocket.CLOSING = 2;
    window.WebSocket.CLOSED = 3;
  `);
}

/**
 * Simulate WebSocket connection
 */
export async function simulateWebSocketConnect(page: Page): Promise<void> {
  await page.evaluate(() => {
    const instances = (window as any).__wsInstances;
    instances.forEach((ws: any) => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.readyState = WebSocket.OPEN;
        if (ws.onopen) ws.onopen({ type: "open" });
      }
    });
  });
}

/**
 * Simulate WebSocket disconnection
 */
export async function simulateWebSocketDisconnect(
  page: Page,
  code: number = 1000,
  reason: string = "Normal closure"
): Promise<void> {
  await page.evaluate(
    ({ code, reason }) => {
      const instances = (window as any).__wsInstances;
      instances.forEach((ws: any) => {
        ws.readyState = WebSocket.CLOSED;
        if (ws.onclose) ws.onclose({ type: "close", code, reason });
      });
    },
    { code, reason }
  );
}

/**
 * Simulate WebSocket error
 */
export async function simulateWebSocketError(
  page: Page,
  errorMessage: string = "Connection error"
): Promise<void> {
  await page.evaluate((errorMessage) => {
    const instances = (window as any).__wsInstances;
    instances.forEach((ws: any) => {
      ws._triggerError(new Error(errorMessage));
    });
  }, errorMessage);
}

/**
 * Simulate receiving a message from the server
 */
export async function simulateWebSocketMessage(
  page: Page,
  message: Record<string, unknown>
): Promise<void> {
  await page.evaluate((message) => {
    const instances = (window as any).__wsInstances;
    instances.forEach((ws: any) => {
      ws._receiveMessage(message);
    });
  }, message);
}

/**
 * Get all messages sent through WebSocket
 */
export async function getWebSocketSentMessages(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const instances = (window as any).__wsInstances;
    const messages: string[] = [];
    instances.forEach((ws: any) => {
      messages.push(...ws._messageQueue);
    });
    return messages;
  });
}

/**
 * Get current WebSocket connection state
 */
export async function getWebSocketState(page: Page): Promise<ConnectionState> {
  const state = await page.evaluate(() => {
    const instances = (window as any).__wsInstances;
    if (instances.length === 0) return "disconnected";

    const ws = instances[instances.length - 1];
    switch (ws.readyState) {
      case 0:
        return "connecting";
      case 1:
        return "connected";
      case 2:
      case 3:
        return "disconnected";
      default:
        return "error";
    }
  });

  return state as ConnectionState;
}

/**
 * Wait for WebSocket to connect
 */
export async function waitForWebSocketConnect(
  page: Page,
  timeout: number = 5000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const state = await getWebSocketState(page);
    if (state === "connected") return;
    await page.waitForTimeout(100);
  }

  throw new Error(`WebSocket did not connect within ${timeout}ms`);
}

/**
 * Restore original WebSocket
 */
export async function restoreWebSocket(page: Page): Promise<void> {
  await page.evaluate(() => {
    if ((window as any).__OriginalWebSocket) {
      window.WebSocket = (window as any).__OriginalWebSocket;
    }
  });
}

/**
 * Mock chat response from server
 */
export async function mockChatResponse(
  page: Page,
  message: string,
  delay: number = 100
): Promise<void> {
  await page.waitForTimeout(delay);

  await simulateWebSocketMessage(page, {
    type: "message",
    role: "assistant",
    content: message,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Mock typing indicator
 */
export async function mockTypingIndicator(
  page: Page,
  isTyping: boolean
): Promise<void> {
  await simulateWebSocketMessage(page, {
    type: "typing",
    isTyping,
  });
}
