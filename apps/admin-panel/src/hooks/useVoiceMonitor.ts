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

// TT Pipeline Types
export interface TTSession {
  session_id: string;
  user_id: string;
  user_email?: string;
  state: "idle" | "listening" | "thinking" | "speaking";
  connected_at: string;
  last_activity: string;
  thinker_model?: string;
  talker_voice?: string;
  messages_processed: number;
  avg_response_time_ms?: number;
}

export interface TTContext {
  context_id: string;
  session_id: string;
  user_id: string;
  created_at: string;
  last_accessed: string;
  message_count: number;
  token_count: number;
  expires_at: string;
}

export interface QualityPreset {
  name: string;
  description: string;
  tts_model: string;
  voice_id: string;
  speed: number;
  is_default: boolean;
}

export interface TTAnalytics {
  total_tool_calls_24h: number;
  avg_tool_latency_ms: number;
  tool_success_rate: number;
  tools_by_frequency: Record<string, number>;
  kb_calls_24h: number;
  kb_avg_latency_ms: number;
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
  // TT Pipeline data
  ttSessions: TTSession[];
  ttContexts: TTContext[];
  qualityPresets: QualityPreset[];
  ttAnalytics: TTAnalytics | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  refreshSessions: () => Promise<void>;
  refreshMetrics: () => Promise<void>;
  refreshHealth: () => Promise<void>;
  refreshTTPipeline: () => Promise<void>;
  refreshAll: () => Promise<void>;
  disconnectSession: (sessionId: string) => Promise<boolean>;
  cleanupContexts: () => Promise<number>;
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
  // TT Pipeline state
  const [ttSessions, setTTSessions] = useState<TTSession[]>([]);
  const [ttContexts, setTTContexts] = useState<TTContext[]>([]);
  const [qualityPresets, setQualityPresets] = useState<QualityPreset[]>([]);
  const [ttAnalytics, setTTAnalytics] = useState<TTAnalytics | null>(null);
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

  const refreshTTPipeline = useCallback(async () => {
    try {
      const [ttSessionsData, ttContextsData, presetsData, analyticsData] =
        await Promise.all([
          fetchAPI<{ sessions: TTSession[]; total: number }>(
            "/api/admin/voice/tt-sessions",
          ).catch(() => ({ sessions: [], total: 0 })),
          fetchAPI<{ contexts: TTContext[]; total: number }>(
            "/api/admin/voice/contexts",
          ).catch(() => ({ contexts: [], total: 0 })),
          fetchAPI<{ presets: QualityPreset[] }>(
            "/api/admin/voice/quality-presets",
          ).catch(() => ({ presets: [] })),
          fetchAPI<TTAnalytics>("/api/admin/voice/analytics/tools").catch(
            () => null,
          ),
        ]);

      setTTSessions(ttSessionsData.sessions);
      setTTContexts(ttContextsData.contexts);
      setQualityPresets(presetsData.presets);
      setTTAnalytics(analyticsData);
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      // TT pipeline errors are non-fatal, just log them
      console.warn("Failed to load TT pipeline data:", err);
    }
  }, []);

  const cleanupContexts = useCallback(async (): Promise<number> => {
    try {
      const data = await fetchAPI<{ cleaned_count: number }>(
        "/api/admin/voice/contexts/cleanup",
        { method: "POST" },
      );
      await refreshTTPipeline();
      return data.cleaned_count;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to cleanup contexts";
      setError(message);
      return 0;
    }
  }, [refreshTTPipeline]);

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

      // Also refresh TT pipeline data (non-blocking)
      refreshTTPipeline().catch(() => {});
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load voice data";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [refreshTTPipeline]);

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
      ttSessions,
      ttContexts,
      qualityPresets,
      ttAnalytics,
      loading,
      error,
      lastUpdated,
      refreshSessions,
      refreshMetrics,
      refreshHealth,
      refreshTTPipeline,
      refreshAll,
      disconnectSession,
      cleanupContexts,
    }),
    [
      sessions,
      metrics,
      health,
      config,
      ttSessions,
      ttContexts,
      qualityPresets,
      ttAnalytics,
      loading,
      error,
      lastUpdated,
      refreshSessions,
      refreshMetrics,
      refreshHealth,
      refreshTTPipeline,
      refreshAll,
      disconnectSession,
      cleanupContexts,
    ],
  );

  return value;
}
