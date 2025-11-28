import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAPI } from "../lib/api";

// Types for Voice Admin API
export interface VoiceSession {
  session_id: string;
  user_id: string;
  user_email?: string;
  connected_at: string;
  session_type: "text" | "voice" | "realtime";
  client_info: Record<string, unknown>;
  messages_count: number;
  last_activity?: string;
}

export interface VoiceSessionDetail extends VoiceSession {
  conversation_id?: string;
  voice?: string;
  language?: string;
  duration_seconds?: number;
  audio_format?: string;
}

export interface VoiceMetrics {
  active_sessions: number;
  total_sessions_24h: number;
  avg_session_duration_sec: number;
  stt_latency_p95_ms: number;
  tts_latency_p95_ms: number;
  error_rate_24h: number;
  connections_by_type: Record<string, number>;
  timestamp: string;
}

export interface VoiceHealth {
  status: "healthy" | "degraded" | "unhealthy";
  realtime_api_enabled: boolean;
  openai_api_configured: boolean;
  redis_connected: boolean;
  active_connections: number;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface VoiceConfig {
  default_voice: string;
  default_language: string;
  vad_enabled: boolean;
  vad_threshold: number;
  max_session_duration_sec: number;
  stt_provider: string;
  tts_provider: string;
  realtime_enabled: boolean;
  timestamp: string;
}

interface UseVoiceMonitorOptions {
  refreshIntervalMs?: number;
  autoRefresh?: boolean;
}

interface UseVoiceMonitorState {
  sessions: VoiceSession[];
  metrics: VoiceMetrics | null;
  health: VoiceHealth | null;
  config: VoiceConfig | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  refreshSessions: () => Promise<void>;
  refreshMetrics: () => Promise<void>;
  refreshHealth: () => Promise<void>;
  refreshAll: () => Promise<void>;
  disconnectSession: (sessionId: string) => Promise<boolean>;
}

const DEFAULT_REFRESH_MS = 10000;

export function useVoiceMonitor(
  options: UseVoiceMonitorOptions = {},
): UseVoiceMonitorState {
  const refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_MS;
  const autoRefresh = options.autoRefresh ?? true;

  const [sessions, setSessions] = useState<VoiceSession[]>([]);
  const [metrics, setMetrics] = useState<VoiceMetrics | null>(null);
  const [health, setHealth] = useState<VoiceHealth | null>(null);
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const refreshSessions = useCallback(async () => {
    try {
      const data = await fetchAPI<{ sessions: VoiceSession[]; total: number }>(
        "/api/admin/voice/sessions",
      );
      setSessions(data.sessions);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load voice sessions";
      setError(message);
    }
  }, []);

  const refreshMetrics = useCallback(async () => {
    try {
      const data = await fetchAPI<VoiceMetrics>("/api/admin/voice/metrics");
      setMetrics(data);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load voice metrics";
      setError(message);
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const data = await fetchAPI<VoiceHealth>("/api/admin/voice/health");
      setHealth(data);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load voice health";
      setError(message);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sessionsData, metricsData, healthData, configData] =
        await Promise.all([
          fetchAPI<{ sessions: VoiceSession[]; total: number }>(
            "/api/admin/voice/sessions",
          ),
          fetchAPI<VoiceMetrics>("/api/admin/voice/metrics"),
          fetchAPI<VoiceHealth>("/api/admin/voice/health"),
          fetchAPI<VoiceConfig>("/api/admin/voice/config"),
        ]);

      setSessions(sessionsData.sessions);
      setMetrics(metricsData);
      setHealth(healthData);
      setConfig(configData);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load voice data";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnectSession = useCallback(
    async (sessionId: string): Promise<boolean> => {
      try {
        await fetchAPI(`/api/admin/voice/sessions/${sessionId}/disconnect`, {
          method: "POST",
        });
        // Refresh sessions after disconnect
        await refreshSessions();
        return true;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to disconnect voice session";
        setError(message);
        return false;
      }
    },
    [refreshSessions],
  );

  // Initial load
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      // Only refresh sessions and metrics for live updates
      Promise.all([refreshSessions(), refreshMetrics()]).catch(() => {
        // Error handling already done in individual refresh functions
      });
    }, refreshIntervalMs);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshIntervalMs, refreshSessions, refreshMetrics]);

  const value = useMemo(
    () => ({
      sessions,
      metrics,
      health,
      config,
      loading,
      error,
      lastUpdated,
      refreshSessions,
      refreshMetrics,
      refreshHealth,
      refreshAll,
      disconnectSession,
    }),
    [
      sessions,
      metrics,
      health,
      config,
      loading,
      error,
      lastUpdated,
      refreshSessions,
      refreshMetrics,
      refreshHealth,
      refreshAll,
      disconnectSession,
    ],
  );

  return value;
}
