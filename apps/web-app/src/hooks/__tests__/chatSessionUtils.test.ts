/**
 * Chat Session Utils Unit Tests
 *
 * Tests for pure functions extracted from useChatSession.
 * These tests don't require WebSocket mocking since they test pure logic.
 */

import { describe, it, expect } from "vitest";
import {
  parseCitations,
  isValidCitation,
  normalizeCitations,
  isFatalError,
  isNormalClosure,
  getReconnectDelay,
  buildWebSocketUrl,
  generateMessageId,
  processWebSocketEvent,
  updateMessagesWithMessage,
  removeMessageById,
  findPreviousUserMessage,
} from "../chatSessionUtils";
import type { Message, WebSocketEvent } from "@voiceassist/types";

describe("chatSessionUtils", () => {
  // ==========================================================================
  // Citation Parsing Tests
  // ==========================================================================
  describe("parseCitations", () => {
    it("should parse citations from message.citations", () => {
      const message = {
        citations: [
          { id: "cite-1", source: "kb", reference: "doc-123" },
          { id: "cite-2", source: "pubmed", reference: "12345678" },
        ],
      };

      const result = parseCitations(message);

      expect(result.citations).toHaveLength(2);
      expect(result.citations[0].id).toBe("cite-1");
      expect(result.metadata.citations).toEqual(result.citations);
    });

    it("should parse citations from message.metadata.citations", () => {
      const message = {
        metadata: {
          citations: [{ id: "cite-1", source: "kb" }],
          otherField: "value",
        },
      };

      const result = parseCitations(message);

      expect(result.citations).toHaveLength(1);
      expect(result.metadata.otherField).toBe("value");
    });

    it("should prefer message.citations over metadata.citations", () => {
      const message = {
        citations: [{ id: "direct-cite" }],
        metadata: {
          citations: [{ id: "metadata-cite" }],
        },
      };

      const result = parseCitations(message);

      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].id).toBe("direct-cite");
    });

    it("should handle empty citations", () => {
      const result = parseCitations({});

      expect(result.citations).toEqual([]);
      expect(result.metadata.citations).toEqual([]);
    });

    it("should handle missing metadata", () => {
      const message = {
        citations: [{ id: "cite-1" }],
      };

      const result = parseCitations(message);

      expect(result.citations).toHaveLength(1);
      expect(result.metadata.citations).toEqual(result.citations);
    });
  });

  describe("isValidCitation", () => {
    it("should return true for citation with id", () => {
      expect(isValidCitation({ id: "cite-1" })).toBe(true);
    });

    it("should return true for citation with source", () => {
      expect(isValidCitation({ source: "kb" })).toBe(true);
    });

    it("should return true for citation with reference", () => {
      expect(isValidCitation({ reference: "doc-123" })).toBe(true);
    });

    it("should return false for null", () => {
      expect(isValidCitation(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isValidCitation(undefined)).toBe(false);
    });

    it("should return false for empty object", () => {
      expect(isValidCitation({})).toBe(false);
    });

    it("should return false for non-object", () => {
      expect(isValidCitation("string")).toBe(false);
      expect(isValidCitation(123)).toBe(false);
    });
  });

  describe("normalizeCitations", () => {
    it("should filter valid citations", () => {
      const citations = [
        { id: "cite-1" },
        null,
        { source: "kb" },
        {},
        { reference: "doc-123" },
      ];

      const result = normalizeCitations(citations as unknown[]);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ id: "cite-1" });
      expect(result[1]).toEqual({ source: "kb" });
      expect(result[2]).toEqual({ reference: "doc-123" });
    });

    it("should return empty array for non-array input", () => {
      expect(normalizeCitations(null as unknown as unknown[])).toEqual([]);
      expect(normalizeCitations("string" as unknown as unknown[])).toEqual([]);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================
  describe("isFatalError", () => {
    it("should return true for AUTH_FAILED", () => {
      expect(isFatalError("AUTH_FAILED")).toBe(true);
    });

    it("should return true for QUOTA_EXCEEDED", () => {
      expect(isFatalError("QUOTA_EXCEEDED")).toBe(true);
    });

    it("should return false for RATE_LIMITED", () => {
      expect(isFatalError("RATE_LIMITED")).toBe(false);
    });

    it("should return false for CONNECTION_DROPPED", () => {
      expect(isFatalError("CONNECTION_DROPPED")).toBe(false);
    });

    it("should return false for other error codes", () => {
      expect(isFatalError("UNKNOWN_ERROR" as any)).toBe(false);
    });
  });

  describe("isNormalClosure", () => {
    it("should return true for 1000 (Normal Closure)", () => {
      expect(isNormalClosure(1000)).toBe(true);
    });

    it("should return true for 1001 (Going Away)", () => {
      expect(isNormalClosure(1001)).toBe(true);
    });

    it("should return false for 1002 (Protocol Error)", () => {
      expect(isNormalClosure(1002)).toBe(false);
    });

    it("should return false for 1006 (Abnormal Closure)", () => {
      expect(isNormalClosure(1006)).toBe(false);
    });
  });

  // ==========================================================================
  // Reconnection Logic Tests
  // ==========================================================================
  describe("getReconnectDelay", () => {
    it("should return base delay for first attempt", () => {
      expect(getReconnectDelay(0)).toBe(1000);
    });

    it("should double delay for each attempt", () => {
      expect(getReconnectDelay(1)).toBe(2000);
      expect(getReconnectDelay(2)).toBe(4000);
      expect(getReconnectDelay(3)).toBe(8000);
    });

    it("should cap delay at 30 seconds", () => {
      expect(getReconnectDelay(10)).toBe(30000);
      expect(getReconnectDelay(100)).toBe(30000);
    });

    it("should accept custom base delay", () => {
      expect(getReconnectDelay(0, 500)).toBe(500);
      expect(getReconnectDelay(1, 500)).toBe(1000);
      expect(getReconnectDelay(2, 500)).toBe(2000);
    });
  });

  // ==========================================================================
  // URL Building Tests
  // ==========================================================================
  describe("buildWebSocketUrl", () => {
    it("should build URL with query parameters", () => {
      const url = buildWebSocketUrl(
        "ws://localhost:8000/ws",
        "conv-123",
        "token-abc",
      );

      expect(url).toContain("ws://localhost:8000/ws");
      expect(url).toContain("conversationId=conv-123");
      expect(url).toContain("token=token-abc");
    });

    it("should handle URL with existing query parameters", () => {
      const url = buildWebSocketUrl(
        "ws://localhost:8000/ws?existing=param",
        "conv-123",
        "token-abc",
      );

      expect(url).toContain("existing=param");
      expect(url).toContain("conversationId=conv-123");
    });

    it("should encode special characters", () => {
      const url = buildWebSocketUrl(
        "ws://localhost:8000/ws",
        "conv/123",
        "token with spaces",
      );

      expect(url).toContain("conversationId=conv%2F123");
      expect(url).toContain("token=token+with+spaces");
    });
  });

  // ==========================================================================
  // Message ID Generation Tests
  // ==========================================================================
  describe("generateMessageId", () => {
    it("should generate unique IDs", () => {
      const id1 = generateMessageId();
      const id2 = generateMessageId();

      expect(id1).not.toBe(id2);
    });

    it("should use default prefix", () => {
      const id = generateMessageId();
      expect(id).toMatch(/^msg-\d+-[a-z0-9]+$/);
    });

    it("should use custom prefix", () => {
      const id = generateMessageId("voice");
      expect(id).toMatch(/^voice-\d+-[a-z0-9]+$/);
    });
  });

  // ==========================================================================
  // WebSocket Event Processing Tests
  // ==========================================================================
  describe("processWebSocketEvent", () => {
    describe("delta events", () => {
      it("should start new streaming message", () => {
        const event: WebSocketEvent = {
          type: "delta",
          messageId: "msg-1",
          delta: "Hello",
        };

        const result = processWebSocketEvent(event, null);

        expect(result.isTyping).toBe(true);
        expect(result.streamingMessage).not.toBeNull();
        expect(result.streamingMessage?.content).toBe("Hello");
        expect(result.streamingMessage?.role).toBe("assistant");
      });

      it("should append to existing streaming message", () => {
        const existingMessage: Message = {
          id: "msg-1",
          role: "assistant",
          content: "Hello",
          timestamp: Date.now(),
        };

        const event: WebSocketEvent = {
          type: "delta",
          messageId: "msg-1",
          delta: " world",
        };

        const result = processWebSocketEvent(event, existingMessage);

        expect(result.streamingMessage?.content).toBe("Hello world");
      });

      it("should ignore empty delta", () => {
        const event: WebSocketEvent = {
          type: "delta",
          messageId: "msg-1",
          delta: "",
        };

        const result = processWebSocketEvent(event, null);

        expect(result.isTyping).toBe(false);
        expect(result.streamingMessage).toBeNull();
      });
    });

    describe("chunk events", () => {
      it("should handle chunk event", () => {
        const event: WebSocketEvent = {
          type: "chunk",
          messageId: "msg-1",
          content: "Complete chunk",
        };

        const result = processWebSocketEvent(event, null);

        expect(result.isTyping).toBe(true);
        expect(result.streamingMessage?.content).toBe("Complete chunk");
      });
    });

    describe("message.done events", () => {
      it("should finalize message with citations", () => {
        const event: WebSocketEvent = {
          type: "message.done",
          message: {
            id: "msg-1",
            role: "assistant",
            content: "Final message",
            timestamp: Date.now(),
            citations: [{ id: "cite-1", source: "kb" }],
          },
        };

        const result = processWebSocketEvent(event, null);

        expect(result.isTyping).toBe(false);
        expect(result.streamingMessage).toBeNull();
        expect(result.finalMessage).not.toBeNull();
        expect(result.finalMessage?.citations).toHaveLength(1);
      });

      it("should clear streaming state", () => {
        const existingMessage: Message = {
          id: "msg-1",
          role: "assistant",
          content: "Streaming...",
          timestamp: Date.now(),
        };

        const event: WebSocketEvent = {
          type: "message.done",
          message: {
            id: "msg-1",
            role: "assistant",
            content: "Done",
            timestamp: Date.now(),
          },
        };

        const result = processWebSocketEvent(event, existingMessage);

        expect(result.streamingMessage).toBeNull();
        expect(result.isTyping).toBe(false);
      });
    });

    describe("error events", () => {
      it("should handle non-fatal error", () => {
        const event: WebSocketEvent = {
          type: "error",
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests",
          },
        };

        const result = processWebSocketEvent(event, null);

        expect(result.error).not.toBeNull();
        expect(result.error?.code).toBe("RATE_LIMITED");
        expect(result.shouldCloseConnection).toBe(false);
      });

      it("should handle fatal error", () => {
        const event: WebSocketEvent = {
          type: "error",
          error: {
            code: "AUTH_FAILED",
            message: "Authentication failed",
          },
        };

        const result = processWebSocketEvent(event, null);

        expect(result.shouldCloseConnection).toBe(true);
      });

      it("should clear streaming state on error", () => {
        const existingMessage: Message = {
          id: "msg-1",
          role: "assistant",
          content: "Streaming...",
          timestamp: Date.now(),
        };

        const event: WebSocketEvent = {
          type: "error",
          error: {
            code: "RATE_LIMITED",
            message: "Error",
          },
        };

        const result = processWebSocketEvent(event, existingMessage);

        expect(result.streamingMessage).toBeNull();
        expect(result.isTyping).toBe(false);
      });
    });

    describe("pong events", () => {
      it("should not change state for pong", () => {
        const event: WebSocketEvent = {
          type: "pong",
        };

        const result = processWebSocketEvent(event, null);

        expect(result.isTyping).toBe(false);
        expect(result.streamingMessage).toBeNull();
        expect(result.finalMessage).toBeNull();
        expect(result.error).toBeNull();
      });
    });
  });

  // ==========================================================================
  // Message State Helper Tests
  // ==========================================================================
  describe("updateMessagesWithMessage", () => {
    it("should append new message", () => {
      const messages: Message[] = [
        { id: "msg-1", role: "user", content: "Hello", timestamp: Date.now() },
      ];

      const newMessage: Message = {
        id: "msg-2",
        role: "assistant",
        content: "Hi",
        timestamp: Date.now(),
      };

      const result = updateMessagesWithMessage(messages, newMessage);

      expect(result).toHaveLength(2);
      expect(result[1].id).toBe("msg-2");
    });

    it("should update existing message", () => {
      const messages: Message[] = [
        { id: "msg-1", role: "assistant", content: "Hello", timestamp: 1000 },
      ];

      const updatedMessage: Message = {
        id: "msg-1",
        role: "assistant",
        content: "Hello world",
        timestamp: 2000,
      };

      const result = updateMessagesWithMessage(messages, updatedMessage);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("Hello world");
    });
  });

  describe("removeMessageById", () => {
    it("should remove message by ID", () => {
      const messages: Message[] = [
        { id: "msg-1", role: "user", content: "Hello", timestamp: Date.now() },
        {
          id: "msg-2",
          role: "assistant",
          content: "Hi",
          timestamp: Date.now(),
        },
      ];

      const result = removeMessageById(messages, "msg-1");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("msg-2");
    });

    it("should return same array if ID not found", () => {
      const messages: Message[] = [
        { id: "msg-1", role: "user", content: "Hello", timestamp: Date.now() },
      ];

      const result = removeMessageById(messages, "non-existent");

      expect(result).toHaveLength(1);
    });
  });

  describe("findPreviousUserMessage", () => {
    it("should find previous user message", () => {
      const messages: Message[] = [
        {
          id: "msg-1",
          role: "user",
          content: "What is 2+2?",
          timestamp: 1000,
        },
        { id: "msg-2", role: "assistant", content: "4", timestamp: 2000 },
      ];

      const result = findPreviousUserMessage(messages, "msg-2");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("msg-1");
      expect(result?.content).toBe("What is 2+2?");
    });

    it("should return null if no previous message", () => {
      const messages: Message[] = [
        { id: "msg-1", role: "assistant", content: "Hello", timestamp: 1000 },
      ];

      const result = findPreviousUserMessage(messages, "msg-1");

      expect(result).toBeNull();
    });

    it("should return null if previous message is not from user", () => {
      const messages: Message[] = [
        {
          id: "msg-1",
          role: "assistant",
          content: "First",
          timestamp: 1000,
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "Second",
          timestamp: 2000,
        },
      ];

      const result = findPreviousUserMessage(messages, "msg-2");

      expect(result).toBeNull();
    });

    it("should return null if message ID not found", () => {
      const messages: Message[] = [
        { id: "msg-1", role: "user", content: "Hello", timestamp: 1000 },
      ];

      const result = findPreviousUserMessage(messages, "non-existent");

      expect(result).toBeNull();
    });
  });
});
