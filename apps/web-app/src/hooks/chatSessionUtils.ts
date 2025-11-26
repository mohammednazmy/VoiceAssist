/**
 * Chat Session Utilities
 * Pure functions extracted from useChatSession for testability
 *
 * These functions handle the core logic without side effects,
 * making them easy to unit test without WebSocket mocking.
 */

import type {
  Message,
  WebSocketEvent,
  Citation,
  WebSocketErrorCode,
} from "@voiceassist/types";

// ============================================================================
// Types
// ============================================================================

export interface ParsedCitations {
  citations: Citation[];
  metadata: Record<string, unknown>;
}

export interface StreamingState {
  streamingMessage: Message | null;
  isTyping: boolean;
}

export interface WebSocketEventResult {
  streamingMessage: Message | null;
  finalMessage: Message | null;
  isTyping: boolean;
  error: { code: WebSocketErrorCode; message: string } | null;
  shouldCloseConnection: boolean;
}

// ============================================================================
// Citation Parsing
// ============================================================================

/**
 * Parse citations from message.done event
 * Handles both message.citations and message.metadata.citations formats
 */
export function parseCitations(message: Partial<Message>): ParsedCitations {
  const citations: Citation[] =
    message.citations || (message.metadata?.citations as Citation[]) || [];

  return {
    citations,
    metadata: {
      ...message.metadata,
      citations, // Ensure citations are in metadata for backward compat
    },
  };
}

/**
 * Validate citation structure
 * Returns true if citation has required fields
 */
export function isValidCitation(citation: unknown): citation is Citation {
  if (!citation || typeof citation !== "object") {
    return false;
  }

  const c = citation as Record<string, unknown>;

  // Citation must have at least an id or source
  return (
    typeof c.id === "string" ||
    typeof c.source === "string" ||
    typeof c.reference === "string"
  );
}

/**
 * Filter and normalize citations array
 */
export function normalizeCitations(citations: unknown[]): Citation[] {
  if (!Array.isArray(citations)) {
    return [];
  }

  return citations.filter(isValidCitation);
}

// ============================================================================
// Error Handling
// ============================================================================

/** Error codes that should close the WebSocket connection */
const FATAL_ERROR_CODES: WebSocketErrorCode[] = [
  "AUTH_FAILED",
  "QUOTA_EXCEEDED",
];

/**
 * Determine if an error code is fatal (should close connection)
 */
export function isFatalError(errorCode: WebSocketErrorCode): boolean {
  return FATAL_ERROR_CODES.includes(errorCode);
}

/**
 * Determine if a WebSocket close code indicates normal closure
 */
export function isNormalClosure(closeCode: number): boolean {
  // 1000 = Normal closure
  // 1001 = Going away (browser navigating away)
  return closeCode === 1000 || closeCode === 1001;
}

// ============================================================================
// Reconnection Logic
// ============================================================================

const DEFAULT_BASE_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds

/**
 * Calculate reconnection delay with exponential backoff
 * @param attempt - The current attempt number (0-indexed)
 * @param baseDelay - Base delay in milliseconds
 * @returns Delay in milliseconds, capped at MAX_RECONNECT_DELAY
 */
export function getReconnectDelay(
  attempt: number,
  baseDelay: number = DEFAULT_BASE_DELAY,
): number {
  const delay = baseDelay * Math.pow(2, attempt);
  return Math.min(delay, MAX_RECONNECT_DELAY);
}

// ============================================================================
// URL Building
// ============================================================================

/**
 * Build WebSocket URL with conversation ID and token
 */
export function buildWebSocketUrl(
  baseUrl: string,
  conversationId: string,
  token: string,
): string {
  const url = new URL(baseUrl);
  url.searchParams.append("conversationId", conversationId);
  url.searchParams.append("token", token);
  return url.toString();
}

// ============================================================================
// Message ID Generation
// ============================================================================

/**
 * Generate a unique message ID
 */
export function generateMessageId(prefix: string = "msg"): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${timestamp}-${random}`;
}

// ============================================================================
// WebSocket Event Processing
// ============================================================================

/**
 * Process incoming WebSocket event and return state updates
 *
 * This is a pure function that takes the current streaming state and an event,
 * and returns the new state without side effects.
 */
export function processWebSocketEvent(
  event: WebSocketEvent,
  currentStreamingMessage: Message | null,
): WebSocketEventResult {
  const result: WebSocketEventResult = {
    streamingMessage: currentStreamingMessage,
    finalMessage: null,
    isTyping: false,
    error: null,
    shouldCloseConnection: false,
  };

  switch (event.type) {
    case "delta": {
      if (event.delta) {
        result.isTyping = true;

        if (!currentStreamingMessage) {
          // Start new streaming message
          result.streamingMessage = {
            id: event.messageId || generateMessageId(),
            role: "assistant",
            content: event.delta,
            timestamp: Date.now(),
          };
        } else {
          // Append to existing streaming message
          result.streamingMessage = {
            ...currentStreamingMessage,
            content: currentStreamingMessage.content + event.delta,
          };
        }
      }
      break;
    }

    case "chunk": {
      if (event.content) {
        result.isTyping = true;

        if (!currentStreamingMessage) {
          result.streamingMessage = {
            id: event.messageId || generateMessageId(),
            role: "assistant",
            content: event.content,
            timestamp: Date.now(),
          };
        } else {
          result.streamingMessage = {
            ...currentStreamingMessage,
            content: currentStreamingMessage.content + event.content,
          };
        }
      }
      break;
    }

    case "message.done": {
      result.isTyping = false;
      result.streamingMessage = null;

      if (event.message) {
        const { citations, metadata } = parseCitations(event.message);

        result.finalMessage = {
          ...event.message,
          timestamp: event.message.timestamp || Date.now(),
          citations,
          metadata,
        };
      }
      break;
    }

    case "error": {
      result.isTyping = false;
      result.streamingMessage = null;

      if (event.error) {
        result.error = {
          code: event.error.code,
          message: event.error.message,
        };

        if (isFatalError(event.error.code)) {
          result.shouldCloseConnection = true;
        }
      }
      break;
    }

    case "pong": {
      // Heartbeat response - no state changes needed
      break;
    }
  }

  return result;
}

// ============================================================================
// Message State Helpers
// ============================================================================

/**
 * Update messages array with a new or updated message
 */
export function updateMessagesWithMessage(
  messages: Message[],
  newMessage: Message,
): Message[] {
  const existingIndex = messages.findIndex((m) => m.id === newMessage.id);

  if (existingIndex >= 0) {
    // Replace existing message
    return messages.map((m, i) => (i === existingIndex ? newMessage : m));
  } else {
    // Append new message
    return [...messages, newMessage];
  }
}

/**
 * Remove a message from the array by ID
 */
export function removeMessageById(
  messages: Message[],
  messageId: string,
): Message[] {
  return messages.filter((m) => m.id !== messageId);
}

/**
 * Find the previous user message for regeneration
 */
export function findPreviousUserMessage(
  messages: Message[],
  assistantMessageId: string,
): Message | null {
  const messageIndex = messages.findIndex((m) => m.id === assistantMessageId);

  if (messageIndex <= 0) {
    return null;
  }

  const previousMessage = messages[messageIndex - 1];
  return previousMessage.role === "user" ? previousMessage : null;
}
