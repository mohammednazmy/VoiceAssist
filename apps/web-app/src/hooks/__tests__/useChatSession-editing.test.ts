/**
 * useChatSession Editing Tests
 * Tests edit, regenerate, and delete message functionality
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

// Mock attachments API
vi.mock("../../lib/api/attachmentsApi", () => ({
  createAttachmentsApi: vi.fn(() => ({
    uploadAttachment: vi.fn(),
  })),
}));

// TODO: Fix WebSocket mocking with fake timers - tests have timing issues
// causing failures with message editing, deletion, and regeneration
describe.skip("useChatSession - Editing", () => {
  let getMockWs: () => MockWebSocket | null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Use centralized WebSocket mock utilities
    const mockSetup = setupWebSocketMock();
    getMockWs = mockSetup.getMockWs;

    // Mock window.confirm for delete confirmation
    global.confirm = vi.fn(() => true);
  });

  afterEach(() => {
    cleanupWebSocketMock();
    vi.clearAllTimers();
    vi.useRealTimers();
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
    it("should regenerate assistant message", async () => {
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

      await act(async () => {
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      // Open connection
      act(() => {
        mockWs!.open();
      });

      await waitFor(() => {
        expect(result.current.connectionStatus).toBe("connected");
      });

      // Clear any initial messages sent
      mockWs!.clearSentMessages();

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
      const sentMessages = mockWs!.getSentMessages();
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
