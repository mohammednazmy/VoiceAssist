/**
 * useMessagePagination Hook Tests
 *
 * Tests for the message pagination hook including:
 * - Initial loading
 * - Loading older messages
 * - Realtime message updates
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMessagePagination } from "../useMessagePagination";
import type { Message, PaginatedResponse } from "@voiceassist/types";

// Helper to create test messages
function createMessage(
  id: string,
  timestamp: number,
  content?: string,
): Message {
  return {
    id,
    role: "user",
    content: content || `Message ${id}`,
    timestamp,
  };
}

// Helper to create paginated response
function createPaginatedResponse(
  items: Message[],
  page: number,
  pageSize: number,
  total: number,
): PaginatedResponse<Message> {
  return {
    items,
    page,
    pageSize,
    totalCount: total,
    totalPages: Math.ceil(total / pageSize),
  };
}

describe("useMessagePagination", () => {
  let mockFetchMessages: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchMessages = vi.fn();
  });

  // ===========================================================================
  // Initial Loading Tests
  // ===========================================================================
  describe("initial loading", () => {
    it("should load most recent messages on mount", async () => {
      const messages = [
        createMessage("msg-1", 1000),
        createMessage("msg-2", 2000),
        createMessage("msg-3", 3000),
      ];

      // First call gets total count
      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(messages, 1, 50, 3),
      );

      const { result } = renderHook(() =>
        useMessagePagination({
          fetchMessages: mockFetchMessages,
        }),
      );

      // Initially loading
      expect(result.current.isInitialLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isInitialLoading).toBe(false);
      });

      expect(result.current.messages).toHaveLength(3);
      expect(result.current.totalCount).toBe(3);
      expect(result.current.hasMore).toBe(false); // Only one page
    });

    it("should load last page when multiple pages exist", async () => {
      const page1Messages = [
        createMessage("msg-1", 1000),
        createMessage("msg-2", 2000),
      ];
      const page2Messages = [
        createMessage("msg-3", 3000),
        createMessage("msg-4", 4000),
      ];

      // First call to get total (returns page 1)
      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(page1Messages, 1, 2, 4),
      );
      // Second call to get last page (page 2)
      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(page2Messages, 2, 2, 4),
      );

      const { result } = renderHook(() =>
        useMessagePagination({
          fetchMessages: mockFetchMessages,
          pageSize: 2,
        }),
      );

      await waitFor(() => {
        expect(result.current.isInitialLoading).toBe(false);
      });

      // Should have loaded the last page (most recent messages)
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].id).toBe("msg-3");
      expect(result.current.messages[1].id).toBe("msg-4");
      expect(result.current.hasMore).toBe(true);
      expect(result.current.totalCount).toBe(4);
    });

    it("should handle empty conversation", async () => {
      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse([], 1, 50, 0),
      );

      const { result } = renderHook(() =>
        useMessagePagination({
          fetchMessages: mockFetchMessages,
        }),
      );

      await waitFor(() => {
        expect(result.current.isInitialLoading).toBe(false);
      });

      expect(result.current.messages).toHaveLength(0);
      expect(result.current.hasMore).toBe(false);
      expect(result.current.totalCount).toBe(0);
    });

    it("should call onInitialLoad callback", async () => {
      const messages = [createMessage("msg-1", 1000)];
      const onInitialLoad = vi.fn();

      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(messages, 1, 50, 1),
      );

      renderHook(() =>
        useMessagePagination({
          fetchMessages: mockFetchMessages,
          onInitialLoad,
        }),
      );

      await waitFor(() => {
        expect(onInitialLoad).toHaveBeenCalled();
      });

      expect(onInitialLoad).toHaveBeenCalledWith(messages);
    });

    it("should handle initial load error", async () => {
      mockFetchMessages.mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() =>
        useMessagePagination({
          fetchMessages: mockFetchMessages,
        }),
      );

      await waitFor(() => {
        expect(result.current.isInitialLoading).toBe(false);
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.error?.message).toBe("Network error");
    });

    it("should not load when disabled", async () => {
      const { result } = renderHook(() =>
        useMessagePagination({
          fetchMessages: mockFetchMessages,
          enabled: false,
        }),
      );

      // Wait a tick to ensure effect runs
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(mockFetchMessages).not.toHaveBeenCalled();
      expect(result.current.isInitialLoading).toBe(true);
    });
  });

  // ===========================================================================
  // Load More Tests
  // ===========================================================================
  describe("loadMore", () => {
    it("should load older messages", async () => {
      const page1Messages = [
        createMessage("msg-1", 1000),
        createMessage("msg-2", 2000),
      ];
      const page2Messages = [
        createMessage("msg-3", 3000),
        createMessage("msg-4", 4000),
      ];

      // Initial loads
      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(page1Messages, 1, 2, 4),
      );
      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(page2Messages, 2, 2, 4),
      );

      const { result } = renderHook(() =>
        useMessagePagination({
          fetchMessages: mockFetchMessages,
          pageSize: 2,
        }),
      );

      await waitFor(() => {
        expect(result.current.isInitialLoading).toBe(false);
      });

      // Initial state: page 2 loaded
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.hasMore).toBe(true);

      // Now load page 1 (older messages)
      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(page1Messages, 1, 2, 4),
      );

      await act(async () => {
        await result.current.loadMore();
      });

      // Should have all 4 messages, sorted by timestamp
      expect(result.current.messages).toHaveLength(4);
      expect(result.current.messages[0].id).toBe("msg-1");
      expect(result.current.messages[3].id).toBe("msg-4");
      expect(result.current.hasMore).toBe(false);
    });

    it("should not load more when already loading", async () => {
      const messages = [createMessage("msg-1", 1000)];
      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(messages, 2, 1, 3),
      );
      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(messages, 2, 1, 3),
      );

      // Slow response for loadMore
      mockFetchMessages.mockImplementationOnce(
        () =>
          new Promise((r) =>
            setTimeout(() => r(createPaginatedResponse([], 1, 1, 3)), 100),
          ),
      );

      const { result } = renderHook(() =>
        useMessagePagination({
          fetchMessages: mockFetchMessages,
          pageSize: 1,
        }),
      );

      await waitFor(() => {
        expect(result.current.isInitialLoading).toBe(false);
      });

      // Start loading
      act(() => {
        result.current.loadMore();
      });

      // Try to load again while loading
      await act(async () => {
        await result.current.loadMore();
      });

      // Should only have been called for initial + one loadMore
      expect(mockFetchMessages).toHaveBeenCalledTimes(3);
    });

    it("should not load more when no more pages", async () => {
      const messages = [createMessage("msg-1", 1000)];
      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(messages, 1, 50, 1),
      );

      const { result } = renderHook(() =>
        useMessagePagination({
          fetchMessages: mockFetchMessages,
        }),
      );

      await waitFor(() => {
        expect(result.current.isInitialLoading).toBe(false);
      });

      expect(result.current.hasMore).toBe(false);

      await act(async () => {
        await result.current.loadMore();
      });

      // Should not have made additional calls
      expect(mockFetchMessages).toHaveBeenCalledTimes(1);
    });

    it("should handle loadMore error", async () => {
      const messages = [
        createMessage("msg-3", 3000),
        createMessage("msg-4", 4000),
      ];

      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse([], 1, 2, 4),
      );
      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(messages, 2, 2, 4),
      );

      const { result } = renderHook(() =>
        useMessagePagination({
          fetchMessages: mockFetchMessages,
          pageSize: 2,
        }),
      );

      await waitFor(() => {
        expect(result.current.isInitialLoading).toBe(false);
      });

      // Make loadMore fail
      mockFetchMessages.mockRejectedValueOnce(new Error("Load failed"));

      await act(async () => {
        await result.current.loadMore();
      });

      expect(result.current.error?.message).toBe("Load failed");
      expect(result.current.isLoading).toBe(false);
      // Should still be able to retry
      expect(result.current.hasMore).toBe(true);
    });
  });

  // ===========================================================================
  // Realtime Update Tests
  // ===========================================================================
  describe("realtime updates", () => {
    it("should add new message and maintain sort order", async () => {
      const messages = [
        createMessage("msg-1", 1000),
        createMessage("msg-3", 3000),
      ];
      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(messages, 1, 50, 2),
      );

      const { result } = renderHook(() =>
        useMessagePagination({
          fetchMessages: mockFetchMessages,
        }),
      );

      await waitFor(() => {
        expect(result.current.isInitialLoading).toBe(false);
      });

      // Add message with timestamp in between
      act(() => {
        result.current.addMessage(createMessage("msg-2", 2000));
      });

      expect(result.current.messages).toHaveLength(3);
      expect(result.current.messages[0].id).toBe("msg-1");
      expect(result.current.messages[1].id).toBe("msg-2");
      expect(result.current.messages[2].id).toBe("msg-3");
      expect(result.current.totalCount).toBe(3);
    });

    it("should update existing message if ID matches", async () => {
      const messages = [createMessage("msg-1", 1000, "Original content")];
      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(messages, 1, 50, 1),
      );

      const { result } = renderHook(() =>
        useMessagePagination({
          fetchMessages: mockFetchMessages,
        }),
      );

      await waitFor(() => {
        expect(result.current.isInitialLoading).toBe(false);
      });

      // Add message with same ID
      act(() => {
        result.current.addMessage(
          createMessage("msg-1", 1000, "Updated content"),
        );
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].content).toBe("Updated content");
    });

    it("should update message by ID", async () => {
      const messages = [createMessage("msg-1", 1000, "Original")];
      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(messages, 1, 50, 1),
      );

      const { result } = renderHook(() =>
        useMessagePagination({
          fetchMessages: mockFetchMessages,
        }),
      );

      await waitFor(() => {
        expect(result.current.isInitialLoading).toBe(false);
      });

      act(() => {
        result.current.updateMessage("msg-1", { content: "Updated" });
      });

      expect(result.current.messages[0].content).toBe("Updated");
    });

    it("should remove message by ID", async () => {
      const messages = [
        createMessage("msg-1", 1000),
        createMessage("msg-2", 2000),
      ];
      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(messages, 1, 50, 2),
      );

      const { result } = renderHook(() =>
        useMessagePagination({
          fetchMessages: mockFetchMessages,
        }),
      );

      await waitFor(() => {
        expect(result.current.isInitialLoading).toBe(false);
      });

      act(() => {
        result.current.removeMessage("msg-1");
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].id).toBe("msg-2");
      expect(result.current.totalCount).toBe(1);
    });
  });

  // ===========================================================================
  // Reset Tests
  // ===========================================================================
  describe("reset", () => {
    it("should reset all state and reload", async () => {
      const messages = [createMessage("msg-1", 1000)];
      mockFetchMessages.mockResolvedValue(
        createPaginatedResponse(messages, 1, 50, 1),
      );

      const { result } = renderHook(() =>
        useMessagePagination({
          fetchMessages: mockFetchMessages,
        }),
      );

      await waitFor(() => {
        expect(result.current.isInitialLoading).toBe(false);
      });

      expect(result.current.messages).toHaveLength(1);

      act(() => {
        result.current.reset();
      });

      expect(result.current.messages).toHaveLength(0);
      expect(result.current.isInitialLoading).toBe(true);
      expect(result.current.hasMore).toBe(true);
      expect(result.current.totalCount).toBe(0);
    });
  });

  // ===========================================================================
  // Message Sorting Tests
  // ===========================================================================
  describe("message sorting", () => {
    it("should maintain chronological order after merge", async () => {
      // Simulating messages loaded out of order
      const page1Messages = [
        createMessage("msg-2", 2000),
        createMessage("msg-4", 4000),
      ];
      const page2Messages = [
        createMessage("msg-1", 1000),
        createMessage("msg-3", 3000),
      ];

      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(page1Messages, 1, 2, 4),
      );
      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(page2Messages, 2, 2, 4),
      );

      const { result } = renderHook(() =>
        useMessagePagination({
          fetchMessages: mockFetchMessages,
          pageSize: 2,
        }),
      );

      await waitFor(() => {
        expect(result.current.isInitialLoading).toBe(false);
      });

      // Load more
      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(page1Messages, 1, 2, 4),
      );

      await act(async () => {
        await result.current.loadMore();
      });

      // All messages should be sorted by timestamp
      expect(result.current.messages.map((m) => m.id)).toEqual([
        "msg-1",
        "msg-2",
        "msg-3",
        "msg-4",
      ]);
    });

    it("should not duplicate messages on merge", async () => {
      const messages = [
        createMessage("msg-1", 1000),
        createMessage("msg-2", 2000),
      ];

      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(messages, 1, 2, 4),
      );
      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(messages, 2, 2, 4), // Same messages
      );

      const { result } = renderHook(() =>
        useMessagePagination({
          fetchMessages: mockFetchMessages,
          pageSize: 2,
        }),
      );

      await waitFor(() => {
        expect(result.current.isInitialLoading).toBe(false);
      });

      // Load more with overlapping messages
      mockFetchMessages.mockResolvedValueOnce(
        createPaginatedResponse(
          [createMessage("msg-1", 1000), createMessage("msg-0", 500)],
          1,
          2,
          4,
        ),
      );

      await act(async () => {
        await result.current.loadMore();
      });

      // msg-1 should not be duplicated
      const ids = result.current.messages.map((m) => m.id);
      expect(ids.filter((id) => id === "msg-1")).toHaveLength(1);
    });
  });
});
