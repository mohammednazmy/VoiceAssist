/**
 * Tests for useRealtimeEvents hook - WebSocket connection, events, metrics
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  MockInstance,
} from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useRealtimeEvents, useAdminEventListener } from "./useRealtimeEvents";

// Mock WebSocket class for testing
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  sentMessages: string[] = [];
  url: string;

  constructor(url: string) {
    this.url = url;
    // Store reference so tests can access it
    mockWebSocketInstance = this;
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event("open"));
    }, 0);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(
      new CloseEvent("close", { code: code ?? 1000, reason, wasClean: true }),
    );
  }

  // Helper to simulate receiving a message
  simulateMessage(data: unknown) {
    this.onmessage?.(
      new MessageEvent("message", { data: JSON.stringify(data) }),
    );
  }

  // Helper to simulate an error
  simulateError() {
    this.onerror?.(new Event("error"));
  }

  // Helper to simulate unclean close (for reconnection testing)
  simulateUncleanClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close", { code: 1006, wasClean: false }));
  }
}

let mockWebSocketInstance: MockWebSocket | null = null;

// Store the original WebSocket
const originalWebSocket = global.WebSocket;

// Create a WebSocket mock spy that can be checked for calls
let mockWebSocketSpy: ReturnType<typeof vi.fn>;

function createWebSocketMock() {
  // Create a class that extends the mock and can be spied on
  const MockWebSocketClass = class extends MockWebSocket {
    constructor(url: string) {
      super(url);
    }
  };

  // Create the spy
  mockWebSocketSpy = vi.fn().mockImplementation((url: string) => {
    return new MockWebSocketClass(url);
  });

  // Add static properties to the mock
  Object.assign(mockWebSocketSpy, {
    CONNECTING: MockWebSocket.CONNECTING,
    OPEN: MockWebSocket.OPEN,
    CLOSING: MockWebSocket.CLOSING,
    CLOSED: MockWebSocket.CLOSED,
  });

  return mockWebSocketSpy as unknown as typeof WebSocket;
}

describe("useRealtimeEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockWebSocketInstance = null;

    // Mock window.location for URL building
    Object.defineProperty(window, "location", {
      value: {
        protocol: "https:",
        origin: "https://test.example.com",
      },
      writable: true,
    });

    // Create fresh WebSocket mock for each test
    global.WebSocket = createWebSocketMock();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    global.WebSocket = originalWebSocket;
    mockWebSocketInstance = null;
  });

  describe("connection", () => {
    it("should auto-connect on mount when autoConnect is true (default)", async () => {
      const { result } = renderHook(() => useRealtimeEvents());

      expect(result.current.status).toBe("connecting");

      // Advance timer to allow connection
      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      await waitFor(() => {
        expect(result.current.status).toBe("connected");
      });
    });

    it("should not auto-connect when autoConnect is false", () => {
      const { result } = renderHook(() =>
        useRealtimeEvents({ autoConnect: false }),
      );

      expect(result.current.status).toBe("disconnected");
      expect(global.WebSocket).not.toHaveBeenCalled();
    });

    it("should build correct WebSocket URL", async () => {
      renderHook(() => useRealtimeEvents());

      expect(global.WebSocket).toHaveBeenCalledWith(
        expect.stringMatching(/wss?:\/\/.*\/api\/admin\/panel\/ws/),
      );
    });
  });

  describe("disconnect", () => {
    it("should disconnect when disconnect is called", async () => {
      const { result } = renderHook(() => useRealtimeEvents());

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      await waitFor(() => {
        expect(result.current.status).toBe("connected");
      });

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.status).toBe("disconnected");
    });

    it("should cleanup on unmount", async () => {
      const { result, unmount } = renderHook(() => useRealtimeEvents());

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      await waitFor(() => {
        expect(result.current.status).toBe("connected");
      });

      unmount();

      // WebSocket should be closed
      expect(mockWebSocketInstance?.readyState).toBe(MockWebSocket.CLOSED);
    });
  });

  describe("event handling", () => {
    it("should receive and store admin events", async () => {
      const { result } = renderHook(() => useRealtimeEvents());

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const mockEvent = {
        type: "admin_event",
        payload: {
          type: "session.connected",
          timestamp: "2024-01-15T12:00:00Z",
          user_id: "user-1",
          session_id: "session-123",
        },
      };

      act(() => {
        mockWebSocketInstance?.simulateMessage(mockEvent);
      });

      await waitFor(() => {
        expect(result.current.events).toHaveLength(1);
        expect(result.current.events[0].type).toBe("session.connected");
      });
    });

    it("should call onEvent callback when event received", async () => {
      const onEvent = vi.fn();
      const { result } = renderHook(() => useRealtimeEvents({ onEvent }));

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const mockEvent = {
        type: "admin_event",
        payload: {
          type: "conversation.created",
          timestamp: "2024-01-15T12:00:00Z",
        },
      };

      act(() => {
        mockWebSocketInstance?.simulateMessage(mockEvent);
      });

      await waitFor(() => {
        expect(onEvent).toHaveBeenCalledWith(
          expect.objectContaining({ type: "conversation.created" }),
        );
      });
    });

    it("should filter events when eventFilter is provided", async () => {
      const { result } = renderHook(() =>
        useRealtimeEvents({
          eventFilter: ["session.connected", "session.disconnected"],
        }),
      );

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      // Send matching event
      act(() => {
        mockWebSocketInstance?.simulateMessage({
          type: "admin_event",
          payload: {
            type: "session.connected",
            timestamp: "2024-01-15T12:00:00Z",
          },
        });
      });

      // Send non-matching event
      act(() => {
        mockWebSocketInstance?.simulateMessage({
          type: "admin_event",
          payload: {
            type: "conversation.created",
            timestamp: "2024-01-15T12:00:00Z",
          },
        });
      });

      await waitFor(() => {
        expect(result.current.events).toHaveLength(1);
        expect(result.current.events[0].type).toBe("session.connected");
      });
    });

    it("should limit events buffer to MAX_EVENTS_BUFFER", async () => {
      const { result } = renderHook(() => useRealtimeEvents());

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      // Send more than 100 events
      for (let i = 0; i < 110; i++) {
        act(() => {
          mockWebSocketInstance?.simulateMessage({
            type: "admin_event",
            payload: {
              type: "session.connected",
              timestamp: `2024-01-15T12:${String(i).padStart(2, "0")}:00Z`,
              session_id: `session-${i}`,
            },
          });
        });
      }

      await waitFor(() => {
        expect(result.current.events.length).toBeLessThanOrEqual(100);
      });
    });

    it("should update lastEventTime when event received", async () => {
      const { result } = renderHook(() => useRealtimeEvents());

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      expect(result.current.lastEventTime).toBeNull();

      act(() => {
        mockWebSocketInstance?.simulateMessage({
          type: "admin_event",
          payload: {
            type: "session.connected",
            timestamp: "2024-01-15T12:00:00Z",
          },
        });
      });

      await waitFor(() => {
        expect(result.current.lastEventTime).toBe("2024-01-15T12:00:00Z");
      });
    });
  });

  describe("metrics handling", () => {
    it("should receive and store metrics updates", async () => {
      const { result } = renderHook(() => useRealtimeEvents());

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const mockMetrics = {
        type: "metrics_update",
        payload: {
          active_websocket_sessions: 10,
          database_pool: {
            pool_size: 20,
            checked_out: 5,
            overflow: 0,
          },
          redis_pool: {
            total_connections: 10,
            available_connections: 8,
          },
          timestamp: "2024-01-15T12:00:00Z",
        },
      };

      act(() => {
        mockWebSocketInstance?.simulateMessage(mockMetrics);
      });

      await waitFor(() => {
        expect(result.current.metrics).not.toBeNull();
        expect(result.current.metrics?.active_websocket_sessions).toBe(10);
      });
    });

    it("should call onMetrics callback when metrics received", async () => {
      const onMetrics = vi.fn();
      const { result } = renderHook(() => useRealtimeEvents({ onMetrics }));

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      act(() => {
        mockWebSocketInstance?.simulateMessage({
          type: "metrics_update",
          payload: {
            active_websocket_sessions: 5,
            database_pool: { pool_size: 10, checked_out: 2, overflow: 0 },
            redis_pool: { total_connections: 5, available_connections: 4 },
            timestamp: "2024-01-15T12:00:00Z",
          },
        });
      });

      await waitFor(() => {
        expect(onMetrics).toHaveBeenCalledWith(
          expect.objectContaining({ active_websocket_sessions: 5 }),
        );
      });
    });
  });

  describe("reconnection", () => {
    it("should attempt reconnection on unclean close", async () => {
      const onConnectionChange = vi.fn();
      renderHook(() =>
        useRealtimeEvents({ onConnectionChange, reconnectInterval: 1000 }),
      );

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      // Simulate unclean close
      act(() => {
        mockWebSocketInstance?.simulateUncleanClose();
      });

      await waitFor(() => {
        expect(onConnectionChange).toHaveBeenCalledWith("reconnecting");
      });

      // Advance past reconnect interval
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // Should attempt new connection
      expect(global.WebSocket).toHaveBeenCalledTimes(2);
    });

    it("should increment reconnectAttempts on each retry", async () => {
      const { result } = renderHook(() =>
        useRealtimeEvents({ reconnectInterval: 100 }),
      );

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      expect(result.current.reconnectAttempts).toBe(0);

      // Simulate unclean close
      act(() => {
        mockWebSocketInstance?.simulateUncleanClose();
      });

      await waitFor(() => {
        expect(result.current.reconnectAttempts).toBe(1);
      });
    });

    it("should set status to failed after max reconnect attempts", async () => {
      const onConnectionChange = vi.fn();
      const { result } = renderHook(() =>
        useRealtimeEvents({
          onConnectionChange,
          reconnectInterval: 100,
          maxReconnectAttempts: 2,
        }),
      );

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      // Simulate multiple unclean closes
      for (let i = 0; i < 3; i++) {
        act(() => {
          mockWebSocketInstance?.simulateUncleanClose();
        });

        await act(async () => {
          vi.advanceTimersByTime(100);
        });
      }

      await waitFor(() => {
        expect(result.current.status).toBe("failed");
      });
    });

    it("should reset reconnectAttempts on successful connection", async () => {
      const { result } = renderHook(() =>
        useRealtimeEvents({ reconnectInterval: 100 }),
      );

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      // Simulate unclean close
      act(() => {
        mockWebSocketInstance?.simulateUncleanClose();
      });

      await waitFor(() => {
        expect(result.current.reconnectAttempts).toBe(1);
      });

      // Advance past reconnect interval to trigger reconnection
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // New connection should reset attempts
      await waitFor(() => {
        expect(result.current.reconnectAttempts).toBe(0);
      });
    });
  });

  describe("subscribe", () => {
    it("should send subscribe message to server", async () => {
      const { result } = renderHook(() => useRealtimeEvents());

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      act(() => {
        result.current.subscribe(["session.connected", "session.disconnected"]);
      });

      expect(mockWebSocketInstance?.sentMessages).toContainEqual(
        expect.stringContaining("subscribe"),
      );
    });
  });

  describe("clearEvents", () => {
    it("should clear all events and reset lastEventTime", async () => {
      const { result } = renderHook(() => useRealtimeEvents());

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      // Add some events
      act(() => {
        mockWebSocketInstance?.simulateMessage({
          type: "admin_event",
          payload: {
            type: "session.connected",
            timestamp: "2024-01-15T12:00:00Z",
          },
        });
      });

      await waitFor(() => {
        expect(result.current.events).toHaveLength(1);
      });

      act(() => {
        result.current.clearEvents();
      });

      expect(result.current.events).toHaveLength(0);
      expect(result.current.lastEventTime).toBeNull();
    });
  });

  describe("ping/pong", () => {
    it("should send ping messages periodically", async () => {
      renderHook(() => useRealtimeEvents());

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      // Advance past ping interval (30 seconds)
      await act(async () => {
        vi.advanceTimersByTime(30000);
      });

      expect(mockWebSocketInstance?.sentMessages).toContainEqual(
        expect.stringContaining("ping"),
      );
    });

    it("should handle pong/heartbeat messages silently", async () => {
      const onEvent = vi.fn();
      renderHook(() => useRealtimeEvents({ onEvent }));

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      act(() => {
        mockWebSocketInstance?.simulateMessage({ type: "pong" });
        mockWebSocketInstance?.simulateMessage({ type: "heartbeat" });
      });

      // Should not call onEvent for heartbeat messages
      expect(onEvent).not.toHaveBeenCalled();
    });
  });

  describe("connection status callbacks", () => {
    it("should call onConnectionChange with status changes", async () => {
      const onConnectionChange = vi.fn();
      renderHook(() => useRealtimeEvents({ onConnectionChange }));

      expect(onConnectionChange).toHaveBeenCalledWith("connecting");

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      await waitFor(() => {
        expect(onConnectionChange).toHaveBeenCalledWith("connected");
      });
    });
  });
});

describe("useAdminEventListener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockWebSocketInstance = null;

    // Mock window.location for URL building
    Object.defineProperty(window, "location", {
      value: {
        protocol: "https:",
        origin: "https://test.example.com",
      },
      writable: true,
    });

    // Create fresh WebSocket mock for each test
    global.WebSocket = createWebSocketMock();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    global.WebSocket = originalWebSocket;
    mockWebSocketInstance = null;
  });

  it("should filter events for specific type", async () => {
    const callback = vi.fn();
    const { result } = renderHook(() =>
      useAdminEventListener("session.connected", callback),
    );

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    // Send matching event
    act(() => {
      mockWebSocketInstance?.simulateMessage({
        type: "admin_event",
        payload: {
          type: "session.connected",
          timestamp: "2024-01-15T12:00:00Z",
        },
      });
    });

    await waitFor(() => {
      expect(callback).toHaveBeenCalled();
      expect(result.current).toHaveLength(1);
    });
  });

  it("should accept array of event types", async () => {
    const callback = vi.fn();
    const { result } = renderHook(() =>
      useAdminEventListener(
        ["session.connected", "session.disconnected"],
        callback,
      ),
    );

    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    act(() => {
      mockWebSocketInstance?.simulateMessage({
        type: "admin_event",
        payload: {
          type: "session.connected",
          timestamp: "2024-01-15T12:00:00Z",
        },
      });
    });

    act(() => {
      mockWebSocketInstance?.simulateMessage({
        type: "admin_event",
        payload: {
          type: "session.disconnected",
          timestamp: "2024-01-15T12:01:00Z",
        },
      });
    });

    await waitFor(() => {
      expect(callback).toHaveBeenCalledTimes(2);
      expect(result.current).toHaveLength(2);
    });
  });
});
