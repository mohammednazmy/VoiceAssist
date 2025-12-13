/**
 * useChatSession Connect Prerequisites Tests
 *
 * Tests that WebSocket connection only attempts when ALL prerequisites are met:
 * - conversationId is defined
 * - auth token is present
 *
 * These tests ensure we don't spam console logs or attempt futile connections.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChatSession } from "../useChatSession";
import { useAuthStore } from "../../stores/authStore";

// Track mock state for dynamic token changes
let mockTokens: { accessToken: string } | null = { accessToken: "test-token" };

// Mock authStore with dynamic tokens
vi.mock("../../stores/authStore", () => ({
  useAuthStore: vi.fn(() => ({
    tokens: mockTokens,
  })),
}));

// Mock useAuth for apiClient
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

  constructor(url: string) {
    this.url = url;
    // Simulate async connection
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.(new Event("open"));
    }, 10);
  }

  send(_data: string) {}

  close() {
    this.readyState = WebSocket.CLOSED;
    const event = new CloseEvent("close", {
      code: 1000,
      reason: "Normal closure",
    });
    this.onclose?.(event);
  }
}

describe("useChatSession connect prerequisites", () => {
  let mockWebSocket: MockWebSocket;
  let wsConstructorSpy: ReturnType<typeof vi.fn>;
  let consoleDebugSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset token state
    mockTokens = { accessToken: "test-token" };

    // Spy on console.debug to verify skip log behavior
    consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    // Replace global WebSocket with mock
    wsConstructorSpy = vi.fn((url: string) => {
      mockWebSocket = new MockWebSocket(url);
      return mockWebSocket as unknown as WebSocket;
    }) as ReturnType<typeof vi.fn>;
    global.WebSocket = wsConstructorSpy as unknown as typeof WebSocket;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    consoleDebugSpy.mockRestore();
  });

  describe("missing conversationId", () => {
    it("should NOT connect when conversationId is undefined", async () => {
      const { result } = renderHook(() =>
        useChatSession({ conversationId: undefined }),
      );

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // WebSocket should not be constructed
      expect(wsConstructorSpy).not.toHaveBeenCalled();
      expect(result.current.connectionStatus).toBe("disconnected");
    });

    it("should log skip message once when conversationId is undefined", async () => {
      renderHook(() => useChatSession({ conversationId: undefined }));

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Should have logged the skip message
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        "[WebSocket] Skipping connect - missing conversationId or token",
        expect.objectContaining({ conversationId: undefined, hasToken: true }),
      );

      // Should only log once (deduplication)
      const skipLogCount = consoleDebugSpy.mock.calls.filter(
        (call) =>
          call[0] ===
          "[WebSocket] Skipping connect - missing conversationId or token",
      ).length;
      expect(skipLogCount).toBe(1);
    });
  });

  describe("missing token", () => {
    it("should NOT connect when token is null", async () => {
      mockTokens = null;
      vi.mocked(useAuthStore).mockReturnValue({ tokens: null });

      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // WebSocket should not be constructed
      expect(wsConstructorSpy).not.toHaveBeenCalled();
      expect(result.current.connectionStatus).toBe("disconnected");
    });

    it("should log skip message when token is missing", async () => {
      mockTokens = null;
      vi.mocked(useAuthStore).mockReturnValue({ tokens: null });

      renderHook(() => useChatSession({ conversationId: "conv-123" }));

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Should have logged the skip message with hasToken: false
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        "[WebSocket] Skipping connect - missing conversationId or token",
        expect.objectContaining({
          conversationId: "conv-123",
          hasToken: false,
        }),
      );
    });
  });

  describe("both prerequisites missing", () => {
    it("should NOT connect when both conversationId and token are missing", async () => {
      mockTokens = null;
      vi.mocked(useAuthStore).mockReturnValue({ tokens: null });

      const { result } = renderHook(() =>
        useChatSession({ conversationId: undefined }),
      );

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      expect(wsConstructorSpy).not.toHaveBeenCalled();
      expect(result.current.connectionStatus).toBe("disconnected");
    });
  });

  describe("both prerequisites present", () => {
    it("should connect when both conversationId and token are present", async () => {
      mockTokens = { accessToken: "test-token" };
      vi.mocked(useAuthStore).mockReturnValue({ tokens: mockTokens });

      const { result } = renderHook(() =>
        useChatSession({ conversationId: "conv-123" }),
      );

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // WebSocket should be constructed
      expect(wsConstructorSpy).toHaveBeenCalled();
      expect(wsConstructorSpy).toHaveBeenCalledWith(
        expect.stringContaining("conversationId=conv-123"),
      );
      expect(wsConstructorSpy).toHaveBeenCalledWith(
        expect.stringContaining("token=test-token"),
      );

      await waitFor(() => {
        expect(result.current.connectionStatus).toBe("connected");
      });
    });

    it("should NOT log skip message when prerequisites are met", async () => {
      mockTokens = { accessToken: "test-token" };
      vi.mocked(useAuthStore).mockReturnValue({ tokens: mockTokens });

      renderHook(() => useChatSession({ conversationId: "conv-123" }));

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Should NOT have logged any skip messages
      const skipLogCount = consoleDebugSpy.mock.calls.filter(
        (call) =>
          call[0] ===
          "[WebSocket] Skipping connect - missing conversationId or token",
      ).length;
      expect(skipLogCount).toBe(0);
    });
  });

  describe("skip log deduplication", () => {
    it("should only log once for same skip state across re-renders", async () => {
      const { rerender } = renderHook(
        ({ conversationId }) => useChatSession({ conversationId }),
        { initialProps: { conversationId: undefined as string | undefined } },
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });

      // Force re-renders
      rerender({ conversationId: undefined });
      await act(async () => {
        vi.advanceTimersByTime(50);
      });

      rerender({ conversationId: undefined });
      await act(async () => {
        vi.advanceTimersByTime(50);
      });

      // Should still only have ONE skip log message
      const skipLogCount = consoleDebugSpy.mock.calls.filter(
        (call) =>
          call[0] ===
          "[WebSocket] Skipping connect - missing conversationId or token",
      ).length;
      expect(skipLogCount).toBe(1);
    });

    it("should log again when skip state changes", async () => {
      // Start with undefined conversationId
      mockTokens = { accessToken: "test-token" };
      vi.mocked(useAuthStore).mockReturnValue({ tokens: mockTokens });

      const { rerender } = renderHook(
        ({ conversationId }) => useChatSession({ conversationId }),
        { initialProps: { conversationId: undefined as string | undefined } },
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });

      // First skip log (conversationId undefined, hasToken true)
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        "[WebSocket] Skipping connect - missing conversationId or token",
        expect.objectContaining({ conversationId: undefined, hasToken: true }),
      );

      // Now change to no token
      mockTokens = null;
      vi.mocked(useAuthStore).mockReturnValue({ tokens: null });

      rerender({ conversationId: undefined });
      await act(async () => {
        vi.advanceTimersByTime(50);
      });

      // Should have logged again with different state (hasToken false)
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        "[WebSocket] Skipping connect - missing conversationId or token",
        expect.objectContaining({ conversationId: undefined, hasToken: false }),
      );
    });
  });

  describe("transition from missing to present", () => {
    it("should connect when conversationId becomes defined", async () => {
      mockTokens = { accessToken: "test-token" };
      vi.mocked(useAuthStore).mockReturnValue({ tokens: mockTokens });

      const { result, rerender } = renderHook(
        ({ conversationId }) => useChatSession({ conversationId }),
        { initialProps: { conversationId: undefined as string | undefined } },
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });

      // Should be disconnected initially
      expect(result.current.connectionStatus).toBe("disconnected");
      expect(wsConstructorSpy).not.toHaveBeenCalled();

      // Now provide conversationId
      rerender({ conversationId: "conv-123" });
      await act(async () => {
        vi.advanceTimersByTime(50);
      });

      // Should now connect
      expect(wsConstructorSpy).toHaveBeenCalled();
      await waitFor(() => {
        expect(result.current.connectionStatus).toBe("connected");
      });
    });
  });
});
