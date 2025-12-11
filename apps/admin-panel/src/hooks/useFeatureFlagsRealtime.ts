/**
 * Real-time Feature Flags Hook (Phase 3)
 *
 * Enhanced feature flags hook with Server-Sent Events (SSE) support for
 * real-time flag updates. Falls back to polling if SSE is unavailable.
 *
 * Features:
 * - Real-time updates via SSE
 * - Version-aware caching
 * - Automatic reconnection
 * - Graceful fallback to polling
 *
 * @example
 * ```tsx
 * const { flags, loading, connected, version } = useFeatureFlagsRealtime({
 *   autoRefresh: true,
 *   useSSE: true,
 * });
 * ```
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAPI } from "../lib/api";

// Types for Feature Flags
export interface FeatureFlag {
  name: string;
  description: string;
  flag_type: "boolean" | "string" | "number" | "json" | "multivariate";
  enabled: boolean;
  value?: unknown;
  default_value?: unknown;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
  variants?: FlagVariant[];
  targeting_rules?: TargetingRules;
}

export interface FlagVariant {
  id: string;
  name: string;
  value: unknown;
  weight: number;
  description?: string;
}

export interface TargetingRules {
  rules: TargetingRule[];
  defaultVariant?: string;
  defaultEnabled?: boolean;
}

export interface TargetingRule {
  id: string;
  name: string;
  priority: number;
  conditions: RuleCondition[];
  variant?: string;
  enabled?: boolean;
}

export interface RuleCondition {
  attribute: string;
  operator: string;
  value: unknown;
}

export interface FeatureFlagCreate {
  name: string;
  description: string;
  flag_type?: "boolean" | "string" | "number" | "json" | "multivariate";
  enabled?: boolean;
  value?: unknown;
  default_value?: unknown;
  metadata?: Record<string, unknown>;
  variants?: FlagVariant[];
  targeting_rules?: TargetingRules;
}

export interface FeatureFlagUpdate {
  enabled?: boolean;
  value?: unknown;
  description?: string;
  metadata?: Record<string, unknown>;
  variants?: FlagVariant[];
  targeting_rules?: TargetingRules;
}

interface SSEEvent {
  event: string;
  data: {
    flag?: string;
    value?: FeatureFlag;
    flags?: Record<string, FeatureFlag>;
    version?: number;
    timestamp?: string;
    client_id?: string;
    message?: string;
    events_replayed?: number;
    replayed?: boolean;
  };
}

interface UseFeatureFlagsRealtimeOptions {
  /** Enable auto-refresh via polling (fallback) */
  autoRefresh?: boolean;
  /** Polling interval in ms (default: 30000) */
  refreshIntervalMs?: number;
  /** Enable SSE for real-time updates (default: true) */
  useSSE?: boolean;
  /** Specific flags to subscribe to (empty = all) */
  flagFilter?: string[];
  /** Callback when a flag is updated in real-time */
  onFlagUpdate?: (flag: string, value: FeatureFlag) => void;
  /** Callback when connection status changes */
  onConnectionChange?: (connected: boolean) => void;
  /** Callback when reconnected with replayed events (Last-Event-ID support) */
  onReconnect?: (eventsReplayed: number) => void;
}

interface UseFeatureFlagsRealtimeState {
  flags: FeatureFlag[];
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  /** Current flags version (for cache invalidation) */
  version: number;
  /** Whether SSE connection is active */
  connected: boolean;
  /** Connection mode: 'sse', 'polling', or 'disconnected' */
  connectionMode: "sse" | "polling" | "disconnected";
  /** Number of reconnection attempts */
  reconnectCount: number;
  /** Number of events replayed on last reconnect */
  eventsReplayed: number;
  refreshFlags: () => Promise<void>;
  createFlag: (flag: FeatureFlagCreate) => Promise<boolean>;
  updateFlag: (name: string, updates: FeatureFlagUpdate) => Promise<boolean>;
  deleteFlag: (name: string) => Promise<boolean>;
  toggleFlag: (name: string) => Promise<boolean>;
  /** Force reconnect to SSE */
  reconnect: () => void;
}

const DEFAULT_REFRESH_MS = 30000;
const SSE_RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 5;

export function useFeatureFlagsRealtime(
  options: UseFeatureFlagsRealtimeOptions = {},
): UseFeatureFlagsRealtimeState {
  const {
    autoRefresh = false,
    refreshIntervalMs = DEFAULT_REFRESH_MS,
    useSSE = true,
    flagFilter,
    onFlagUpdate,
    onConnectionChange,
    onReconnect,
  } = options;

  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [connected, setConnected] = useState(false);
  const [connectionMode, setConnectionMode] = useState<
    "sse" | "polling" | "disconnected"
  >("disconnected");
  const [reconnectCount, setReconnectCount] = useState(0);
  const [eventsReplayed, setEventsReplayed] = useState(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch flags via REST API
  const refreshFlags = useCallback(async () => {
    try {
      const data = await fetchAPI<{ flags: FeatureFlag[]; total: number }>(
        "/api/admin/feature-flags",
      );
      setFlags(data.flags);
      setLastUpdated(new Date().toISOString());
      setError(null);

      // Also fetch current version
      try {
        const versionData = await fetchAPI<{ version: number }>(
          "/api/flags/version",
        );
        setVersion(versionData.version);
      } catch {
        // Version endpoint might not be available yet
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load feature flags";
      setError(message);
    }
  }, []);

  // Handle SSE event
  const handleSSEEvent = useCallback(
    (event: SSEEvent) => {
      const { data } = event;

      switch (event.event) {
        case "connected":
          // Initial connection with all current flags
          if (data.flags) {
            const flagsArray = Object.values(data.flags);
            setFlags(flagsArray);
          }
          if (data.version !== undefined) {
            setVersion(data.version);
          }
          setLastUpdated(data.timestamp || new Date().toISOString());
          setConnected(true);
          setConnectionMode("sse");
          reconnectAttemptsRef.current = 0;
          onConnectionChange?.(true);
          break;

        case "flag_update":
          // Single flag updated
          if (data.flag && data.value) {
            setFlags((prev) => {
              const existing = prev.findIndex((f) => f.name === data.flag);
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = data.value!;
                return updated;
              } else {
                return [...prev, data.value!];
              }
            });
            if (data.version !== undefined) {
              setVersion(data.version);
            }
            setLastUpdated(data.timestamp || new Date().toISOString());
            onFlagUpdate?.(data.flag, data.value);
          }
          break;

        case "flags_bulk_update":
          // Multiple flags updated at once
          if (data.flags) {
            setFlags((prev) => {
              const updated = [...prev];
              for (const [name, value] of Object.entries(data.flags!)) {
                const existing = updated.findIndex((f) => f.name === name);
                if (existing >= 0) {
                  updated[existing] = value;
                } else {
                  updated.push(value);
                }
              }
              return updated;
            });
          }
          if (data.version !== undefined) {
            setVersion(data.version);
          }
          setLastUpdated(data.timestamp || new Date().toISOString());
          break;

        case "heartbeat":
          // Keep-alive, update version if provided
          if (data.version !== undefined) {
            setVersion(data.version);
          }
          break;

        case "reconnected":
          // Reconnected with Last-Event-ID support
          if (data.version !== undefined) {
            setVersion(data.version);
          }
          setLastUpdated(data.timestamp || new Date().toISOString());
          setConnected(true);
          setConnectionMode("sse");
          setReconnectCount((prev) => prev + 1);
          if (data.events_replayed !== undefined) {
            setEventsReplayed(data.events_replayed);
            onReconnect?.(data.events_replayed);
          }
          reconnectAttemptsRef.current = 0;
          onConnectionChange?.(true);
          break;

        case "error":
          setError(data.message || "SSE error");
          break;
      }
    },
    [onFlagUpdate, onConnectionChange, onReconnect],
  );

  // Connect to SSE endpoint
  const connectSSE = useCallback(() => {
    if (!useSSE || typeof EventSource === "undefined") {
      setConnectionMode("polling");
      return;
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Build URL with optional flag filter. Use API base instead of panel origin to avoid 404s in dev.
    const apiBase =
      (import.meta.env.VITE_ADMIN_API_URL as string | undefined) ||
      (import.meta.env.VITE_API_URL as string | undefined) ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const url = new URL("/api/flags/stream", apiBase);
    if (flagFilter && flagFilter.length > 0) {
      url.searchParams.set("flags", flagFilter.join(","));
    }

    const eventSource = new EventSource(url.toString());
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
      setConnectionMode("sse");
      setError(null);
      reconnectAttemptsRef.current = 0;
    };

    // Handle named events
    eventSource.addEventListener("connected", (e) => {
      try {
        const data = JSON.parse(e.data);
        handleSSEEvent({ event: "connected", data });
      } catch (err) {
        console.error("Failed to parse connected event:", err);
      }
    });

    eventSource.addEventListener("flag_update", (e) => {
      try {
        const data = JSON.parse(e.data);
        handleSSEEvent({ event: "flag_update", data });
      } catch (err) {
        console.error("Failed to parse flag_update event:", err);
      }
    });

    eventSource.addEventListener("flags_bulk_update", (e) => {
      try {
        const data = JSON.parse(e.data);
        handleSSEEvent({ event: "flags_bulk_update", data });
      } catch (err) {
        console.error("Failed to parse flags_bulk_update event:", err);
      }
    });

    eventSource.addEventListener("heartbeat", (e) => {
      try {
        const data = JSON.parse(e.data);
        handleSSEEvent({ event: "heartbeat", data });
      } catch (err) {
        console.error("Failed to parse heartbeat event:", err);
      }
    });

    eventSource.addEventListener("reconnected", (e) => {
      try {
        const data = JSON.parse(e.data);
        handleSSEEvent({ event: "reconnected", data });
      } catch (err) {
        console.error("Failed to parse reconnected event:", err);
      }
    });

    eventSource.addEventListener("error", (e) => {
      if (e instanceof MessageEvent) {
        try {
          const data = JSON.parse(e.data);
          handleSSEEvent({ event: "error", data });
        } catch {
          // Not a JSON error event
        }
      }
    });

    eventSource.onerror = () => {
      setConnected(false);
      onConnectionChange?.(false);

      // Attempt reconnect with backoff
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        const delay =
          SSE_RECONNECT_DELAY_MS *
          Math.pow(2, reconnectAttemptsRef.current - 1);

        reconnectTimeoutRef.current = setTimeout(() => {
          connectSSE();
        }, delay);
      } else {
        // Fall back to polling after max reconnect attempts
        setConnectionMode("polling");
        setError("SSE connection failed, falling back to polling");
      }
    };
  }, [useSSE, flagFilter, handleSSEEvent, onConnectionChange]);

  // Reconnect function for manual reconnection
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    connectSSE();
  }, [connectSSE]);

  // CRUD operations
  const createFlag = useCallback(
    async (flag: FeatureFlagCreate): Promise<boolean> => {
      try {
        await fetchAPI("/api/admin/feature-flags", {
          method: "POST",
          body: JSON.stringify(flag),
        });
        // Flag will be pushed via SSE, but refresh as fallback
        if (connectionMode !== "sse") {
          await refreshFlags();
        }
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create feature flag";
        setError(message);
        return false;
      }
    },
    [refreshFlags, connectionMode],
  );

  const updateFlag = useCallback(
    async (name: string, updates: FeatureFlagUpdate): Promise<boolean> => {
      try {
        await fetchAPI(`/api/admin/feature-flags/${name}`, {
          method: "PATCH",
          body: JSON.stringify(updates),
        });
        // Flag will be pushed via SSE, but refresh as fallback
        if (connectionMode !== "sse") {
          await refreshFlags();
        }
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update feature flag";
        setError(message);
        return false;
      }
    },
    [refreshFlags, connectionMode],
  );

  const deleteFlag = useCallback(async (name: string): Promise<boolean> => {
    try {
      await fetchAPI(`/api/admin/feature-flags/${name}`, {
        method: "DELETE",
      });
      // Remove from local state immediately
      setFlags((prev) => prev.filter((f) => f.name !== name));
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete feature flag";
      setError(message);
      return false;
    }
  }, []);

  const toggleFlag = useCallback(
    async (name: string): Promise<boolean> => {
      const flag = flags.find((f) => f.name === name);
      if (!flag) return false;
      return updateFlag(name, { enabled: !flag.enabled });
    },
    [flags, updateFlag],
  );

  // Initial load
  useEffect(() => {
    setLoading(true);
    refreshFlags().finally(() => setLoading(false));
  }, [refreshFlags]);

  // Connect to SSE if enabled
  useEffect(() => {
    if (useSSE) {
      connectSSE();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [useSSE, connectSSE]);

  // Fallback polling when not connected via SSE
  useEffect(() => {
    if (!autoRefresh) return;
    if (connectionMode === "sse") return; // Don't poll when SSE is connected

    const interval = setInterval(() => {
      refreshFlags().catch(() => {
        // Error handling already done in refresh function
      });
    }, refreshIntervalMs);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshIntervalMs, refreshFlags, connectionMode]);

  const value = useMemo(
    () => ({
      flags,
      loading,
      error,
      lastUpdated,
      version,
      connected,
      connectionMode,
      reconnectCount,
      eventsReplayed,
      refreshFlags,
      createFlag,
      updateFlag,
      deleteFlag,
      toggleFlag,
      reconnect,
    }),
    [
      flags,
      loading,
      error,
      lastUpdated,
      version,
      connected,
      connectionMode,
      reconnectCount,
      eventsReplayed,
      refreshFlags,
      createFlag,
      updateFlag,
      deleteFlag,
      toggleFlag,
      reconnect,
    ],
  );

  return value;
}

// Export original hook name as alias for backward compatibility
export { useFeatureFlagsRealtime as useFeatureFlags };
