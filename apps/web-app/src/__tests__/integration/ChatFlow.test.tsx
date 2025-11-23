/**
 * Chat Flow Integration Tests
 * Tests complete user flows: sending, streaming, citations, errors, reconnection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ChatPage } from "../../pages/ChatPage";
import type { WebSocketEvent, Message } from "@voiceassist/types";

// Mock authStore
vi.mock("../../stores/authStore", () => ({
  useAuthStore: vi.fn(() => ({
    tokens: { accessToken: "test-token" },
    user: { id: "user-1", email: "test@example.com" },
  })),
}));

// Mock auth hook
vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({
    apiClient: {
      createConversation: vi.fn().mockResolvedValue({
        id: "conv-123",
        title: "New Conversation",
        createdAt: Date.now(),
      }),
    },
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

  simulateMessage(data: WebSocketEvent) {
    const event = new MessageEvent("message", {
      data: JSON.stringify(data),
    });
    this.onmessage?.(event);
  }

  getSentMessages() {
    return this.messageQueue.map((msg) => JSON.parse(msg));
  }
}

describe("Chat Flow Integration", () => {
  let mockWebSocket: MockWebSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

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

  describe("complete send→stream→done cycle", () => {
    it("should send message, show streaming, and finalize", async () => {
      const user = userEvent.setup({ delay: null });

      render(
        <MemoryRouter initialEntries={["/chat/conv-123"]}>
          <Routes>
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>,
      );

      // Wait for WebSocket connection
      await act(async () => {
        vi.advanceTimersByTime(20);
      });

      await waitFor(() => {
        expect(screen.getByText(/connected/i)).toBeInTheDocument();
      });

      // Type and send message
      const textarea = screen.getByRole("textbox", { name: /message input/i });
      await user.type(textarea, "What is the treatment for hypertension?");

      const sendButton = screen.getByRole("button", { name: /send message/i });
      await user.click(sendButton);

      // User message should appear
      await waitFor(() => {
        expect(
          screen.getByText("What is the treatment for hypertension?"),
        ).toBeInTheDocument();
      });

      // Simulate streaming response
      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "delta",
          messageId: "msg-assistant-1",
          delta: "Treatment for",
        });
      });

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "delta",
          messageId: "msg-assistant-1",
          delta: " hypertension includes",
        });
      });

      // Should show streaming indicator
      await waitFor(() => {
        const dots = document.querySelectorAll(".animate-bounce");
        expect(dots.length).toBeGreaterThan(0);
      });

      // Partial content should be visible
      expect(
        screen.getByText(/treatment for hypertension includes/i),
      ).toBeInTheDocument();

      // Finalize message
      const finalMessage: Message = {
        id: "msg-assistant-1",
        role: "assistant",
        content:
          "Treatment for hypertension includes lifestyle modifications and medication.",
        timestamp: Date.now(),
        citations: [
          {
            id: "cite-1",
            source: "kb",
            reference: "doc-clinical-guidelines-2024",
            snippet: "Lifestyle modifications are first-line treatment.",
            page: 42,
          },
        ],
      };

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "message.done",
          message: finalMessage,
        });
      });

      // Streaming indicator should disappear
      await waitFor(() => {
        const dots = document.querySelectorAll(".animate-bounce");
        expect(dots.length).toBe(0);
      });

      // Final message should be visible
      expect(
        screen.getByText(
          /treatment for hypertension includes lifestyle modifications/i,
        ),
      ).toBeInTheDocument();
    });
  });

  describe("citation display", () => {
    it("should display citations in assistant message", async () => {
      render(
        <MemoryRouter initialEntries={["/chat/conv-123"]}>
          <Routes>
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await act(async () => {
        vi.advanceTimersByTime(20);
      });

      const finalMessage: Message = {
        id: "msg-1",
        role: "assistant",
        content: "Based on clinical guidelines...",
        timestamp: Date.now(),
        citations: [
          {
            id: "cite-1",
            source: "kb",
            reference: "doc-123",
            snippet: "Relevant excerpt",
            page: 10,
          },
        ],
      };

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "message.done",
          message: finalMessage,
        });
      });

      await waitFor(() => {
        expect(screen.getByText("1 Source")).toBeInTheDocument();
      });
    });

    it("should expand citation on click", async () => {
      const user = userEvent.setup({ delay: null });

      render(
        <MemoryRouter initialEntries={["/chat/conv-123"]}>
          <Routes>
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await act(async () => {
        vi.advanceTimersByTime(20);
      });

      const finalMessage: Message = {
        id: "msg-1",
        role: "assistant",
        content: "Based on research...",
        timestamp: Date.now(),
        citations: [
          {
            id: "cite-1",
            source: "kb",
            reference: "doc-medical-protocols",
            snippet: "Treatment protocols require immediate assessment.",
            page: 42,
          },
        ],
      };

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "message.done",
          message: finalMessage,
        });
      });

      // Find citation button
      const citationButton = await screen.findByRole("button", {
        expanded: false,
      });
      await user.click(citationButton);

      // Snippet should now be visible
      await waitFor(() => {
        expect(
          screen.getByText(/treatment protocols require/i),
        ).toBeInTheDocument();
      });

      // Reference and page should be visible
      expect(screen.getByText("doc-medical-protocols")).toBeInTheDocument();
      expect(screen.getByText(/page 42/i)).toBeInTheDocument();
    });

    it("should show multiple citations", async () => {
      render(
        <MemoryRouter initialEntries={["/chat/conv-123"]}>
          <Routes>
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await act(async () => {
        vi.advanceTimersByTime(20);
      });

      const finalMessage: Message = {
        id: "msg-1",
        role: "assistant",
        content: "Multiple sources support this...",
        timestamp: Date.now(),
        citations: [
          {
            id: "cite-1",
            source: "kb",
            reference: "doc-1",
          },
          {
            id: "cite-2",
            source: "url",
            reference: "https://example.com/article",
          },
        ],
      };

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "message.done",
          message: finalMessage,
        });
      });

      await waitFor(() => {
        expect(screen.getByText("2 Sources")).toBeInTheDocument();
      });
    });
  });

  describe("error handling", () => {
    it("should display error toast on WebSocket error", async () => {
      render(
        <MemoryRouter initialEntries={["/chat/conv-123"]}>
          <Routes>
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await act(async () => {
        vi.advanceTimersByTime(20);
      });

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "error",
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Please slow down.",
          },
        });
      });

      await waitFor(() => {
        expect(
          screen.getByText(/RATE_LIMITED: Too many requests/i),
        ).toBeInTheDocument();
      });
    });

    it("should dismiss error toast on close", async () => {
      const user = userEvent.setup({ delay: null });

      render(
        <MemoryRouter initialEntries={["/chat/conv-123"]}>
          <Routes>
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await act(async () => {
        vi.advanceTimersByTime(20);
      });

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "error",
          error: {
            code: "BACKEND_ERROR",
            message: "Server error occurred",
          },
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/BACKEND_ERROR/i)).toBeInTheDocument();
      });

      const dismissButton = screen.getByRole("button", {
        name: /dismiss error/i,
      });
      await user.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByText(/BACKEND_ERROR/i)).not.toBeInTheDocument();
      });
    });

    it("should auto-dismiss transient errors after 5 seconds", async () => {
      render(
        <MemoryRouter initialEntries={["/chat/conv-123"]}>
          <Routes>
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await act(async () => {
        vi.advanceTimersByTime(20);
      });

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "error",
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests",
          },
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/RATE_LIMITED/i)).toBeInTheDocument();
      });

      // Advance by 5 seconds
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(screen.queryByText(/RATE_LIMITED/i)).not.toBeInTheDocument();
      });
    });
  });

  describe("connection status and reconnection", () => {
    it("should show connected status when WebSocket opens", async () => {
      render(
        <MemoryRouter initialEntries={["/chat/conv-123"]}>
          <Routes>
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await act(async () => {
        vi.advanceTimersByTime(20);
      });

      await waitFor(() => {
        expect(screen.getByText(/connected/i)).toBeInTheDocument();
      });
    });

    it("should show reconnecting status on disconnect", async () => {
      render(
        <MemoryRouter initialEntries={["/chat/conv-123"]}>
          <Routes>
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await act(async () => {
        vi.advanceTimersByTime(20);
      });

      await waitFor(() => {
        expect(screen.getByText(/connected/i)).toBeInTheDocument();
      });

      // Simulate disconnect
      await act(async () => {
        mockWebSocket.close();
      });

      await waitFor(() => {
        expect(screen.getByText(/reconnecting/i)).toBeInTheDocument();
      });
    });

    it("should disable input when not connected", async () => {
      render(
        <MemoryRouter initialEntries={["/chat/conv-123"]}>
          <Routes>
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>,
      );

      // Before connection opens
      const textarea = screen.getByRole("textbox", { name: /message input/i });
      expect(textarea).toBeDisabled();

      // After connection opens
      await act(async () => {
        vi.advanceTimersByTime(20);
      });

      await waitFor(() => {
        expect(textarea).not.toBeDisabled();
      });
    });

    it("should allow manual reconnect on disconnect", async () => {
      const user = userEvent.setup({ delay: null });

      render(
        <MemoryRouter initialEntries={["/chat/conv-123"]}>
          <Routes>
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await act(async () => {
        vi.advanceTimersByTime(20);
      });

      await waitFor(() => {
        expect(screen.getByText(/connected/i)).toBeInTheDocument();
      });

      // Force disconnect and prevent auto-reconnect
      await act(async () => {
        mockWebSocket.readyState = WebSocket.CLOSED;
        mockWebSocket.close();
      });

      // Clear auto-reconnect attempts
      await act(async () => {
        vi.advanceTimersByTime(100000);
      });

      // Find and click retry button
      const retryButton = await screen.findByRole("button", { name: /retry/i });
      await user.click(retryButton);

      await act(async () => {
        vi.advanceTimersByTime(20);
      });

      // Should reconnect
      await waitFor(() => {
        expect(screen.getByText(/connected/i)).toBeInTheDocument();
      });
    });
  });

  describe("conversation routing", () => {
    it("should create conversation on mount if none provided", async () => {
      const { useAuth } = await import("../../hooks/useAuth");
      const createConversation = vi.fn().mockResolvedValue({
        id: "conv-new",
        title: "New Conversation",
        createdAt: Date.now(),
      });

      (useAuth as any).mockReturnValue({
        apiClient: { createConversation },
      });

      render(
        <MemoryRouter initialEntries={["/chat"]}>
          <Routes>
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(createConversation).toHaveBeenCalledWith("New Conversation");
      });
    });

    it("should show loading state while creating conversation", async () => {
      render(
        <MemoryRouter initialEntries={["/chat"]}>
          <Routes>
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText(/creating conversation/i)).toBeInTheDocument();
    });
  });

  describe("message history scrolling", () => {
    it("should auto-scroll to bottom on new message", async () => {
      const user = userEvent.setup({ delay: null });

      render(
        <MemoryRouter initialEntries={["/chat/conv-123"]}>
          <Routes>
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>,
      );

      await act(async () => {
        vi.advanceTimersByTime(20);
      });

      // Send multiple messages
      const textarea = screen.getByRole("textbox", { name: /message input/i });

      for (let i = 0; i < 5; i++) {
        await user.clear(textarea);
        await user.type(textarea, `Message ${i + 1}`);
        await user.keyboard("{Enter}");

        await act(async () => {
          mockWebSocket.simulateMessage({
            type: "message.done",
            message: {
              id: `msg-${i}`,
              role: "assistant",
              content: `Response ${i + 1}`,
              timestamp: Date.now(),
            },
          });
        });
      }

      // Latest messages should be visible
      await waitFor(() => {
        expect(screen.getByText("Message 5")).toBeInTheDocument();
        expect(screen.getByText("Response 5")).toBeInTheDocument();
      });
    });
  });
});

// Helper for async act
function act(callback: () => Promise<void>) {
  return waitFor(callback, { timeout: 100 });
}
