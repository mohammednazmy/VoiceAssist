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

const DEFAULT_GATEWAY = "https://api.voiceassist.example.com";

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
const DEFAULT_WS_PATH = "/api/realtime/ws";

const WS_URL = (() => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  if (import.meta.env.DEV) {
    return `ws://localhost:8000${DEFAULT_WS_PATH}`;
  }

  return `wss://api.voiceassist.example.com${DEFAULT_WS_PATH}`;
})();

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
  // Track if a connecting WebSocket should be aborted when it opens
  const abortOnOpenRef = useRef(false);
  // Track pending file uploads waiting for server message ID
  const pendingFileUploadsRef = useRef<
    Map<
      string,
      { files: File[]; resolve: () => void; reject: (error: Error) => void }
    >
  >(new Map());

  const { tokens } = useAuthStore();
  const { apiClient } = useAuth();

  // Create attachments API client
  const attachmentsApi = createAttachmentsApi(
    import.meta.env.VITE_API_URL || DEFAULT_GATEWAY,
    () => tokens?.accessToken || null,
  );

  // Track previous initialMessages to avoid infinite loops from array reference changes
  const prevInitialMessagesRef = useRef<string>("");

  // Update messages when initialMessages content changes (e.g., when conversation changes)
  useEffect(() => {
    // Compare by stringified content to avoid infinite loops from array reference changes
    const currentKey = JSON.stringify(initialMessages.map((m) => m.id));
    if (currentKey !== prevInitialMessagesRef.current) {
      prevInitialMessagesRef.current = currentKey;
      setMessages(initialMessages);
      streamingMessageRef.current = null;
      setIsTyping(false);
    }
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
              interface HistoryMessage {
                id: string;
                role: "user" | "assistant" | "system";
                content: string;
                timestamp?: number;
                citations?: Message["citations"];
                metadata?: Message["metadata"];
              }
              const historyMessages: Message[] = data.messages.map(
                (msg: HistoryMessage) => ({
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

          case "user_message.created": {
            // Server confirms user message was persisted - now we can upload attachments
            const serverMessageId = data.messageId;
            const clientMessageId = data.clientMessageId;

            if (clientMessageId && serverMessageId) {
              websocketLog.debug(
                `Message ID sync: client=${clientMessageId} -> server=${serverMessageId}`,
              );

              // Update the local message ID to use the server's ID
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === clientMessageId
                    ? { ...msg, id: serverMessageId }
                    : msg,
                ),
              );

              // Check if there are pending file uploads for this client message ID
              const pending =
                pendingFileUploadsRef.current.get(clientMessageId);
              if (pending) {
                pendingFileUploadsRef.current.delete(clientMessageId);
                // Upload files with the server's message ID
                (async () => {
                  try {
                    for (const file of pending.files) {
                      await attachmentsApi.uploadAttachment(
                        serverMessageId,
                        file,
                      );
                    }
                    websocketLog.debug(
                      `Uploaded ${pending.files.length} attachments for message ${serverMessageId}`,
                    );
                    pending.resolve();
                  } catch (error) {
                    websocketLog.error("Failed to upload attachments:", error);
                    pending.reject(
                      error instanceof Error
                        ? error
                        : new Error("Upload failed"),
                    );
                  }
                })();
              }
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

    // Clear flags when starting new connection
    intentionalDisconnectRef.current = false;
    abortOnOpenRef.current = false;
    isConnectingRef.current = true;

    updateConnectionStatus("connecting");

    try {
      const url = new URL(WS_URL);
      url.searchParams.append("conversationId", conversationId);
      // Token is guaranteed to exist at this point (checked above)
      url.searchParams.append("token", tokens!.accessToken);

      const ws = new WebSocket(url.toString());

      ws.onopen = () => {
        isConnectingRef.current = false;

        // Check if this connection was aborted while connecting
        if (abortOnOpenRef.current) {
          websocketLog.debug(
            "Connection opened but was aborted - closing cleanly",
          );
          abortOnOpenRef.current = false;
          ws.close(1000, "Aborted");
          return;
        }

        websocketLog.debug("Connected");
        updateConnectionStatus("connected");
        reconnectAttemptsRef.current = 0;
        startHeartbeat();
      };

      ws.onmessage = handleWebSocketMessage;

      ws.onerror = (error) => {
        isConnectingRef.current = false;
        // Only log as error if this wasn't an intentional disconnect, already closed,
        // or from an aborted connection (one we abandoned while connecting).
        // These cases often trigger error events that are expected and don't indicate real problems.
        const isAlreadyClosed = ws.readyState === WebSocket.CLOSED;
        const isExpected =
          intentionalDisconnectRef.current ||
          isAlreadyClosed ||
          abortOnOpenRef.current ||
          wsRef.current !== ws; // This WS is no longer the active one
        if (isExpected) {
          websocketLog.debug(
            "Error event (expected - intentional, closed, or superseded):",
            {
              type: error.type,
              readyState: ws.readyState,
            },
          );
        } else {
          websocketLog.warn("WebSocket error event:", {
            type: error.type,
            readyState: ws.readyState,
          });
        }
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

        // Check for auth-related close codes (1008 = Policy Violation, typically auth failure)
        const isAuthError = event.code === 1008;

        if (isAuthError) {
          // Don't reconnect on auth errors - user needs to re-login
          websocketLog.warn(
            "WebSocket closed due to auth error - not reconnecting",
          );
          handleError(
            "AUTH_FAILED",
            event.reason || "Authentication failed - please log in again",
          );
          // Don't attempt reconnection - the token is likely expired
          return;
        }

        // Attempt reconnection for abnormal closures (but not auth errors)
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
      // If WebSocket is still connecting, don't close it immediately
      // (this would cause "closed before established" browser error)
      // Instead, mark it for abort when it opens
      if (wsRef.current.readyState === WebSocket.CONNECTING) {
        websocketLog.debug(
          "WebSocket still connecting - marking for abort on open",
        );
        abortOnOpenRef.current = true;
        // Still null the ref so a new connection can be started
        wsRef.current = null;
      } else {
        wsRef.current.close(1000, "Intentional disconnect");
        wsRef.current = null;
      }
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
      // If not connected, try to reconnect and wait briefly
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        // Check prerequisites before attempting reconnect
        const hasToken = !!tokens?.accessToken;
        if (!conversationId) {
          websocketLog.warn("Cannot send message: no conversation selected");
          handleError(
            "CONNECTION_DROPPED",
            "Cannot send message: no conversation selected",
          );
          return;
        }
        if (!hasToken) {
          websocketLog.warn("Cannot send message: not authenticated");
          handleError(
            "AUTH_FAILED",
            "Cannot send message: please log in again",
          );
          return;
        }

        websocketLog.debug(
          "WebSocket not open, attempting reconnect before send",
          { connectionStatus, hasWs: !!wsRef.current },
        );

        // Trigger reconnect if not already reconnecting
        if (connectionStatus !== "reconnecting" && !isConnectingRef.current) {
          reconnectAttemptsRef.current = 0;
          connect();
        }

        // Wait up to 3 seconds for connection to open
        const maxWait = 3000;
        const checkInterval = 100;
        let waited = 0;

        while (waited < maxWait) {
          await new Promise((resolve) => setTimeout(resolve, checkInterval));
          waited += checkInterval;

          if (wsRef.current?.readyState === WebSocket.OPEN) {
            websocketLog.debug("WebSocket reconnected, proceeding with send");
            break;
          }
        }

        // If still not connected after waiting, show error
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          websocketLog.warn("Reconnection failed after waiting", {
            waited,
            connectionStatus,
            isConnecting: isConnectingRef.current,
          });
          handleError(
            "CONNECTION_DROPPED",
            "Cannot send message: connection unavailable. Please try again.",
          );
          return;
        }
      }

      // Generate unique client message ID
      const clientMessageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const userMessage: Message = {
        id: clientMessageId,
        role: "user",
        content,
        attachments: [], // Will be populated after upload
        timestamp: Date.now(),
      };

      // Add user message to messages immediately (optimistic update)
      setMessages((prev) => [...prev, userMessage]);

      // If there are files, register them as pending uploads
      // They'll be uploaded when we receive user_message.created with the server's message ID
      if (files && files.length > 0) {
        const uploadPromise = new Promise<void>((resolve, reject) => {
          pendingFileUploadsRef.current.set(clientMessageId, {
            files,
            resolve,
            reject,
          });

          // Timeout after 30 seconds if we don't get the server message ID
          setTimeout(() => {
            if (pendingFileUploadsRef.current.has(clientMessageId)) {
              pendingFileUploadsRef.current.delete(clientMessageId);
              reject(new Error("Timeout waiting for message ID from server"));
            }
          }, 30000);
        });

        // Don't await - let it complete in background
        uploadPromise.catch((error) => {
          websocketLog.error("Failed to upload attachments:", error);
        });
      }

      // Send text message to server via WebSocket with client_message_id
      wsRef.current.send(
        JSON.stringify({
          type: "message",
          content: content,
          session_id: conversationId,
          client_message_id: clientMessageId,
        }),
      );
    },
    [handleError, conversationId, connectionStatus, connect, tokens],
  );

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (!conversationId) {
        throw new Error("Cannot edit message: no conversation ID");
      }
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
      // Note: attachments are not re-uploaded on regenerate
      sendMessage(userMessage.content);
    },
    [messages, sendMessage],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!conversationId) {
        throw new Error("Cannot delete message: no conversation ID");
      }
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
