/**
 * useChatSession Editing Tests
 * Tests edit, regenerate, and delete message functionality
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChatSession } from "../useChatSession";
import type { Message } from "@voiceassist/types";

// Mock authStore
vi.mock("../../stores/authStore", () => ({
  useAuthStore: vi.fn(() => ({
    tokens: { accessToken: "test-token" },
  })),
}));

// Mock react-router-dom
vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(() => vi.fn()),
}));

// Mock useAuth hook with apiClient
const mockEditMessage = vi.fn();
const mockDeleteMessage = vi.fn();

vi.mock("../useAuth", () => ({
  useAuth: vi.fn(() => ({
    apiClient: {
      editMessage: mockEditMessage,
      deleteMessage: mockDeleteMessage,
    },
  })),
}));

// Mock WebSocket
class MockWebSocket {
  public url: string;
  public readyState: number = WebSocket.OPEN;
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;

  private messageQueue: string[] = [];

  constructor(url: string) {
    this.url = url;
    // Immediately open
    setTimeout(() => {
      this.onopen?.(new Event("open"));
    }, 0);
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

  getSentMessages() {
    return this.messageQueue.map((msg) => JSON.parse(msg));
  }
}

describe("useChatSession - Editing", () => {
  let mockWebSocket: MockWebSocket;

  beforeEach(() => {
    vi.clearAllMocks();

    // Replace global WebSocket with mock
    mockWebSocket = new MockWebSocket("");
    global.WebSocket = vi.fn((url: string) => {
      mockWebSocket = new MockWebSocket(url);
      return mockWebSocket as unknown as WebSocket;
    }) as unknown as typeof WebSocket;

    // Mock window.confirm for delete confirmation
    global.confirm = vi.fn(() => true);
  });

  describe("editMessage", () => {
    it("should edit a message successfully", async () => {
      mockEditMessage.mockResolvedValueOnce({
        id: "msg-1",
        content: "Updated content",
        role: "user",
        timestamp: Date.now(),
      });

      const initialMessages: Message[] = [
        {
          id: "msg-1",
          role: "user",
          content: "Original content",
          timestamp: Date.now(),
        },
      ];

      const { result } = renderHook(() =>
        useChatSession({
          conversationId: "conv-123",
          initialMessages,
        }),
      );

      await act(async () => {
        await result.current.editMessage("msg-1", "Updated content");
      });

      expect(mockEditMessage).toHaveBeenCalledWith(
        "conv-123",
        "msg-1",
        "Updated content",
      );

      await waitFor(() => {
        const message = result.current.messages.find((m) => m.id === "msg-1");
        expect(message?.content).toBe("Updated content");
      });
    });

    it("should handle edit errors gracefully", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockEditMessage.mockRejectedValueOnce(new Error("Edit failed"));

      const initialMessages: Message[] = [
        {
          id: "msg-1",
          role: "user",
          content: "Original content",
          timestamp: Date.now(),
        },
      ];

      const { result } = renderHook(() =>
        useChatSession({
          conversationId: "conv-123",
          initialMessages,
        }),
      );

      await act(async () => {
        try {
          await result.current.editMessage("msg-1", "Updated content");
        } catch {
          // Error is expected to be thrown after logging
        }
      });

      // Logger adds [WebSocket] prefix
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[WebSocket]",
        "Failed to edit message:",
        expect.any(Error),
      );

      // Message should remain unchanged
      const message = result.current.messages.find((m) => m.id === "msg-1");
      expect(message?.content).toBe("Original content");

      consoleErrorSpy.mockRestore();
    });
  });

  describe("deleteMessage", () => {
    it("should delete a message successfully", async () => {
      mockDeleteMessage.mockResolvedValueOnce(undefined);

      const initialMessages: Message[] = [
        {
          id: "msg-1",
          role: "user",
          content: "Message 1",
          timestamp: Date.now(),
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "Message 2",
          timestamp: Date.now(),
        },
      ];

      const { result } = renderHook(() =>
        useChatSession({
          conversationId: "conv-123",
          initialMessages,
        }),
      );

      await act(async () => {
        await result.current.deleteMessage("msg-1");
      });

      expect(global.confirm).toHaveBeenCalledWith(
        "Are you sure you want to delete this message?",
      );
      expect(mockDeleteMessage).toHaveBeenCalledWith("conv-123", "msg-1");

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0].id).toBe("msg-2");
      });
    });

    it("should not delete if user cancels confirmation", async () => {
      (global.confirm as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

      const initialMessages: Message[] = [
        {
          id: "msg-1",
          role: "user",
          content: "Message 1",
          timestamp: Date.now(),
        },
      ];

      const { result } = renderHook(() =>
        useChatSession({
          conversationId: "conv-123",
          initialMessages,
        }),
      );

      await act(async () => {
        await result.current.deleteMessage("msg-1");
      });

      expect(mockDeleteMessage).not.toHaveBeenCalled();
      expect(result.current.messages).toHaveLength(1);
    });

    it("should handle delete errors gracefully", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockDeleteMessage.mockRejectedValueOnce(new Error("Delete failed"));

      const initialMessages: Message[] = [
        {
          id: "msg-1",
          role: "user",
          content: "Message 1",
          timestamp: Date.now(),
        },
      ];

      const { result } = renderHook(() =>
        useChatSession({
          conversationId: "conv-123",
          initialMessages,
        }),
      );

      await act(async () => {
        try {
          await result.current.deleteMessage("msg-1");
        } catch {
          // Error is expected to be thrown after logging
        }
      });

      // Logger adds [WebSocket] prefix
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[WebSocket]",
        "Failed to delete message:",
        expect.any(Error),
      );

      // Message should still exist
      expect(result.current.messages).toHaveLength(1);

      consoleErrorSpy.mockRestore();
    });
  });

  describe("regenerateMessage", () => {
    // TODO: Fix WebSocket timing issue - connection status not updating in time
    it.skip("should regenerate assistant message", async () => {
      const initialMessages: Message[] = [
        {
          id: "msg-user-1",
          role: "user",
          content: "What is the weather?",
          timestamp: Date.now() - 1000,
        },
        {
          id: "msg-assistant-1",
          role: "assistant",
          content: "Old response",
          timestamp: Date.now(),
        },
      ];

      const { result } = renderHook(() =>
        useChatSession({
          conversationId: "conv-123",
          initialMessages,
        }),
      );

      // Wait for WebSocket to connect and flush all pending updates
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      await waitFor(
        () => {
          expect(result.current.connectionStatus).toBe("connected");
        },
        { timeout: 3000 },
      );

      await act(async () => {
        await result.current.regenerateMessage("msg-assistant-1");
      });

      // Assistant message should be removed
      await waitFor(() => {
        expect(
          result.current.messages.find((m) => m.id === "msg-assistant-1"),
        ).toBeUndefined();
      });

      // User message should still exist
      expect(
        result.current.messages.find((m) => m.id === "msg-user-1"),
      ).toBeDefined();

      // WebSocket should have received the re-sent user message
      const sentMessages = mockWebSocket.getSentMessages();
      expect(sentMessages).toContainEqual(
        expect.objectContaining({
          content: "What is the weather?",
        }),
      );
    });

    it("should handle regenerate when no previous user message found", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const initialMessages: Message[] = [
        {
          id: "msg-assistant-1",
          role: "assistant",
          content: "Orphaned response",
          timestamp: Date.now(),
        },
      ];

      const { result } = renderHook(() =>
        useChatSession({
          conversationId: "conv-123",
          initialMessages,
        }),
      );

      await act(async () => {
        await result.current.regenerateMessage("msg-assistant-1");
      });

      // Logger adds [WebSocket] prefix
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[WebSocket]",
        "Cannot regenerate: invalid message",
      );

      // Message should still exist
      expect(result.current.messages).toHaveLength(1);

      consoleErrorSpy.mockRestore();
    });

    it("should handle regenerate for non-existent message", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const { result } = renderHook(() =>
        useChatSession({
          conversationId: "conv-123",
          initialMessages: [],
        }),
      );

      await act(async () => {
        await result.current.regenerateMessage("non-existent");
      });

      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });
});
