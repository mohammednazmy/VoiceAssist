import { useCallback, useEffect, useRef, useState } from "react";

// Event types that can be received from the admin WebSocket
export type AdminEventType =
  | "session.connected"
  | "session.disconnected"
  | "conversation.created"
  | "conversation.updated"
  | "conversation.deleted"
  | "message.created"
  | "clinical_context.created"
  | "clinical_context.updated"
  | "attachment.uploaded"
  | "attachment.deleted"
  | "phi.accessed"
  | "phi.detected"
  | "voice.session_started"
  | "voice.session_ended"
  | "voice.session_error"
  | "tt.state_changed"
  | "tt.tool_called"
  | "tt.context_created"
  | "tt.context_expired"
  | "system.alert"
  | "system.health_changed"
  | "user.logged_in"
  | "user.logged_out"
  | "user.created";

export interface AdminEvent {
  type: AdminEventType;
  timestamp: string;
  user_id?: string;
  user_email?: string;
  session_id?: string;
  resource_id?: string;
  resource_type?: string;
  data?: Record<string, unknown>;
}

export interface MetricsUpdate {
  active_websocket_sessions: number;
  database_pool: {
    pool_size: number;
    checked_out: number;
    overflow: number;
  };
  redis_pool: {
    total_connections: number;
    available_connections: number;
  };
  timestamp: string;
}

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";

interface UseRealtimeEventsOptions {
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onEvent?: (event: AdminEvent) => void;
  onMetrics?: (metrics: MetricsUpdate) => void;
  onConnectionChange?: (status: ConnectionStatus) => void;
  eventFilter?: AdminEventType[];
}

interface UseRealtimeEventsState {
  status: ConnectionStatus;
  events: AdminEvent[];
  metrics: MetricsUpdate | null;
  lastEventTime: string | null;
  reconnectAttempts: number;
  connect: () => void;
  disconnect: () => void;
  clearEvents: () => void;
  subscribe: (eventTypes: AdminEventType[]) => void;
}

const MAX_EVENTS_BUFFER = 100;

export function useRealtimeEvents(
  options: UseRealtimeEventsOptions = {},
): UseRealtimeEventsState {
  const {
    autoConnect = true,
    reconnectInterval = 5000,
    maxReconnectAttempts = 10,
    onEvent,
    onMetrics,
    onConnectionChange,
    eventFilter,
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [metrics, setMetrics] = useState<MetricsUpdate | null>(null);
  const [lastEventTime, setLastEventTime] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateStatus = useCallback(
    (newStatus: ConnectionStatus) => {
      setStatus(newStatus);
      onConnectionChange?.(newStatus);
    },
    [onConnectionChange],
  );

  const connect = useCallback(() => {
    // Don't connect if already connected or connecting
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    updateStatus("connecting");

    // Build WebSocket URL from API gateway base URL (prefer admin config)
    const apiBase =
      import.meta.env.VITE_ADMIN_API_URL ||
      import.meta.env.VITE_API_URL ||
      window.location.origin;
    const url = new URL(apiBase);
    const protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${url.host}/api/admin/panel/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        updateStatus("connected");
        setReconnectAttempts(0);

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 30000);

        // Subscribe to filtered events if specified
        if (eventFilter && eventFilter.length > 0) {
          ws.send(
            JSON.stringify({
              type: "subscribe",
              payload: { event_types: eventFilter },
            }),
          );
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          switch (message.type) {
            case "connected":
              // Connection confirmed
              break;

            case "pong":
            case "heartbeat":
              // Keep-alive responses, ignore
              break;

            case "metrics_update":
              const metricsData = message.payload as MetricsUpdate;
              setMetrics(metricsData);
              onMetrics?.(metricsData);
              break;

            case "admin_event":
              const adminEvent = message.payload as AdminEvent;

              // Apply event filter if specified
              if (
                eventFilter &&
                eventFilter.length > 0 &&
                !eventFilter.includes(adminEvent.type)
              ) {
                return;
              }

              // Add to events buffer (with max size)
              setEvents((prev) => {
                const newEvents = [adminEvent, ...prev].slice(
                  0,
                  MAX_EVENTS_BUFFER,
                );
                return newEvents;
              });
              setLastEventTime(adminEvent.timestamp);
              onEvent?.(adminEvent);
              break;

            case "subscribed":
              // Subscription confirmed
              break;
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
        }
      };

      ws.onerror = (error) => {
        console.error("Admin WebSocket error:", error);
      };

      ws.onclose = (event) => {
        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Attempt reconnection if not a clean close
        if (!event.wasClean && reconnectAttempts < maxReconnectAttempts) {
          updateStatus("reconnecting");
          setReconnectAttempts((prev) => prev + 1);

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else if (reconnectAttempts >= maxReconnectAttempts) {
          updateStatus("failed");
        } else {
          updateStatus("disconnected");
        }
      };
    } catch (err) {
      console.error("Failed to create WebSocket:", err);
      updateStatus("failed");
    }
  }, [
    updateStatus,
    reconnectAttempts,
    reconnectInterval,
    maxReconnectAttempts,
    eventFilter,
    onEvent,
    onMetrics,
  ]);

  const disconnect = useCallback(() => {
    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Clear ping interval
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close(1000, "Client disconnect");
      wsRef.current = null;
    }

    updateStatus("disconnected");
    setReconnectAttempts(0);
  }, [updateStatus]);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setLastEventTime(null);
  }, []);

  const subscribe = useCallback((eventTypes: AdminEventType[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "subscribe",
          payload: { event_types: eventTypes },
        }),
      );
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    status,
    events,
    metrics,
    lastEventTime,
    reconnectAttempts,
    connect,
    disconnect,
    clearEvents,
    subscribe,
  };
}

// Utility hook for specific event types
export function useAdminEventListener(
  eventType: AdminEventType | AdminEventType[],
  callback: (event: AdminEvent) => void,
) {
  const eventTypes = Array.isArray(eventType) ? eventType : [eventType];

  const { events } = useRealtimeEvents({
    eventFilter: eventTypes,
    onEvent: callback,
  });

  return events.filter((e) => eventTypes.includes(e.type));
}
