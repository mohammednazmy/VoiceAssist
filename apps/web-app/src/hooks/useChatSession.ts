/**
 * useChatSession Hook
 * Manages WebSocket connection for realtime chat streaming
 *
 * Performance Notes:
 * - Streaming updates are batched via React's setState
 * - Message updates use functional setState to avoid stale closures
 * - Callbacks are memoized with useCallback to prevent re-renders
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  Message,
  WebSocketEvent,
  ConnectionStatus,
  WebSocketErrorCode,
} from "@voiceassist/types";
import { useAuthStore } from "../stores/authStore";
import { useAuth } from "./useAuth";

interface UseChatSessionOptions {
  conversationId: string;
  initialMessages?: Message[];
  onMessage?: (message: Message) => void;
  onError?: (error: WebSocketErrorCode, message: string) => void;
  onConnectionChange?: (status: ConnectionStatus) => void;
}

interface UseChatSessionReturn {
  messages: Message[];
  connectionStatus: ConnectionStatus;
  isTyping: boolean;
  editingMessageId: string | null;
  sendMessage: (content: string, attachments?: string[]) => void;
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  regenerateMessage: (messageId: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  disconnect: () => void;
  reconnect: () => void;
}

// WebSocket URL - configurable per environment
const WS_URL =
  import.meta.env.VITE_WS_URL ||
  (import.meta.env.DEV
    ? "ws://localhost:8000/api/realtime/ws"
    : "wss://assist.asimo.io/api/realtime/ws");

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000; // 1 second

export function useChatSession(
  options: UseChatSessionOptions,
): UseChatSessionReturn {
  const {
    conversationId,
    initialMessages = [],
    onMessage,
    onError,
    onConnectionChange,
  } = options;

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [isTyping, setIsTyping] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const streamingMessageRef = useRef<Message | null>(null);

  const { tokens } = useAuthStore();
  const { apiClient } = useAuth();

  // Update messages when initialMessages changes (e.g., when conversation changes)
  useEffect(() => {
    setMessages(initialMessages);
    streamingMessageRef.current = null;
    setIsTyping(false);
  }, [initialMessages]);

  const updateConnectionStatus = useCallback(
    (status: ConnectionStatus) => {
      setConnectionStatus(status);
      onConnectionChange?.(status);
    },
    [onConnectionChange],
  );

  const handleError = useCallback(
    (code: WebSocketErrorCode, message: string) => {
      console.error(`[WebSocket Error] ${code}: ${message}`);
      onError?.(code, message);
    },
    [onError],
  );

  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, HEARTBEAT_INTERVAL);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const handleWebSocketMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data: WebSocketEvent = JSON.parse(event.data);

        switch (data.type) {
          case "delta": {
            // Append delta to streaming message
            if (data.delta) {
              setIsTyping(true);

              if (!streamingMessageRef.current) {
                // Start new streaming message
                streamingMessageRef.current = {
                  id: data.messageId || `msg-${Date.now()}`,
                  role: "assistant",
                  content: data.delta,
                  timestamp: Date.now(),
                };
              } else {
                // Append to existing streaming message
                streamingMessageRef.current.content += data.delta;
              }

              // Update messages with streaming content
              setMessages((prev) => {
                const filtered = prev.filter(
                  (m) => m.id !== streamingMessageRef.current?.id,
                );
                return [...filtered, { ...streamingMessageRef.current! }];
              });
            }
            break;
          }

          case "chunk": {
            // Handle complete chunk
            if (data.content) {
              setIsTyping(true);

              if (!streamingMessageRef.current) {
                streamingMessageRef.current = {
                  id: data.messageId || `msg-${Date.now()}`,
                  role: "assistant",
                  content: data.content,
                  timestamp: Date.now(),
                };
              } else {
                streamingMessageRef.current.content += data.content;
              }

              setMessages((prev) => {
                const filtered = prev.filter(
                  (m) => m.id !== streamingMessageRef.current?.id,
                );
                return [...filtered, { ...streamingMessageRef.current! }];
              });
            }
            break;
          }

          case "message.done": {
            // Finalize message
            setIsTyping(false);

            if (data.message) {
              const finalMessage: Message = {
                ...data.message,
                timestamp: data.message.timestamp || Date.now(),
              };

              setMessages((prev) => {
                const filtered = prev.filter((m) => m.id !== finalMessage.id);
                return [...filtered, finalMessage];
              });

              onMessage?.(finalMessage);
            }

            streamingMessageRef.current = null;
            break;
          }

          case "error": {
            setIsTyping(false);
            streamingMessageRef.current = null;

            if (data.error) {
              handleError(data.error.code, data.error.message);

              // Handle fatal errors
              if (["AUTH_FAILED", "QUOTA_EXCEEDED"].includes(data.error.code)) {
                wsRef.current?.close();
              }
            }
            break;
          }

          case "pong": {
            // Heartbeat response
            break;
          }
        }
      } catch (error) {
        console.error("[WebSocket] Failed to parse message:", error);
      }
    },
    [onMessage, handleError],
  );

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    updateConnectionStatus("connecting");

    try {
      const url = new URL(WS_URL);
      url.searchParams.append("conversationId", conversationId);
      if (tokens?.accessToken) {
        url.searchParams.append("token", tokens.accessToken);
      }

      const ws = new WebSocket(url.toString());

      ws.onopen = () => {
        console.log("[WebSocket] Connected");
        updateConnectionStatus("connected");
        reconnectAttemptsRef.current = 0;
        startHeartbeat();
      };

      ws.onmessage = handleWebSocketMessage;

      ws.onerror = (error) => {
        console.error("[WebSocket] Error:", error);
        handleError("CONNECTION_DROPPED", "WebSocket connection error");
      };

      ws.onclose = (event) => {
        console.log("[WebSocket] Closed:", event.code, event.reason);
        stopHeartbeat();
        updateConnectionStatus("disconnected");

        // Attempt reconnection
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay =
            BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current);
          reconnectAttemptsRef.current += 1;

          console.log(
            `[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`,
          );
          updateConnectionStatus("reconnecting");

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          handleError(
            "CONNECTION_DROPPED",
            "Maximum reconnection attempts reached",
          );
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("[WebSocket] Connection failed:", error);
      handleError("CONNECTION_DROPPED", "Failed to establish connection");
      updateConnectionStatus("disconnected");
    }
  }, [
    conversationId,
    tokens,
    handleWebSocketMessage,
    updateConnectionStatus,
    handleError,
    startHeartbeat,
    stopHeartbeat,
  ]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    stopHeartbeat();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    updateConnectionStatus("disconnected");
    reconnectAttemptsRef.current = 0;
  }, [stopHeartbeat, updateConnectionStatus]);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [disconnect, connect]);

  const sendMessage = useCallback(
    (content: string, attachments?: string[]) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        handleError("CONNECTION_DROPPED", "Cannot send message: not connected");
        return;
      }

      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "user",
        content,
        attachments,
        timestamp: Date.now(),
      };

      // Add user message to messages
      setMessages((prev) => [...prev, userMessage]);

      // Send to server - changed from 'message.send' to 'message' to match backend
      // Backend expects content directly, not nested in message object
      wsRef.current.send(
        JSON.stringify({
          type: "message",
          content: content,
          session_id: conversationId, // Add conversation ID as session
          attachments: attachments,
        }),
      );
    },
    [handleError, conversationId],
  );

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      try {
        const updatedMessage = await apiClient.editMessage(
          conversationId,
          messageId,
          newContent,
        );

        // Update local state
        setMessages((prev) =>
          prev.map((msg) => (msg.id === messageId ? updatedMessage : msg)),
        );

        setEditingMessageId(null);
      } catch (error) {
        console.error("Failed to edit message:", error);
        throw error;
      }
    },
    [conversationId, apiClient],
  );

  const regenerateMessage = useCallback(
    async (assistantMessageId: string) => {
      // Find the assistant message and the user message before it
      const messageIndex = messages.findIndex(
        (m) => m.id === assistantMessageId,
      );
      if (messageIndex === -1 || messageIndex === 0) {
        console.error("Cannot regenerate: invalid message");
        return;
      }

      const userMessage = messages[messageIndex - 1];
      if (userMessage.role !== "user") {
        console.error("Cannot regenerate: previous message is not from user");
        return;
      }

      // Remove the old assistant message
      setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));

      // Re-send the user message (will trigger new assistant response via WebSocket)
      sendMessage(userMessage.content, userMessage.attachments);
    },
    [messages, sendMessage],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!confirm("Are you sure you want to delete this message?")) {
        return;
      }

      try {
        await apiClient.deleteMessage(conversationId, messageId);

        // Update local state
        setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      } catch (error) {
        console.error("Failed to delete message:", error);
        throw error;
      }
    },
    [conversationId, apiClient],
  );

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    messages,
    connectionStatus,
    isTyping,
    editingMessageId,
    sendMessage,
    editMessage,
    regenerateMessage,
    deleteMessage,
    disconnect,
    reconnect,
  };
}
