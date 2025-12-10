/**
 * useChatSession Citation Tests
 * Tests for WebSocket citation streaming in message.done events (Phase 8)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChatSession } from "../useChatSession";
import {
  setupWebSocketMock,
  cleanupWebSocketMock,
  flushMicrotasks,
  createMessageDoneEvent,
  createDeltaEvent,
  type MockWebSocket,
} from "./utils/websocket-test-utils";

// Mock the auth store
vi.mock("../../stores/authStore", () => ({
  useAuthStore: vi.fn(() => ({
    tokens: { accessToken: "test-token" },
  })),
}));

// Mock the useAuth hook
vi.mock("../useAuth", () => ({
  useAuth: vi.fn(() => ({
    apiClient: {
      editMessage: vi.fn(),
      deleteMessage: vi.fn(),
    },
  })),
}));

// Mock the attachments API
vi.mock("../../lib/api/attachmentsApi", () => ({
  createAttachmentsApi: vi.fn(() => ({
    uploadAttachment: vi.fn(),
  })),
}));

describe("useChatSession - Phase 8 Citation Streaming", () => {
  let getMockWs: () => MockWebSocket | null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    const mockSetup = setupWebSocketMock();
    getMockWs = mockSetup.getMockWs;
  });

  afterEach(() => {
    cleanupWebSocketMock();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe("Phase 8: message.done with structured citations", () => {
    it("should parse citations from message.done event", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-1" }),
      );

      await act(async () => {
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      act(() => {
        mockWs!.open();
      });

      const citations = [
        {
          id: "cite-1",
          title: "Clinical Guidelines",
          sourceType: "journal",
          url: "https://example.com/paper1",
        },
      ];

      act(() => {
        mockWs!.simulateMessage(
          createMessageDoneEvent("msg-1", "Here is the response", {
            citations,
          }),
        );
      });

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1);
      });

      expect(result.current.messages[0].citations).toHaveLength(1);
      expect(result.current.messages[0].citations![0].id).toBe("cite-1");
      expect(result.current.messages[0].citations![0].title).toBe(
        "Clinical Guidelines",
      );
    });

    it("should handle multiple citations in single message", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-1" }),
      );

      await act(async () => {
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      act(() => {
        mockWs!.open();
      });

      const citations = [
        { id: "cite-1", title: "Source A", sourceType: "kb" },
        { id: "cite-2", title: "Source B", sourceType: "journal" },
        { id: "cite-3", title: "Source C", sourceType: "book" },
      ];

      act(() => {
        mockWs!.simulateMessage(
          createMessageDoneEvent("msg-1", "Response with multiple sources", {
            citations,
          }),
        );
      });

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1);
      });

      expect(result.current.messages[0].citations).toHaveLength(3);
      expect(result.current.messages[0].citations![0].title).toBe("Source A");
      expect(result.current.messages[0].citations![1].title).toBe("Source B");
      expect(result.current.messages[0].citations![2].title).toBe("Source C");
    });

    it("should handle empty citations array", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-1" }),
      );

      await act(async () => {
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      act(() => {
        mockWs!.open();
      });

      act(() => {
        mockWs!.simulateMessage(
          createMessageDoneEvent("msg-1", "Response without citations", {
            citations: [],
          }),
        );
      });

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1);
      });

      expect(result.current.messages[0].citations).toEqual([]);
    });

    it("should handle missing citations field", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-1" }),
      );

      await act(async () => {
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      act(() => {
        mockWs!.open();
      });

      // Send message.done without citations field at all
      act(() => {
        mockWs!.simulateMessage({
          type: "message.done",
          message: {
            id: "msg-1",
            role: "assistant",
            content: "Response with no citations field",
            timestamp: Date.now(),
            // No citations field
          },
        });
      });

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1);
      });

      // Should have empty array as default
      expect(result.current.messages[0].citations).toEqual([]);
    });
  });

  describe("Phase 8: Citation field validation", () => {
    it("should handle citations with missing optional fields", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-1" }),
      );

      await act(async () => {
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      act(() => {
        mockWs!.open();
      });

      const citations = [
        { id: "cite-1" }, // Minimal citation - only id
        { id: "cite-2", title: "With Title" }, // id + title only
      ];

      act(() => {
        mockWs!.simulateMessage(
          createMessageDoneEvent("msg-1", "Response", { citations }),
        );
      });

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1);
      });

      expect(result.current.messages[0].citations).toHaveLength(2);
      expect(result.current.messages[0].citations![0].id).toBe("cite-1");
      expect(result.current.messages[0].citations![1].id).toBe("cite-2");
      expect(result.current.messages[0].citations![1].title).toBe("With Title");
    });

    it("should handle citations with null/undefined fields", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-1" }),
      );

      await act(async () => {
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      act(() => {
        mockWs!.open();
      });

      const citations = [
        { id: "cite-1", title: null, url: undefined, sourceType: "kb" },
      ];

      act(() => {
        mockWs!.simulateMessage(
          createMessageDoneEvent("msg-1", "Response", { citations }),
        );
      });

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1);
      });

      expect(result.current.messages[0].citations).toHaveLength(1);
      expect(result.current.messages[0].citations![0].id).toBe("cite-1");
      expect(result.current.messages[0].citations![0].title).toBeNull();
    });
  });

  describe("Phase 8: Stream then finalize with citations", () => {
    it("should replace streaming message with final message including citations", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-1" }),
      );

      await act(async () => {
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      act(() => {
        mockWs!.open();
      });

      // Start streaming
      act(() => {
        mockWs!.simulateMessage(createDeltaEvent("msg-1", "Streaming..."));
      });

      await waitFor(() => {
        expect(result.current.isTyping).toBe(true);
        expect(result.current.messages).toHaveLength(1);
      });

      // Verify streaming message has no citations yet
      expect(result.current.messages[0].content).toBe("Streaming...");
      expect(result.current.messages[0].citations).toBeUndefined();

      // Now finalize with citations
      const citations = [
        { id: "cite-1", title: "Final Source", sourceType: "journal" },
      ];

      act(() => {
        mockWs!.simulateMessage(
          createMessageDoneEvent("msg-1", "Final content with sources", {
            citations,
          }),
        );
      });

      await waitFor(() => {
        expect(result.current.isTyping).toBe(false);
      });

      // Final message should have citations
      expect(result.current.messages[0].content).toBe(
        "Final content with sources",
      );
      expect(result.current.messages[0].citations).toHaveLength(1);
      expect(result.current.messages[0].citations![0].title).toBe(
        "Final Source",
      );
    });
  });

  describe("Phase 8: onMessage callback with citations", () => {
    it("should call onMessage callback with complete citation data", async () => {
      const onMessage = vi.fn();
      renderHook(() => useChatSession({ conversationId: "conv-1", onMessage }));

      await act(async () => {
        await flushMicrotasks();
      });

      const mockWs = getMockWs();
      expect(mockWs).not.toBeNull();

      act(() => {
        mockWs!.open();
      });

      const citations = [
        {
          id: "cite-1",
          title: "Important Reference",
          sourceType: "journal",
          authors: ["Smith, J."],
          year: 2024,
        },
      ];

      act(() => {
        mockWs!.simulateMessage(
          createMessageDoneEvent("msg-1", "Response with reference", {
            citations,
          }),
        );
      });

      await waitFor(() => {
        expect(onMessage).toHaveBeenCalled();
      });

      const calledWithMessage = onMessage.mock.calls[0][0];
      expect(calledWithMessage.citations).toHaveLength(1);
      expect(calledWithMessage.citations[0].title).toBe("Important Reference");
      expect(calledWithMessage.citations[0].authors).toEqual(["Smith, J."]);
      expect(calledWithMessage.citations[0].year).toBe(2024);
    });
  });

  // Basic sanity test that doesn't rely on WebSocket lifecycle
  describe("Hook initialization", () => {
    it("should initialize with provided initial messages", () => {
      const initialMessages = [
        {
          id: "msg-1",
          role: "user" as const,
          content: "Hello",
          timestamp: Date.now(),
        },
        {
          id: "msg-2",
          role: "assistant" as const,
          content: "Hi there!",
          timestamp: Date.now(),
          citations: [
            {
              id: "cite-1",
              title: "Test Source",
              sourceType: "journal",
            },
          ],
        },
      ];

      const { result } = renderHook(() =>
        useChatSession({
          conversationId: "conv-1",
          initialMessages,
        }),
      );

      // Initial messages should be set immediately (synchronous)
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].content).toBe("Hello");
      expect(result.current.messages[1].citations).toHaveLength(1);
      expect(result.current.messages[1].citations![0].title).toBe(
        "Test Source",
      );
    });

    it("should update messages when initialMessages prop changes", async () => {
      const initialMessages1 = [
        {
          id: "msg-1",
          role: "user" as const,
          content: "First",
          timestamp: Date.now(),
        },
      ];
      const initialMessages2 = [
        {
          id: "msg-2",
          role: "user" as const,
          content: "Second",
          timestamp: Date.now(),
        },
      ];

      const { result, rerender } = renderHook(
        ({ initialMessages }) =>
          useChatSession({
            conversationId: "conv-1",
            initialMessages,
          }),
        { initialProps: { initialMessages: initialMessages1 } },
      );

      expect(result.current.messages[0].content).toBe("First");

      // Change initialMessages
      rerender({ initialMessages: initialMessages2 });

      await waitFor(() => {
        expect(result.current.messages[0].content).toBe("Second");
      });
    });
  });
});
