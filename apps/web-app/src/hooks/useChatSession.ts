/**
 * useChatSession Hook
 * Manages WebSocket connection for realtime chat streaming
 *
 * Performance Notes:
 * - Streaming updates are batched via React's setState
 * - Message updates use functional setState to avoid stale closures
 * - Callbacks are memoized with useCallback to prevent re-renders
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  Message,
  WebSocketEvent,
  ConnectionStatus,
  WebSocketErrorCode,
} from '@voiceassist/types';
import { useAuthStore } from '../stores/authStore';

interface UseChatSessionOptions {
  conversationId: string;
  onMessage?: (message: Message) => void;
  onError?: (error: WebSocketErrorCode, message: string) => void;
  onConnectionChange?: (status: ConnectionStatus) => void;
}

interface UseChatSessionReturn {
  messages: Message[];
  connectionStatus: ConnectionStatus;
  isTyping: boolean;
  sendMessage: (content: string, attachments?: string[]) => void;
  disconnect: () => void;
  reconnect: () => void;
}

const WS_URL = 'wss://assist.asimo.io/api/realtime';
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000; // 1 second

export function useChatSession(options: UseChatSessionOptions): UseChatSessionReturn {
  const { conversationId, onMessage, onError, onConnectionChange } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [isTyping, setIsTyping] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const streamingMessageRef = useRef<Message | null>(null);

  const { tokens } = useAuthStore();

  const updateConnectionStatus = useCallback((status: ConnectionStatus) => {
    setConnectionStatus(status);
    onConnectionChange?.(status);
  }, [onConnectionChange]);

  const handleError = useCallback((code: WebSocketErrorCode, message: string) => {
    console.error(`[WebSocket Error] ${code}: ${message}`);
    onError?.(code, message);
  }, [onError]);

  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, HEARTBEAT_INTERVAL);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const handleWebSocketMessage = useCallback((event: MessageEvent) => {
    try {
      const data: WebSocketEvent = JSON.parse(event.data);

      switch (data.type) {
        case 'delta': {
          // Append delta to streaming message
          if (data.delta) {
            setIsTyping(true);

            if (!streamingMessageRef.current) {
              // Start new streaming message
              streamingMessageRef.current = {
                id: data.messageId || `msg-${Date.now()}`,
                role: 'assistant',
                content: data.delta,
                timestamp: Date.now(),
              };
            } else {
              // Append to existing streaming message
              streamingMessageRef.current.content += data.delta;
            }

            // Update messages with streaming content
            setMessages((prev) => {
              const filtered = prev.filter(m => m.id !== streamingMessageRef.current?.id);
              return [...filtered, { ...streamingMessageRef.current! }];
            });
          }
          break;
        }

        case 'chunk': {
          // Handle complete chunk
          if (data.content) {
            setIsTyping(true);

            if (!streamingMessageRef.current) {
              streamingMessageRef.current = {
                id: data.messageId || `msg-${Date.now()}`,
                role: 'assistant',
                content: data.content,
                timestamp: Date.now(),
              };
            } else {
              streamingMessageRef.current.content += data.content;
            }

            setMessages((prev) => {
              const filtered = prev.filter(m => m.id !== streamingMessageRef.current?.id);
              return [...filtered, { ...streamingMessageRef.current! }];
            });
          }
          break;
        }

        case 'message.done': {
          // Finalize message
          setIsTyping(false);

          if (data.message) {
            const finalMessage: Message = {
              ...data.message,
              timestamp: data.message.timestamp || Date.now(),
            };

            setMessages((prev) => {
              const filtered = prev.filter(m => m.id !== finalMessage.id);
              return [...filtered, finalMessage];
            });

            onMessage?.(finalMessage);
          }

          streamingMessageRef.current = null;
          break;
        }

        case 'error': {
          setIsTyping(false);
          streamingMessageRef.current = null;

          if (data.error) {
            handleError(data.error.code, data.error.message);

            // Handle fatal errors
            if (['AUTH_FAILED', 'QUOTA_EXCEEDED'].includes(data.error.code)) {
              wsRef.current?.close();
            }
          }
          break;
        }

        case 'pong': {
          // Heartbeat response
          break;
        }
      }
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error);
    }
  }, [onMessage, handleError]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    updateConnectionStatus('connecting');

    try {
      const url = new URL(WS_URL);
      url.searchParams.append('conversationId', conversationId);
      if (tokens?.accessToken) {
        url.searchParams.append('token', tokens.accessToken);
      }

      const ws = new WebSocket(url.toString());

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        updateConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
        startHeartbeat();
      };

      ws.onmessage = handleWebSocketMessage;

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        handleError('CONNECTION_DROPPED', 'WebSocket connection error');
      };

      ws.onclose = (event) => {
        console.log('[WebSocket] Closed:', event.code, event.reason);
        stopHeartbeat();
        updateConnectionStatus('disconnected');

        // Attempt reconnection
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current);
          reconnectAttemptsRef.current += 1;

          console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          updateConnectionStatus('reconnecting');

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          handleError('CONNECTION_DROPPED', 'Maximum reconnection attempts reached');
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);
      handleError('CONNECTION_DROPPED', 'Failed to establish connection');
      updateConnectionStatus('disconnected');
    }
  }, [conversationId, tokens, handleWebSocketMessage, updateConnectionStatus, handleError, startHeartbeat, stopHeartbeat]);

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

    updateConnectionStatus('disconnected');
    reconnectAttemptsRef.current = 0;
  }, [stopHeartbeat, updateConnectionStatus]);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [disconnect, connect]);

  const sendMessage = useCallback((content: string, attachments?: string[]) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      handleError('CONNECTION_DROPPED', 'Cannot send message: not connected');
      return;
    }

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      attachments,
      timestamp: Date.now(),
    };

    // Add user message to messages
    setMessages((prev) => [...prev, userMessage]);

    // Send to server
    wsRef.current.send(JSON.stringify({
      type: 'message.send',
      message: userMessage,
    }));
  }, [handleError]);

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
    sendMessage,
    disconnect,
    reconnect,
  };
}
