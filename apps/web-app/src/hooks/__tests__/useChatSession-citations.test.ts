/**
 * useChatSession Citation Tests
 * Tests for WebSocket citation streaming in message.done events (Phase 8)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChatSession } from "../useChatSession";
import type { Message, WebSocketEvent } from "@voiceassist/types";

// Mock WebSocket (same pattern as useChatSession.test.ts)
class MockWebSocket {
  public url: string;
  public readyState: number = WebSocket.CONNECTING;
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.(new Event("open"));
    }, 10);
  }

  send(data: string) {
    // Store sent messages if needed
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
}

// Mock the auth store and useAuth hook
vi.mock("../../stores/authStore", () => ({
  useAuthStore: () => ({
    tokens: {
      accessToken: "mock-token",
      refreshToken: "mock-refresh",
    },
  }),
}));

vi.mock("../useAuth", () => ({
  useAuth: () => ({
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  }),
}));

describe("useChatSession - Phase 8 Citation Streaming", () => {
  let mockWebSocket: MockWebSocket;

  beforeEach(() => {
    mockWebSocket = new MockWebSocket("ws://localhost:8000/api/realtime/ws");
    // @ts-ignore
    global.WebSocket = vi.fn(() => mockWebSocket);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Phase 8: message.done with structured citations", () => {
    it("should parse citations from message.done event", async () => {
      const { result } = renderHook(() =>
        useChatSession({
          conversationId: "conv-1",
          initialMessages: [],
        }),
      );

      await waitFor(() => {
        expect(mockWebSocket.readyState).toBe(WebSocket.OPEN);
      });

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "connected",
          client_id: "test-client",
          timestamp: new Date().toISOString(),
        } as WebSocketEvent);
      });

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "message.done",
          messageId: "msg-123",
          message: {
            id: "msg-123",
            role: "assistant",
            content: "Diabetes is a chronic metabolic disorder...",
            timestamp: 1700000000000,
            citations: [
              {
                id: "cite-1",
                sourceId: "textbook-harrison",
                sourceType: "textbook",
                title: "Harrison's Principles of Internal Medicine",
                authors: ["Kasper", "Fauci", "Hauser", "Longo"],
                publicationYear: 2018,
                doi: "10.1036/9781259644047",
                relevanceScore: 95,
                snippet:
                  "Diabetes mellitus is characterized by hyperglycemia...",
                source: "kb",
                reference: "Harrison's Principles of Internal Medicine",
              },
            ],
          },
          timestamp: new Date().toISOString(),
        } as any);
      });

      await waitFor(() => {
        const messages = result.current.messages;
        expect(messages).toHaveLength(1);

        const message = messages[0];
        expect(message.id).toBe("msg-123");
        expect(message.role).toBe("assistant");
        expect(message.citations).toBeDefined();
        expect(message.citations).toHaveLength(1);

        const citation = message.citations![0];
        expect(citation.id).toBe("cite-1");
        expect(citation.sourceType).toBe("textbook");
        expect(citation.title).toBe(
          "Harrison's Principles of Internal Medicine",
        );
        expect(citation.authors).toEqual([
          "Kasper",
          "Fauci",
          "Hauser",
          "Longo",
        ]);
        expect(citation.publicationYear).toBe(2018);
        expect(citation.doi).toBe("10.1036/9781259644047");
        expect(citation.relevanceScore).toBe(95);
        expect(citation.snippet).toBe(
          "Diabetes mellitus is characterized by hyperglycemia...",
        );
      });
    });

    it("should handle multiple citations in single message", async () => {
      const { result } = renderHook(() =>
        useChatSession({
          conversationId: "conv-1",
          initialMessages: [],
        }),
      );

      await waitFor(() =>
        expect(mockWebSocket.readyState).toBe(WebSocket.OPEN),
      );

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "connected",
          client_id: "test-client",
          timestamp: new Date().toISOString(),
        } as WebSocketEvent);
      });

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "message.done",
          messageId: "msg-124",
          message: {
            id: "msg-124",
            role: "assistant",
            content: "Treatment guidelines recommend...",
            timestamp: 1700000060000,
            citations: [
              {
                id: "cite-1",
                sourceType: "journal",
                title: "Management of Type 2 Diabetes",
                authors: ["Smith", "Johnson"],
                publicationYear: 2023,
                journal: "New England Journal of Medicine",
                doi: "10.1056/NEJMra2301806",
                pubmedId: "12345678",
                snippet: "Metformin remains first-line therapy...",
              },
              {
                id: "cite-2",
                sourceType: "guideline",
                title: "ADA Standards of Care",
                authors: ["American Diabetes Association"],
                publicationYear: 2023,
                doi: "10.2337/dc23-S001",
                snippet: "A1C target of <7%...",
              },
            ],
          },
          timestamp: new Date().toISOString(),
        } as any);
      });

      await waitFor(() => {
        const messages = result.current.messages;
        expect(messages).toHaveLength(1);
        expect(messages[0].citations).toHaveLength(2);

        const citations = messages[0].citations!;
        expect(citations[0].sourceType).toBe("journal");
        expect(citations[0].pubmedId).toBe("12345678");
        expect(citations[1].sourceType).toBe("guideline");
      });
    });

    it("should handle empty citations array", async () => {
      const { result } = renderHook(() =>
        useChatSession({
          conversationId: "conv-1",
          initialMessages: [],
        }),
      );

      await waitFor(() =>
        expect(mockWebSocket.readyState).toBe(WebSocket.OPEN),
      );

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "connected",
          client_id: "test-client",
          timestamp: new Date().toISOString(),
        } as WebSocketEvent);
      });

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "message.done",
          messageId: "msg-125",
          message: {
            id: "msg-125",
            role: "assistant",
            content: "I don't have specific information about that.",
            timestamp: 1700000120000,
            citations: [],
          },
          timestamp: new Date().toISOString(),
        } as any);
      });

      await waitFor(() => {
        const messages = result.current.messages;
        expect(messages).toHaveLength(1);
        expect(messages[0].citations).toEqual([]);
      });
    });

    it("should handle missing citations field", async () => {
      const { result } = renderHook(() =>
        useChatSession({
          conversationId: "conv-1",
          initialMessages: [],
        }),
      );

      await waitFor(() =>
        expect(mockWebSocket.readyState).toBe(WebSocket.OPEN),
      );

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "connected",
          client_id: "test-client",
          timestamp: new Date().toISOString(),
        } as WebSocketEvent);
      });

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "message.done",
          messageId: "msg-126",
          message: {
            id: "msg-126",
            role: "assistant",
            content: "Response without citations field",
            timestamp: 1700000180000,
            // No citations field at all
          },
          timestamp: new Date().toISOString(),
        } as any);
      });

      await waitFor(() => {
        const messages = result.current.messages;
        expect(messages).toHaveLength(1);
        // Citations should be undefined or empty, not crash
        expect(
          messages[0].citations === undefined ||
            messages[0].citations?.length === 0,
        ).toBe(true);
      });
    });
  });

  describe("Phase 8: Citation field validation", () => {
    it("should handle citations with missing optional fields", async () => {
      const { result } = renderHook(() =>
        useChatSession({
          conversationId: "conv-1",
          initialMessages: [],
        }),
      );

      await waitFor(() =>
        expect(mockWebSocket.readyState).toBe(WebSocket.OPEN),
      );

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "connected",
          client_id: "test-client",
          timestamp: new Date().toISOString(),
        } as WebSocketEvent);
      });

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "message.done",
          messageId: "msg-129",
          message: {
            id: "msg-129",
            role: "assistant",
            content: "Test response",
            timestamp: 1700000000000,
            citations: [
              {
                id: "cite-minimal",
                title: "Minimal Citation",
                // Missing: authors, doi, pubmedId, publicationYear, etc.
              },
            ],
          },
          timestamp: new Date().toISOString(),
        } as any);
      });

      await waitFor(() => {
        const messages = result.current.messages;
        expect(messages).toHaveLength(1);
        expect(messages[0].citations).toHaveLength(1);

        const citation = messages[0].citations![0];
        expect(citation.id).toBe("cite-minimal");
        expect(citation.title).toBe("Minimal Citation");
      });
    });

    it("should handle citations with null/undefined fields", async () => {
      const { result } = renderHook(() =>
        useChatSession({
          conversationId: "conv-1",
          initialMessages: [],
        }),
      );

      await waitFor(() =>
        expect(mockWebSocket.readyState).toBe(WebSocket.OPEN),
      );

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "connected",
          client_id: "test-client",
          timestamp: new Date().toISOString(),
        } as WebSocketEvent);
      });

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "message.done",
          messageId: "msg-130",
          message: {
            id: "msg-130",
            role: "assistant",
            content: "Test response",
            timestamp: 1700000000000,
            citations: [
              {
                id: "cite-nulls",
                title: "Citation With Nulls",
                authors: null,
                doi: null,
                pubmedId: undefined,
                snippet: null,
              },
            ],
          },
          timestamp: new Date().toISOString(),
        } as any);
      });

      await waitFor(() => {
        const messages = result.current.messages;
        expect(messages).toHaveLength(1);
        expect(messages[0].citations![0].title).toBe("Citation With Nulls");
      });
    });
  });

  describe("Phase 8: Stream then finalize with citations", () => {
    it("should replace streaming message with final message including citations", async () => {
      const { result } = renderHook(() =>
        useChatSession({
          conversationId: "conv-1",
          initialMessages: [],
        }),
      );

      await waitFor(() =>
        expect(mockWebSocket.readyState).toBe(WebSocket.OPEN),
      );

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "connected",
          client_id: "test-client",
          timestamp: new Date().toISOString(),
        } as WebSocketEvent);
      });

      // Stream chunks (no citations yet)
      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "chunk",
          messageId: "msg-streaming",
          content: "Diabetes is ",
        } as WebSocketEvent);
      });

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "chunk",
          messageId: "msg-streaming",
          content: "a metabolic disorder...",
        } as WebSocketEvent);
      });

      // Wait for streaming message
      await waitFor(() => {
        const messages = result.current.messages;
        expect(messages).toHaveLength(1);
        expect(messages[0].id).toBe("msg-streaming");
        expect(messages[0].content).toContain(
          "Diabetes is a metabolic disorder",
        );
      });

      // Finalize with citations
      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "message.done",
          messageId: "msg-streaming",
          message: {
            id: "msg-streaming",
            role: "assistant",
            content:
              "Diabetes is a metabolic disorder characterized by hyperglycemia.",
            timestamp: 1700000000000,
            citations: [
              {
                id: "cite-1",
                title: "Harrison's Principles",
                sourceType: "textbook",
                authors: ["Kasper", "Fauci"],
              },
            ],
          },
          timestamp: new Date().toISOString(),
        } as any);
      });

      await waitFor(() => {
        const messages = result.current.messages;
        expect(messages).toHaveLength(1);
        expect(messages[0].id).toBe("msg-streaming");
        expect(messages[0].citations).toHaveLength(1);
        expect(messages[0].citations![0].title).toBe("Harrison's Principles");
      });
    });
  });

  describe("Phase 8: onMessage callback with citations", () => {
    it("should call onMessage callback with complete citation data", async () => {
      const onMessageMock = vi.fn();

      const { result } = renderHook(() =>
        useChatSession({
          conversationId: "conv-1",
          initialMessages: [],
          onMessage: onMessageMock,
        }),
      );

      await waitFor(() =>
        expect(mockWebSocket.readyState).toBe(WebSocket.OPEN),
      );

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "connected",
          client_id: "test-client",
          timestamp: new Date().toISOString(),
        } as WebSocketEvent);
      });

      await act(async () => {
        mockWebSocket.simulateMessage({
          type: "message.done",
          messageId: "msg-callback",
          message: {
            id: "msg-callback",
            role: "assistant",
            content: "Test response",
            timestamp: 1700000000000,
            citations: [
              {
                id: "cite-callback",
                title: "Test Citation",
                sourceType: "journal",
                authors: ["Author 1", "Author 2"],
                doi: "10.1234/test",
              },
            ],
          },
          timestamp: new Date().toISOString(),
        } as any);
      });

      await waitFor(() => {
        expect(onMessageMock).toHaveBeenCalledTimes(1);
        const calledMessage: Message = onMessageMock.mock.calls[0][0];

        expect(calledMessage.id).toBe("msg-callback");
        expect(calledMessage.citations).toHaveLength(1);
        expect(calledMessage.citations![0].title).toBe("Test Citation");
        expect(calledMessage.citations![0].authors).toEqual([
          "Author 1",
          "Author 2",
        ]);
      });
    });
  });
});
