/**
 * useConversations Hook Tests
 * Tests conversation management operations including export
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useConversations } from "../useConversations";
import type { VoiceAssistApiClient } from "@voiceassist/api-client";

// Mock the useAuth hook
vi.mock("../useAuth", () => ({
  useAuth: () => ({
    apiClient: mockApiClient,
  }),
}));

// Mock API client
const mockApiClient = {
  getConversations: vi.fn(),
  createConversation: vi.fn(),
  updateConversation: vi.fn(),
  archiveConversation: vi.fn(),
  unarchiveConversation: vi.fn(),
  deleteConversation: vi.fn(),
  getMessages: vi.fn(),
} as unknown as VoiceAssistApiClient;

// Mock URL and Blob APIs
global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
global.URL.revokeObjectURL = vi.fn();

describe("useConversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock getConversations to return empty array by default
    (mockApiClient.getConversations as any).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
    });
  });

  describe("export functionality", () => {
    it("should export conversation as markdown", async () => {
      const mockConversation = {
        id: "conv-1",
        userId: "user-1",
        title: "Test Conversation",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        messageCount: 2,
        archived: false,
      };

      const mockMessages = [
        {
          id: "msg-1",
          sessionId: "conv-1",
          role: "user",
          content: "Hello, how are you?",
          createdAt: "2024-01-01T00:00:00Z",
        },
        {
          id: "msg-2",
          sessionId: "conv-1",
          role: "assistant",
          content: "I am doing well, thank you!",
          createdAt: "2024-01-01T00:01:00Z",
          metadata: {
            citations: [
              {
                id: "cite-1",
                title: "Test Citation",
                reference: "Test Reference",
                snippet: "Test snippet",
                doi: "10.1234/test",
              },
            ],
          },
        },
      ];

      (mockApiClient.getConversations as any).mockResolvedValue({
        items: [mockConversation],
        total: 1,
        page: 1,
        pageSize: 100,
      });

      (mockApiClient.getMessages as any).mockResolvedValue(mockMessages);

      const { result } = renderHook(() => useConversations());

      // Wait for conversations to load
      await waitFor(() => {
        expect(result.current.conversations.length).toBe(1);
      });

      // Create a mock link element
      const mockLink = document.createElement("a");
      const createElementSpy = vi
        .spyOn(document, "createElement")
        .mockReturnValue(mockLink);
      const appendChildSpy = vi
        .spyOn(document.body, "appendChild")
        .mockImplementation(() => mockLink);
      const removeChildSpy = vi
        .spyOn(document.body, "removeChild")
        .mockImplementation(() => mockLink);
      const clickSpy = vi.spyOn(mockLink, "click").mockImplementation(() => {});

      // Export the conversation
      await act(async () => {
        await result.current.exportConversation("conv-1", "markdown");
      });

      // Verify getMessages was called
      expect(mockApiClient.getMessages).toHaveBeenCalledWith("conv-1");

      // Verify link was created and clicked
      expect(createElementSpy).toHaveBeenCalledWith("a");
      expect(appendChildSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();

      // Verify download attribute contains expected filename pattern
      expect(mockLink.download).toMatch(
        /conversation-test-conversation-\d{4}-\d{2}-\d{2}\.md/,
      );

      // Clean up spies
      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
      clickSpy.mockRestore();
    });

    it("should export conversation as text", async () => {
      const mockConversation = {
        id: "conv-1",
        userId: "user-1",
        title: "Test Conversation",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        messageCount: 1,
        archived: false,
      };

      const mockMessages = [
        {
          id: "msg-1",
          sessionId: "conv-1",
          role: "user",
          content: "Test message",
          createdAt: "2024-01-01T00:00:00Z",
        },
      ];

      (mockApiClient.getConversations as any).mockResolvedValue({
        items: [mockConversation],
        total: 1,
        page: 1,
        pageSize: 100,
      });

      (mockApiClient.getMessages as any).mockResolvedValue(mockMessages);

      const { result } = renderHook(() => useConversations());

      await waitFor(() => {
        expect(result.current.conversations.length).toBe(1);
      });

      const mockLink = document.createElement("a");
      const createElementSpy = vi
        .spyOn(document, "createElement")
        .mockReturnValue(mockLink);
      const appendChildSpy = vi
        .spyOn(document.body, "appendChild")
        .mockImplementation(() => mockLink);
      const removeChildSpy = vi
        .spyOn(document.body, "removeChild")
        .mockImplementation(() => mockLink);
      const clickSpy = vi.spyOn(mockLink, "click").mockImplementation(() => {});

      await act(async () => {
        await result.current.exportConversation("conv-1", "text");
      });

      expect(mockLink.download).toMatch(
        /conversation-test-conversation-\d{4}-\d{2}-\d{2}\.txt/,
      );

      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
      clickSpy.mockRestore();
    });

    it("should handle export error for non-existent conversation", async () => {
      (mockApiClient.getConversations as any).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 100,
      });

      const { result } = renderHook(() => useConversations());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(async () => {
        await act(async () => {
          await result.current.exportConversation("non-existent", "markdown");
        });
      }).rejects.toThrow("Conversation not found");
    });
  });

  describe("basic operations", () => {
    it("should load conversations on mount", async () => {
      const mockConversations = [
        {
          id: "conv-1",
          userId: "user-1",
          title: "Conversation 1",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          messageCount: 5,
          archived: false,
        },
      ];

      (mockApiClient.getConversations as any).mockResolvedValue({
        items: mockConversations,
        total: 1,
        page: 1,
        pageSize: 100,
      });

      const { result } = renderHook(() => useConversations());

      await waitFor(() => {
        expect(result.current.conversations.length).toBe(1);
        expect(result.current.conversations[0].title).toBe("Conversation 1");
      });
    });

    it("should prevent concurrent requests (request storm guard)", async () => {
      // Mock a slow API response
      let resolvePromise: (value: any) => void;
      (mockApiClient.getConversations as any).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePromise = resolve;
          }),
      );

      const { result } = renderHook(() => useConversations());

      // Initial call should be in progress
      expect(result.current.isLoading).toBe(true);

      // Try to reload while still loading - should be skipped
      await act(async () => {
        result.current.reload();
      });

      // Should still only have one pending call
      expect(mockApiClient.getConversations).toHaveBeenCalledTimes(1);

      // Resolve the first call
      await act(async () => {
        resolvePromise!({
          items: [],
          total: 0,
          page: 1,
          pageSize: 100,
          totalPages: 1,
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Now a new call should work
      await act(async () => {
        result.current.reload();
      });

      // Should have been called twice now (initial + reload after first completed)
      expect(mockApiClient.getConversations).toHaveBeenCalledTimes(2);
    });

    it("should filter conversations by search query", async () => {
      const mockConversations = [
        {
          id: "conv-1",
          userId: "user-1",
          title: "Medical Questions",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          messageCount: 5,
          archived: false,
        },
        {
          id: "conv-2",
          userId: "user-1",
          title: "Programming Help",
          createdAt: "2024-01-02T00:00:00Z",
          updatedAt: "2024-01-02T00:00:00Z",
          messageCount: 3,
          archived: false,
        },
      ];

      (mockApiClient.getConversations as any).mockResolvedValue({
        items: mockConversations,
        total: 2,
        page: 1,
        pageSize: 100,
      });

      const { result } = renderHook(() => useConversations());

      await waitFor(() => {
        expect(result.current.conversations.length).toBe(2);
      });

      act(() => {
        result.current.setSearchQuery("medical");
      });

      expect(result.current.conversations.length).toBe(1);
      expect(result.current.conversations[0].title).toBe("Medical Questions");
    });

    it("should filter archived conversations", async () => {
      const mockConversations = [
        {
          id: "conv-1",
          userId: "user-1",
          title: "Active Conversation",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          messageCount: 5,
          archived: false,
        },
        {
          id: "conv-2",
          userId: "user-1",
          title: "Archived Conversation",
          createdAt: "2024-01-02T00:00:00Z",
          updatedAt: "2024-01-02T00:00:00Z",
          messageCount: 3,
          archived: true,
        },
      ];

      (mockApiClient.getConversations as any).mockResolvedValue({
        items: mockConversations,
        total: 2,
        page: 1,
        pageSize: 100,
      });

      const { result } = renderHook(() => useConversations());

      await waitFor(() => {
        expect(result.current.allConversations.length).toBe(2);
      });

      // By default, should only show active conversations
      expect(result.current.conversations.length).toBe(1);
      expect(result.current.conversations[0].title).toBe("Active Conversation");

      // Toggle to show archived
      act(() => {
        result.current.setShowArchived(true);
      });

      expect(result.current.conversations.length).toBe(1);
      expect(result.current.conversations[0].title).toBe(
        "Archived Conversation",
      );
    });
  });
});
