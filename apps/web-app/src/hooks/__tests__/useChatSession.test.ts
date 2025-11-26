/**
 * useChatSession Hook Unit Tests
 * Tests WebSocket connection, messaging, streaming, and error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChatSession } from "../useChatSession";
import type { WebSocketEvent, Message } from "@voiceassist/types";

// Mock authStore
vi.mock("../../stores/authStore", () => ({
  useAuthStore: vi.fn(() => ({
    tokens: { accessToken: "test-token" },
  })),
}));

// Mock useAuth hook
vi.mock("../useAuth", () => ({
  useAuth: vi.fn(() => ({
    apiClient: {
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
    },
  })),
}));

// Mock attachments API
vi.mock("../../lib/api/attachmentsApi", () => ({
  createAttachmentsApi: vi.fn(() => ({
    uploadAttachment: vi.fn(),
  })),
}));

// Mock WebSocket
class MockWebSocket {
  public url: string;
  public readyState: number = WebSocket.CONNECTING;
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;

  private messageQueue: string[] = [];

  constructor(url: string) {
    this.url = url;
    // Simulate async connection
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.(new Event("open"));
    }, 10);
  }

  send(data: string) {
    this.messageQueue.push(data);
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    const event = new CloseEvent("close", {
      code: 1000,
      reason: "Normal closure",
    });
    this.onclose?.(event);
  }

  // Test helper to simulate receiving a message
  simulateMessage(data: WebSocketEvent) {
    const event = new MessageEvent("message", {
      data: JSON.stringify(data),
    });
    this.onmessage?.(event);
  }

  // Test helper to get sent messages
  getSentMessages() {
    return this.messageQueue.map((msg) => JSON.parse(msg));
  }

  // Test helper to simulate error
  simulateError() {
    this.onerror?.(new Event("error"));
  }
}

describe("useChatSession", () => {
  let mockWebSocket: MockWebSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Replace global WebSocket with mock
    mockWebSocket = new MockWebSocket("");
    global.WebSocket = vi.fn((url: string) => {
      mockWebSocket = new MockWebSocket(url);
      return mockWebSocket as any;
    }) as any;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe("connection lifecycle", () => {
    // TODO: These tests have timing issues with fake timers + React effect scheduling.
    // The hook's useEffect depends on async state from zustand store + timing.
    // These behaviors are verified via integration tests and manual testing.
    // See KNOWN_ISSUES.md for details.
    it.skip("should connect on mount", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await waitFor(
        () => {
          expect(result.current.connectionStatus).toBe("connected");
        },
        { timeout: 500 },
      );
    });

    it.skip("should include conversationId and token in WebSocket URL", async () => {
      renderHook(() => useChatSession({ conversationId: "conv-123" }));

      await waitFor(
        () => {
          expect(global.WebSocket).toHaveBeenCalled();
        },
        { timeout: 500 },
      );

      expect(global.WebSocket).toHaveBeenCalledWith(
        expect.stringContaining("conversationId=conv-123"),
      );
      expect(global.WebSocket).toHaveBeenCalledWith(
        expect.stringContaining("token=test-token"),
      );
    });

    it.skip("should disconnect on unmount", async () => {
      const { unmount } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await waitFor(
        () => {
          expect(mockWebSocket.readyState).toBe(WebSocket.OPEN);
        },
        { timeout: 500 },
      );

      const closeSpy = vi.spyOn(mockWebSocket, "close");

      act(() => {
        unmount();
      });

      expect(closeSpy).toHaveBeenCalled();
    });

    it.skip("should call onConnectionChange callback", async () => {
      const onConnectionChange = vi.fn();

      renderHook(() =>
        useChatSession({
          conversationId: "conv-123",
          onConnectionChange,
        }),
      );

      await waitFor(
        () => {
          expect(onConnectionChange).toHaveBeenCalledWith("connected");
        },
        { timeout: 500 },
      );
    });
  });

  describe("heartbeat mechanism", () => {
    it("should send ping every 30 seconds", async () => {
      renderHook(() => useChatSession({ conversationId: "conv-123" }));

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Clear initial messages
      mockWebSocket.getSentMessages();

      // Advance by 30 seconds
      await act(async () => {
        vi.advanceTimersByTime(30000);
      });

      const messages = mockWebSocket.getSentMessages();
      expect(messages).toContainEqual({ type: "ping" });
    });

    it("should stop heartbeat on disconnect", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        result.current.disconnect();
      });

      // Clear sent messages
      mockWebSocket.getSentMessages();

      // Advance by 30 seconds
      await act(async () => {
        vi.advanceTimersByTime(30000);
      });

      const messages = mockWebSocket.getSentMessages();
      expect(messages).not.toContainEqual({ type: "ping" });
    });
  });

  describe("sending messages", () => {
    it("should send user message", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Clear initial messages
      mockWebSocket.getSentMessages();

      act(() => {
        result.current.sendMessage("Hello world");
      });

      const messages = mockWebSocket.getSentMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: "message",
        content: "Hello world",
      });
    });

    it("should add user message to messages array", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        result.current.sendMessage("Hello world");
      });

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1);
      });

      expect(result.current.messages[0]).toMatchObject({
        role: "user",
        content: "Hello world",
      });
    });

    it("should handle file attachments (uploaded asynchronously)", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      mockWebSocket.getSentMessages();

      // The hook sends text content first, files are uploaded separately
      act(() => {
        result.current.sendMessage("Check this");
      });

      const messages = mockWebSocket.getSentMessages();
      expect(messages[0]).toMatchObject({
        type: "message",
        content: "Check this",
      });
    });

    it("should not send when not connected", async () => {
      // Use real timers for this test so connection doesn't establish
      vi.useRealTimers();

      const onError = vi.fn();
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123", onError }),
      );

      // Try to send immediately before connection opens
      act(() => {
        result.current.sendMessage("Hello world");
      });

      expect(onError).toHaveBeenCalledWith(
        "CONNECTION_DROPPED",
        expect.any(String),
      );

      // Restore fake timers for other tests
      vi.useFakeTimers();
    });
  });

  describe("receiving delta events", () => {
    it("should handle delta event and update streaming message", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        mockWebSocket.simulateMessage({
          type: "delta",
          messageId: "msg-assistant-1",
          delta: "Hello",
        });
      });

      await waitFor(() => {
        expect(result.current.isTyping).toBe(true);
        expect(result.current.messages).toHaveLength(1);
      });

      expect(result.current.messages[0]).toMatchObject({
        id: "msg-assistant-1",
        role: "assistant",
        content: "Hello",
      });
    });

    it("should append multiple deltas to same message", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        mockWebSocket.simulateMessage({
          type: "delta",
          messageId: "msg-1",
          delta: "Hello",
        });
      });

      act(() => {
        mockWebSocket.simulateMessage({
          type: "delta",
          messageId: "msg-1",
          delta: " world",
        });
      });

      await waitFor(() => {
        expect(result.current.messages[0].content).toBe("Hello world");
      });
    });
  });

  describe("receiving chunk events", () => {
    it("should handle chunk event", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        mockWebSocket.simulateMessage({
          type: "chunk",
          messageId: "msg-1",
          content: "Complete chunk",
        });
      });

      await waitFor(() => {
        expect(result.current.isTyping).toBe(true);
        expect(result.current.messages).toHaveLength(1);
      });

      expect(result.current.messages[0]).toMatchObject({
        id: "msg-1",
        role: "assistant",
        content: "Complete chunk",
      });
    });
  });

  describe("receiving message.done events", () => {
    it("should finalize message on message.done", async () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123", onMessage }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Start streaming
      act(() => {
        mockWebSocket.simulateMessage({
          type: "delta",
          messageId: "msg-1",
          delta: "Hello world",
        });
      });

      // Finalize
      const finalMessage: Message = {
        id: "msg-1",
        role: "assistant",
        content: "Hello world!",
        timestamp: Date.now(),
        citations: [
          {
            id: "cite-1",
            source: "kb",
            reference: "doc-123",
          },
        ],
      };

      act(() => {
        mockWebSocket.simulateMessage({
          type: "message.done",
          message: finalMessage,
        });
      });

      await waitFor(() => {
        expect(result.current.isTyping).toBe(false);
      });

      expect(result.current.messages[0]).toMatchObject(finalMessage);
      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining(finalMessage),
      );
    });

    it("should clear streaming state after message.done", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        mockWebSocket.simulateMessage({
          type: "delta",
          messageId: "msg-1",
          delta: "Test",
        });
      });

      await waitFor(() => {
        expect(result.current.isTyping).toBe(true);
      });

      act(() => {
        mockWebSocket.simulateMessage({
          type: "message.done",
          message: {
            id: "msg-1",
            role: "assistant",
            content: "Test",
            timestamp: Date.now(),
          },
        });
      });

      await waitFor(() => {
        expect(result.current.isTyping).toBe(false);
      });
    });
  });

  describe("error handling", () => {
    it("should handle error event", async () => {
      const onError = vi.fn();
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123", onError }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        mockWebSocket.simulateMessage({
          type: "error",
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests",
          },
        });
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(
          "RATE_LIMITED",
          "Too many requests",
        );
      });

      expect(result.current.isTyping).toBe(false);
    });

    it("should close connection on fatal errors", async () => {
      const onError = vi.fn();
      renderHook(() => useChatSession({ conversationId: "conv-123", onError }));

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const closeSpy = vi.spyOn(mockWebSocket, "close");

      act(() => {
        mockWebSocket.simulateMessage({
          type: "error",
          error: {
            code: "AUTH_FAILED",
            message: "Authentication failed",
          },
        });
      });

      await waitFor(() => {
        expect(closeSpy).toHaveBeenCalled();
      });
    });

    it("should handle QUOTA_EXCEEDED as fatal error", async () => {
      renderHook(() => useChatSession({ conversationId: "conv-123" }));

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const closeSpy = vi.spyOn(mockWebSocket, "close");

      act(() => {
        mockWebSocket.simulateMessage({
          type: "error",
          error: {
            code: "QUOTA_EXCEEDED",
            message: "Quota exceeded",
          },
        });
      });

      await waitFor(() => {
        expect(closeSpy).toHaveBeenCalled();
      });
    });
  });

  describe("reconnection logic", () => {
    it("should attempt reconnection on disconnect", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const constructorSpy = vi.spyOn(global, "WebSocket");
      const initialCallCount = constructorSpy.mock.calls.length;

      // Simulate disconnect
      act(() => {
        mockWebSocket.close();
      });

      await waitFor(() => {
        expect(result.current.connectionStatus).toBe("reconnecting");
      });

      // Advance by reconnection delay (1 second for first attempt)
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(constructorSpy.mock.calls.length).toBeGreaterThan(
          initialCallCount,
        );
      });
    });

    it("should use exponential backoff for reconnection", async () => {
      renderHook(() => useChatSession({ conversationId: "conv-123" }));

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const constructorSpy = vi.spyOn(global, "WebSocket");

      // First disconnect - 1s delay
      act(() => {
        mockWebSocket.close();
      });

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      const firstReconnectCount = constructorSpy.mock.calls.length;

      // Second disconnect - 2s delay
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        mockWebSocket.close();
      });

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(constructorSpy.mock.calls.length).toBeGreaterThan(
        firstReconnectCount,
      );
    });

    it("should stop reconnecting after max attempts", async () => {
      const onError = vi.fn();
      renderHook(() => useChatSession({ conversationId: "conv-123", onError }));

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Trigger 5 disconnect/reconnect cycles
      for (let i = 0; i < 5; i++) {
        act(() => {
          mockWebSocket.close();
        });

        await act(async () => {
          const delay = 1000 * Math.pow(2, i);
          vi.advanceTimersByTime(delay + 20);
        });
      }

      // 6th disconnect should not trigger reconnection
      act(() => {
        mockWebSocket.close();
      });

      await act(async () => {
        vi.advanceTimersByTime(32000); // Max delay
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(
          "CONNECTION_DROPPED",
          "Maximum reconnection attempts reached",
        );
      });
    });
  });

  describe("manual reconnection", () => {
    it("should reconnect when reconnect() is called", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const constructorSpy = vi.spyOn(global, "WebSocket");
      const initialCallCount = constructorSpy.mock.calls.length;

      act(() => {
        result.current.reconnect();
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(constructorSpy.mock.calls.length).toBeGreaterThan(
        initialCallCount,
      );
    });

    it("should reset reconnect attempts on manual reconnect", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Trigger some auto-reconnects
      for (let i = 0; i < 3; i++) {
        act(() => {
          mockWebSocket.close();
        });

        await act(async () => {
          const delay = 1000 * Math.pow(2, i);
          vi.advanceTimersByTime(delay + 20);
        });
      }

      // Manual reconnect should reset attempts
      act(() => {
        result.current.reconnect();
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Next auto-reconnect should use initial delay
      act(() => {
        mockWebSocket.close();
      });

      const constructorSpy = vi.spyOn(global, "WebSocket");
      const callCountBefore = constructorSpy.mock.calls.length;

      await act(async () => {
        vi.advanceTimersByTime(1000); // Should reconnect with 1s delay
      });

      expect(constructorSpy.mock.calls.length).toBeGreaterThan(callCountBefore);
    });
  });

  describe("message ordering", () => {
    it("should maintain correct order of user and assistant messages", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // User sends message
      act(() => {
        result.current.sendMessage("User message 1");
      });

      // Assistant responds
      act(() => {
        mockWebSocket.simulateMessage({
          type: "message.done",
          message: {
            id: "msg-assistant-1",
            role: "assistant",
            content: "Assistant response 1",
            timestamp: Date.now(),
          },
        });
      });

      // User sends another message
      act(() => {
        result.current.sendMessage("User message 2");
      });

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(3);
      });

      expect(result.current.messages[0].role).toBe("user");
      expect(result.current.messages[1].role).toBe("assistant");
      expect(result.current.messages[2].role).toBe("user");
    });
  });
});
