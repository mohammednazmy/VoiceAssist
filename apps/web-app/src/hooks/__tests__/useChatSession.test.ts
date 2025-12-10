/**
 * useChatSession Hook Unit Tests
 * Tests WebSocket connection, messaging, streaming, and error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChatSession } from "../useChatSession";
import type { Message } from "@voiceassist/types";
import {
  setupWebSocketMock,
  cleanupWebSocketMock,
  flushMicrotasks,
  type MockWebSocket,
} from "./utils/websocket-test-utils";

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

describe("useChatSession", () => {
  let getMockWs: () => MockWebSocket | null;
  let getConstructorSpy: () => ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Use centralized WebSocket mock utilities
    const mockSetup = setupWebSocketMock();
    getMockWs = mockSetup.getMockWs;
    getConstructorSpy = mockSetup.getConstructorSpy;
  });

  afterEach(() => {
    cleanupWebSocketMock();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe("connection lifecycle", () => {
    it("should connect on mount", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      // Wait for hook to initialize and trigger WebSocket creation
      await act(async () => {
        await flushMicrotasks();
      });

      // Manually trigger WebSocket open event
      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      act(() => {
        mockWs!.open();
      });

      await waitFor(() => {
        expect(result.current.connectionStatus).toBe("connected");
      });
    });

    it("should include conversationId and token in WebSocket URL", async () => {
      renderHook(() => useChatSession({ conversationId: "conv-123" }));

      await act(async () => {
        await flushMicrotasks();
      });

      const constructorSpy = getConstructorSpy();
      expect(constructorSpy).toHaveBeenCalled();
      expect(constructorSpy).toHaveBeenCalledWith(
        expect.stringContaining("conversationId=conv-123"),
      );
      expect(constructorSpy).toHaveBeenCalledWith(
        expect.stringContaining("token=test-token"),
      );
    });

    it("should disconnect on unmount", async () => {
      const { unmount } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await act(async () => {
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open the connection first
      act(() => {
        mockWs!.open();
      });

      await waitFor(() => {
        expect(mockWs!.readyState).toBe(WebSocket.OPEN);
      });

      const closeSpy = vi.spyOn(mockWs!, "close");

      act(() => {
        unmount();
      });

      expect(closeSpy).toHaveBeenCalled();
    });

    it("should call onConnectionChange callback", async () => {
      const onConnectionChange = vi.fn();

      renderHook(() =>
        useChatSession({
          conversationId: "conv-123",
          onConnectionChange,
        }),
      );

      await act(async () => {
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      act(() => {
        mockWs!.open();
      });

      await waitFor(() => {
        expect(onConnectionChange).toHaveBeenCalledWith("connected");
      });
    });
  });

  describe("heartbeat mechanism", () => {
    it("should send ping every 30 seconds", async () => {
      renderHook(() => useChatSession({ conversationId: "conv-123" }));

      await act(async () => {
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection to start heartbeat
      act(() => {
        mockWs!.open();
      });

      // Clear initial messages
      mockWs!.clearSentMessages();

      // Advance by 30 seconds
      await act(async () => {
        vi.advanceTimersByTime(30000);
      });

      const messages = mockWs!.getSentMessages();
      expect(messages).toContainEqual({ type: "ping" });
    });

    it("should stop heartbeat on disconnect", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await act(async () => {
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection to start heartbeat
      act(() => {
        mockWs!.open();
      });

      act(() => {
        result.current.disconnect();
      });

      // Clear sent messages
      mockWs!.clearSentMessages();

      // Advance by 30 seconds
      await act(async () => {
        vi.advanceTimersByTime(30000);
      });

      const messages = mockWs!.getSentMessages();
      expect(messages).not.toContainEqual({ type: "ping" });
    });
  });

  describe("sending messages", () => {
    it("should send user message", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await act(async () => {
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection
      act(() => {
        mockWs!.open();
      });

      // Clear initial messages
      mockWs!.clearSentMessages();

      act(() => {
        result.current.sendMessage("Hello world");
      });

      const messages = mockWs!.getSentMessages();
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
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection
      act(() => {
        mockWs!.open();
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
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection
      act(() => {
        mockWs!.open();
      });

      mockWs!.clearSentMessages();

      // The hook sends text content first, files are uploaded separately
      act(() => {
        result.current.sendMessage("Check this");
      });

      const messages = mockWs!.getSentMessages();
      expect(messages[0]).toMatchObject({
        type: "message",
        content: "Check this",
      });
    });

    it("should not send when not connected", async () => {
      const onError = vi.fn();
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123", onError }),
      );

      await act(async () => {
        await flushMicrotasks();
      });

      // Don't open the connection - try to send while still in CONNECTING state

      act(() => {
        result.current.sendMessage("Hello world");
      });

      expect(onError).toHaveBeenCalledWith(
        "CONNECTION_DROPPED",
        expect.any(String),
      );
    });
  });

  describe("receiving delta events", () => {
    it("should handle delta event and update streaming message", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await act(async () => {
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection
      act(() => {
        mockWs!.open();
      });

      act(() => {
        mockWs!.simulateMessage({
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
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection
      act(() => {
        mockWs!.open();
      });

      act(() => {
        mockWs!.simulateMessage({
          type: "delta",
          messageId: "msg-1",
          delta: "Hello",
        });
      });

      act(() => {
        mockWs!.simulateMessage({
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
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection
      act(() => {
        mockWs!.open();
      });

      act(() => {
        mockWs!.simulateMessage({
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
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection
      act(() => {
        mockWs!.open();
      });

      // Start streaming
      act(() => {
        mockWs!.simulateMessage({
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
        mockWs!.simulateMessage({
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
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection
      act(() => {
        mockWs!.open();
      });

      act(() => {
        mockWs!.simulateMessage({
          type: "delta",
          messageId: "msg-1",
          delta: "Test",
        });
      });

      await waitFor(() => {
        expect(result.current.isTyping).toBe(true);
      });

      act(() => {
        mockWs!.simulateMessage({
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
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection
      act(() => {
        mockWs!.open();
      });

      act(() => {
        mockWs!.simulateMessage({
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
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection
      act(() => {
        mockWs!.open();
      });

      const closeSpy = vi.spyOn(mockWs!, "close");

      act(() => {
        mockWs!.simulateMessage({
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
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection
      act(() => {
        mockWs!.open();
      });

      const closeSpy = vi.spyOn(mockWs!, "close");

      act(() => {
        mockWs!.simulateMessage({
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
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection
      act(() => {
        mockWs!.open();
      });

      const constructorSpy = getConstructorSpy();
      const initialCallCount = constructorSpy.mock.calls.length;

      // Simulate abnormal disconnect (code != 1000/1001 triggers reconnection)
      act(() => {
        mockWs!.readyState = WebSocket.CLOSED;
        mockWs!.onclose?.(
          new CloseEvent("close", { code: 1006, reason: "Connection lost" }),
        );
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
        await flushMicrotasks();
      });

      let mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection
      act(() => {
        mockWs!.open();
      });

      const constructorSpy = getConstructorSpy();

      // First disconnect - 1s delay (abnormal close)
      act(() => {
        mockWs!.readyState = WebSocket.CLOSED;
        mockWs!.onclose?.(
          new CloseEvent("close", { code: 1006, reason: "Connection lost" }),
        );
      });

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      const firstReconnectCount = constructorSpy.mock.calls.length;

      // Open the new connection
      mockWs = getMockWs();
      act(() => {
        mockWs!.open();
      });

      // Second disconnect - 2s delay
      act(() => {
        mockWs!.readyState = WebSocket.CLOSED;
        mockWs!.onclose?.(
          new CloseEvent("close", { code: 1006, reason: "Connection lost" }),
        );
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
        await flushMicrotasks();
      });

      let mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection
      act(() => {
        mockWs!.open();
      });

      // Trigger 5 disconnect/reconnect cycles with abnormal closes
      for (let i = 0; i < 5; i++) {
        mockWs = getMockWs();
        act(() => {
          mockWs!.readyState = WebSocket.CLOSED;
          mockWs!.onclose?.(
            new CloseEvent("close", { code: 1006, reason: "Connection lost" }),
          );
        });

        await act(async () => {
          const delay = 1000 * Math.pow(2, i);
          vi.advanceTimersByTime(delay + 20);
        });

        // Open new connection for next iteration
        mockWs = getMockWs();
        if (mockWs) {
          act(() => {
            mockWs!.open();
          });
        }
      }

      // 6th disconnect should report max attempts reached
      mockWs = getMockWs();
      if (mockWs) {
        act(() => {
          mockWs!.readyState = WebSocket.CLOSED;
          mockWs!.onclose?.(
            new CloseEvent("close", { code: 1006, reason: "Connection lost" }),
          );
        });
      }

      await act(async () => {
        vi.advanceTimersByTime(32000); // Max delay
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(
          "CONNECTION_DROPPED",
          expect.stringContaining("closed abnormally"),
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
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection
      act(() => {
        mockWs!.open();
      });

      const constructorSpy = getConstructorSpy();
      const initialCallCount = constructorSpy.mock.calls.length;

      act(() => {
        result.current.reconnect();
      });

      await act(async () => {
        await flushMicrotasks();
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
        await flushMicrotasks();
      });

      let mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection
      act(() => {
        mockWs!.open();
      });

      // Trigger some auto-reconnects with abnormal closes
      for (let i = 0; i < 3; i++) {
        mockWs = getMockWs();
        act(() => {
          mockWs!.readyState = WebSocket.CLOSED;
          mockWs!.onclose?.(
            new CloseEvent("close", { code: 1006, reason: "Connection lost" }),
          );
        });

        await act(async () => {
          const delay = 1000 * Math.pow(2, i);
          vi.advanceTimersByTime(delay + 20);
        });

        // Open new connection
        mockWs = getMockWs();
        if (mockWs) {
          act(() => {
            mockWs!.open();
          });
        }
      }

      // Manual reconnect should reset attempts
      act(() => {
        result.current.reconnect();
      });

      await act(async () => {
        await flushMicrotasks();
      });

      // Open the manually reconnected socket
      mockWs = getMockWs();
      if (mockWs) {
        act(() => {
          mockWs!.open();
        });
      }

      // Next auto-reconnect should use initial delay
      mockWs = getMockWs();
      if (mockWs) {
        act(() => {
          mockWs!.readyState = WebSocket.CLOSED;
          mockWs!.onclose?.(
            new CloseEvent("close", { code: 1006, reason: "Connection lost" }),
          );
        });
      }

      const constructorSpy = getConstructorSpy();
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
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection
      act(() => {
        mockWs!.open();
      });

      // User sends message
      act(() => {
        result.current.sendMessage("User message 1");
      });

      // Assistant responds
      act(() => {
        mockWs!.simulateMessage({
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
