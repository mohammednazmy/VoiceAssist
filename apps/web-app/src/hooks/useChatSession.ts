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
import { createAttachmentsApi } from "../lib/api/attachmentsApi";
import { websocketLog } from "../lib/logger";

interface UseChatSessionOptions {
  conversationId: string | undefined;
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
  sendMessage: (content: string, files?: File[]) => void;
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  regenerateMessage: (messageId: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  disconnect: () => void;
  reconnect: () => void;
  /** Add a message directly to the chat timeline (for voice mode integration) */
  addMessage: (message: Omit<Message, "id" | "timestamp">) => Message;
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
  const skipLoggedRef = useRef<{
    conversationId: string | undefined;
    hasToken: boolean;
  } | null>(null);
  // Flag to distinguish intentional disconnects from unexpected closes
  const intentionalDisconnectRef = useRef(false);
  // Track connection state to prevent duplicate connect attempts
  const isConnectingRef = useRef(false);

  const { tokens } = useAuthStore();
  const { apiClient } = useAuth();

  // Create attachments API client
  const attachmentsApi = createAttachmentsApi(
    import.meta.env.VITE_API_URL || "http://localhost:8000",
    () => tokens?.accessToken || null,
  );

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
      websocketLog.error(`Error ${code}: ${message}`);
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
              // Extract citations from either message.citations or message.metadata.citations
              const citations =
                data.message.citations ||
                data.message.metadata?.citations ||
                [];

              const finalMessage: Message = {
                ...data.message,
                timestamp: data.message.timestamp || Date.now(),
                citations, // Ensure citations are at top level
                metadata: {
                  ...data.message.metadata,
                  citations, // Also preserve in metadata for backward compat
                },
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

          case "history": {
            // Receive message history on connect
            if (data.messages && Array.isArray(data.messages)) {
              websocketLog.debug(
                `Received ${data.messages.length} history messages`,
              );
              const historyMessages: Message[] = data.messages.map(
                (msg: any) => ({
                  id: msg.id,
                  role: msg.role,
                  content: msg.content,
                  timestamp: msg.timestamp || Date.now(),
                  citations: msg.citations || [],
                  metadata: msg.metadata || {},
                }),
              );
              // Replace messages with history (merge with any provided initialMessages)
              setMessages((prev) => {
                // Keep any messages that aren't in history (e.g., optimistic updates)
                const historyIds = new Set(historyMessages.map((m) => m.id));
                const nonHistoryMessages = prev.filter(
                  (m) => !historyIds.has(m.id),
                );
                return [...historyMessages, ...nonHistoryMessages];
              });
            }
            break;
          }
        }
      } catch (error) {
        websocketLog.error("Failed to parse message:", error);
      }
    },
    [onMessage, handleError],
  );

  const connect = useCallback(() => {
    const hasToken = !!tokens?.accessToken;

    // Don't try to connect without a valid conversationId or token
    if (!conversationId || !hasToken) {
      // Only log skip once per unique state to reduce noise
      const currentSkipState = { conversationId, hasToken };
      const shouldLog =
        !skipLoggedRef.current ||
        skipLoggedRef.current.conversationId !==
          currentSkipState.conversationId ||
        skipLoggedRef.current.hasToken !== currentSkipState.hasToken;

      if (shouldLog) {
        websocketLog.debug(
          "Skipping connect - missing conversationId or token",
          currentSkipState,
        );
        skipLoggedRef.current = currentSkipState;
      }
      updateConnectionStatus("disconnected");
      return;
    }

    // Clear skip log state when we actually connect
    skipLoggedRef.current = null;

    // Guard: Already connected
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Guard: Already connecting (prevents duplicate connection attempts)
    if (isConnectingRef.current) {
      websocketLog.debug("Already connecting, skipping duplicate attempt");
      return;
    }

    // Clear intentional disconnect flag when starting new connection
    intentionalDisconnectRef.current = false;
    isConnectingRef.current = true;

    updateConnectionStatus("connecting");

    try {
      const url = new URL(WS_URL);
      url.searchParams.append("conversationId", conversationId);
      // Token is guaranteed to exist at this point (checked above)
      url.searchParams.append("token", tokens!.accessToken);

      const ws = new WebSocket(url.toString());

      ws.onopen = () => {
        websocketLog.debug("Connected");
        isConnectingRef.current = false;
        updateConnectionStatus("connected");
        reconnectAttemptsRef.current = 0;
        startHeartbeat();
      };

      ws.onmessage = handleWebSocketMessage;

      ws.onerror = (error) => {
        // Log error details for debugging
        websocketLog.error("Error event received:", {
          type: error.type,
          readyState: ws.readyState,
        });
        isConnectingRef.current = false;
        // Note: WebSocket error events don't contain detailed error info
        // The actual reason will be in the subsequent close event
      };

      ws.onclose = (event) => {
        websocketLog.debug("Closed:", {
          code: event.code,
          reason: event.reason || "(no reason provided)",
          wasClean: event.wasClean,
          intentional: intentionalDisconnectRef.current,
        });
        isConnectingRef.current = false;
        stopHeartbeat();
        updateConnectionStatus("disconnected");

        // Don't reconnect if this was an intentional disconnect
        if (intentionalDisconnectRef.current) {
          websocketLog.debug("Intentional disconnect - not reconnecting");
          return;
        }

        // Only treat as error if not a clean close (1000) or going away (1001)
        const isNormalClosure = event.code === 1000 || event.code === 1001;

        // Attempt reconnection for abnormal closures
        if (
          !isNormalClosure &&
          reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS
        ) {
          const delay =
            BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current);
          reconnectAttemptsRef.current += 1;

          websocketLog.debug(
            `Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`,
          );
          updateConnectionStatus("reconnecting");

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (!isNormalClosure) {
          // Only report error if we've exhausted retries
          handleError(
            "CONNECTION_DROPPED",
            `WebSocket closed abnormally (code ${event.code}): ${event.reason || "Connection lost"}`,
          );
        }
        // For normal closures, don't report as error
      };

      wsRef.current = ws;
    } catch (error) {
      websocketLog.error("Connection failed:", error);
      isConnectingRef.current = false;
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
    // Mark as intentional to prevent auto-reconnect
    intentionalDisconnectRef.current = true;
    isConnectingRef.current = false;

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
    async (content: string, files?: File[]) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        handleError("CONNECTION_DROPPED", "Cannot send message: not connected");
        return;
      }

      // Generate unique message ID
      const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const userMessage: Message = {
        id: messageId,
        role: "user",
        content,
        attachments: [], // Will be populated after upload
        timestamp: Date.now(),
      };

      // Add user message to messages immediately
      setMessages((prev) => [...prev, userMessage]);

      // Send text message to server via WebSocket
      wsRef.current.send(
        JSON.stringify({
          type: "message",
          content: content,
          session_id: conversationId,
        }),
      );

      // Upload files asynchronously if present
      if (files && files.length > 0) {
        try {
          const uploadedAttachments = [];
          for (const file of files) {
            const attachment = await attachmentsApi.uploadAttachment(
              messageId,
              file,
            );
            uploadedAttachments.push(attachment);
          }

          // Update message with uploaded attachments
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === messageId
                ? { ...msg, attachments: uploadedAttachments.map((a) => a.id) }
                : msg,
            ),
          );
        } catch (error) {
          websocketLog.error("Failed to upload attachments:", error);
          // Don't fail the whole message send if attachments fail
        }
      }
    },
    [handleError, conversationId, attachmentsApi],
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
        websocketLog.error("Failed to edit message:", error);
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
        websocketLog.error("Cannot regenerate: invalid message");
        return;
      }

      const userMessage = messages[messageIndex - 1];
      if (userMessage.role !== "user") {
        websocketLog.error(
          "Cannot regenerate: previous message is not from user",
        );
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
        websocketLog.error("Failed to delete message:", error);
        throw error;
      }
    },
    [conversationId, apiClient],
  );

  /**
   * Add a message directly to the chat timeline
   * Used for voice mode integration to show transcribed speech
   * without going through the WebSocket message flow
   */
  const addMessage = useCallback(
    (messageData: Omit<Message, "id" | "timestamp">): Message => {
      const messageId = `voice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const newMessage: Message = {
        ...messageData,
        id: messageId,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, newMessage]);
      onMessage?.(newMessage);

      return newMessage;
    },
    [onMessage],
  );

  // Store connect/disconnect in refs to avoid effect dependency issues
  const connectRef = useRef(connect);
  const disconnectRef = useRef(disconnect);
  useEffect(() => {
    connectRef.current = connect;
    disconnectRef.current = disconnect;
  }, [connect, disconnect]);

  // Connect when conversationId and token are available
  // Disconnect when the hook unmounts or when conversationId changes
  // NOTE: Using refs for connect/disconnect to avoid infinite effect loops
  // when those functions' identities change
  useEffect(() => {
    // Only attempt connect when we have both prerequisites
    // This prevents unnecessary connect() calls that just log and return
    const hasToken = !!tokens?.accessToken;
    const hasConversationId = !!conversationId;

    if (hasToken && hasConversationId) {
      connectRef.current();
    }

    return () => {
      disconnectRef.current();
    };
  }, [conversationId, tokens?.accessToken]);

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
    addMessage,
  };
}
