import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAPI } from "../lib/api";

// Types for Tools Admin API
export interface ToolStatus {
  tool_name: string;
  display_name: string;
  description: string;
  enabled: boolean;
  category:
    | "calendar"
    | "file"
    | "medical"
    | "calculation"
    | "search"
    | "email"
    | "integration";
  total_calls_24h: number;
  success_rate: number;
  avg_duration_ms: number;
  last_error?: string;
  last_error_at?: string;
  phi_enabled: boolean;
  requires_confirmation: boolean;
}

export interface ToolConfiguration {
  tool_name: string;
  enabled: boolean;
  timeout_seconds: number;
  rate_limit_per_user: number;
  rate_limit_window_seconds: number;
  requires_confirmation: boolean;
  phi_enabled: boolean;
  custom_settings: Record<string, unknown>;
}

export interface ToolInvocationLog {
  id: string;
  tool_name: string;
  user_email: string;
  session_id: string;
  call_id: string;
  arguments: Record<string, unknown>;
  status: "completed" | "failed" | "timeout" | "cancelled";
  duration_ms: number;
  phi_detected: boolean;
  confirmation_required: boolean;
  user_confirmed?: boolean;
  error_code?: string;
  error_message?: string;
  created_at: string;
}

export interface ToolAnalytics {
  tool_name: string;
  display_name: string;
  category: string;
  total_calls: number;
  success_count: number;
  failure_count: number;
  timeout_count: number;
  cancelled_count: number;
  success_rate: number;
  avg_duration_ms: number;
  p95_duration_ms: number;
  phi_detected_count: number;
  confirmation_required_count: number;
}

export interface ToolsSummary {
  total: number;
  enabled_count: number;
  disabled_count: number;
  total_calls_24h: number;
  categories: string[];
}

export interface AnalyticsSummary {
  total_calls: number;
  total_success: number;
  total_failures: number;
  total_phi_detected: number;
  overall_success_rate: number;
}

interface UseToolsOptions {
  refreshIntervalMs?: number;
  autoRefresh?: boolean;
}

interface UseToolsState {
  tools: ToolStatus[];
  summary: ToolsSummary | null;
  logs: ToolInvocationLog[];
  analytics: ToolAnalytics[];
  analyticsSummary: AnalyticsSummary | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  refreshTools: () => Promise<void>;
  refreshLogs: (filters?: LogFilters) => Promise<void>;
  refreshAnalytics: () => Promise<void>;
  refreshAll: () => Promise<void>;
  updateToolConfig: (
    toolName: string,
    config: Partial<ToolConfiguration>,
  ) => Promise<boolean>;
}

export interface LogFilters {
  tool_name?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

const DEFAULT_REFRESH_MS = 30000;

export function useTools(options: UseToolsOptions = {}): UseToolsState {
  const refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_MS;
  const autoRefresh = options.autoRefresh ?? false;

  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [summary, setSummary] = useState<ToolsSummary | null>(null);
  const [logs, setLogs] = useState<ToolInvocationLog[]>([]);
  const [analytics, setAnalytics] = useState<ToolAnalytics[]>([]);
  const [analyticsSummary, setAnalyticsSummary] =
    useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const refreshTools = useCallback(async () => {
    try {
      const data = await fetchAPI<{
        tools: ToolStatus[];
        total: number;
        enabled_count: number;
        disabled_count: number;
        total_calls_24h: number;
        categories: string[];
      }>("/api/admin/tools");

      setTools(data.tools);
      setSummary({
        total: data.total,
        enabled_count: data.enabled_count,
        disabled_count: data.disabled_count,
        total_calls_24h: data.total_calls_24h,
        categories: data.categories,
      });
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load tools";
      setError(message);
    }
  }, []);

  const refreshLogs = useCallback(async (filters: LogFilters = {}) => {
    try {
      const params = new URLSearchParams();
      if (filters.tool_name) params.set("tool_name", filters.tool_name);
      if (filters.status) params.set("status", filters.status);
      if (filters.limit) params.set("limit", String(filters.limit));
      if (filters.offset) params.set("offset", String(filters.offset));

      const url = `/api/admin/tools/logs${params.toString() ? `?${params}` : ""}`;
      const data = await fetchAPI<{ logs: ToolInvocationLog[]; count: number }>(
        url,
      );

      setLogs(data.logs);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load tool logs";
      setError(message);
    }
  }, []);

  const refreshAnalytics = useCallback(async () => {
    try {
      const data = await fetchAPI<{
        tools: ToolAnalytics[];
        summary: AnalyticsSummary;
        by_category: Record<
          string,
          { calls: number; success: number; failures: number }
        >;
      }>("/api/admin/tools/analytics");

      setAnalytics(data.tools);
      setAnalyticsSummary(data.summary);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load tool analytics";
      setError(message);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([refreshTools(), refreshLogs(), refreshAnalytics()]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load tools data";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [refreshTools, refreshLogs, refreshAnalytics]);

  const updateToolConfig = useCallback(
    async (
      toolName: string,
      config: Partial<ToolConfiguration>,
    ): Promise<boolean> => {
      try {
        await fetchAPI(`/api/admin/tools/${toolName}`, {
          method: "PATCH",
          body: JSON.stringify(config),
        });
        // Refresh tools after update
        await refreshTools();
        return true;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to update tool configuration";
        setError(message);
        return false;
      }
    },
    [refreshTools],
  );

  // Initial load
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      refreshTools().catch(() => {
        // Error handling already done in refresh function
      });
    }, refreshIntervalMs);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshIntervalMs, refreshTools]);

  const value = useMemo(
    () => ({
      tools,
      summary,
      logs,
      analytics,
      analyticsSummary,
      loading,
      error,
      lastUpdated,
      refreshTools,
      refreshLogs,
      refreshAnalytics,
      refreshAll,
      updateToolConfig,
    }),
    [
      tools,
      summary,
      logs,
      analytics,
      analyticsSummary,
      loading,
      error,
      lastUpdated,
      refreshTools,
      refreshLogs,
      refreshAnalytics,
      refreshAll,
      updateToolConfig,
    ],
  );

  return value;
}
