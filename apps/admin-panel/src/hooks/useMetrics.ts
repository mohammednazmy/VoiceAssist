import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAPI } from "../lib/api";
import {
  ConnectionStatus,
  WebSocketEvent,
  websocketService,
} from "../services/websocket";

export interface SystemMetrics {
  total_users: number;
  active_users: number;
  admin_users: number;
  timestamp: string;
}

export interface ServiceHealth {
  database: boolean;
  redis: boolean;
  qdrant: boolean;
}

interface UseMetricsOptions {
  refreshIntervalMs?: number;
}

interface MetricsState {
  metrics: SystemMetrics | null;
  health: ServiceHealth | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  connectionStatus: ConnectionStatus;
  autoRefresh: boolean;
  isPaused: boolean;
  refreshNow: () => Promise<void>;
  toggleAutoRefresh: () => void;
  togglePause: () => void;
}

const DEFAULT_REFRESH_MS = 30000;

type MetricsUpdatePayload = {
  metrics?: Partial<SystemMetrics>;
  health?: Partial<ServiceHealth>;
  timestamp?: string;
};

function isMetricsUpdateEvent(
  event: WebSocketEvent,
): event is WebSocketEvent & { payload?: MetricsUpdatePayload } {
  return event.type === "metrics:update" || event.type === "metric";
}

export function useMetrics(options: UseMetricsOptions = {}): MetricsState {
  const refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_MS;
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [health, setHealth] = useState<ServiceHealth | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    websocketService.getStatus(),
  );
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  const refreshNow = useCallback(async () => {
    setLoading(true);
    try {
      const [metricsData, healthData] = await Promise.all([
        fetchAPI<SystemMetrics>("/api/admin/panel/summary"),
        fetchAPI<ServiceHealth>("/health").catch(() => ({
          database: true,
          redis: true,
          qdrant: true,
        })),
      ]);

      setMetrics(metricsData);
      setHealth(healthData);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load metrics";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleMetricsUpdate = useCallback(
    (payload: MetricsUpdatePayload) => {
      if (isPaused) return;

      setMetrics((current) => {
        const base = (current || {}) as SystemMetrics;
        return {
          ...base,
          ...payload.metrics,
          timestamp:
            payload.timestamp ||
            payload.metrics?.timestamp ||
            base.timestamp ||
            new Date().toISOString(),
        };
      });

      if (payload.health) {
        setHealth(
          (current) =>
            ({
              ...(current || {}),
              ...payload.health,
            }) as ServiceHealth,
        );
      }

      setLastUpdated(payload.timestamp || new Date().toISOString());
    },
    [isPaused],
  );

  useEffect(() => {
    const unsubscribeStatus =
      websocketService.subscribeStatus(setConnectionStatus);
    const unsubscribeMessages = websocketService.subscribeMessages((event) => {
      if (!isMetricsUpdateEvent(event)) return;
      const payload = event.payload as MetricsUpdatePayload;
      handleMetricsUpdate(payload);
    });

    websocketService.connect();

    return () => {
      unsubscribeStatus();
      unsubscribeMessages();
    };
  }, [handleMetricsUpdate]);

  useEffect(() => {
    if (!autoRefresh || isPaused) return;

    let cancelled = false;
    const run = async () => {
      if (!cancelled) {
        await refreshNow();
      }
    };

    run();
    const interval = setInterval(run, refreshIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [autoRefresh, isPaused, refreshIntervalMs, refreshNow]);

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefresh((prev) => !prev);
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const value = useMemo(
    () => ({
      metrics,
      health,
      loading,
      error,
      lastUpdated,
      connectionStatus,
      autoRefresh,
      isPaused,
      refreshNow,
      toggleAutoRefresh,
      togglePause,
    }),
    [
      metrics,
      health,
      loading,
      error,
      lastUpdated,
      connectionStatus,
      autoRefresh,
      isPaused,
      refreshNow,
      toggleAutoRefresh,
      togglePause,
    ],
  );

  return value;
}
