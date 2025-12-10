import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAPI } from "../lib/api";

// Types for Troubleshooting Admin API
export interface LogEntry {
  timestamp: string;
  level: "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  service: string;
  trace_id?: string;
  message: string;
  extra?: Record<string, unknown>;
}

export interface ErrorSummary {
  error_type: string;
  count: number;
  last_occurrence: string;
  affected_services: string[];
  sample_trace_id?: string;
  sample_message?: string;
}

export interface ServiceHealthStatus {
  service_name: string;
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  last_check_at: string;
  latency_ms?: number;
  error_message?: string;
  details: Record<string, unknown>;
}

export interface DependencyHealth {
  name: string;
  type: string;
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  latency_ms?: number;
  version?: string;
  details: Record<string, unknown>;
}

export interface LogFilters {
  service?: string;
  level?: string;
  search?: string;
  since_hours?: number;
  limit?: number;
}

export interface HealthSummary {
  total: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  overall_status: "healthy" | "degraded" | "unhealthy";
}

interface UseTroubleshootingOptions {
  refreshIntervalMs?: number;
  autoRefresh?: boolean;
}

interface UseTroubleshootingState {
  logs: LogEntry[];
  errorSummary: ErrorSummary[];
  totalErrors24h: number;
  services: ServiceHealthStatus[];
  servicesSummary: HealthSummary | null;
  dependencies: DependencyHealth[];
  dependenciesSummary: HealthSummary | null;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  availableServices: string[];
  availableLevels: string[];
  refreshLogs: (filters?: LogFilters) => Promise<void>;
  refreshErrorSummary: () => Promise<void>;
  refreshServices: () => Promise<void>;
  refreshDependencies: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

const DEFAULT_REFRESH_MS = 30000;

export function useTroubleshooting(
  options: UseTroubleshootingOptions = {},
): UseTroubleshootingState {
  const refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_MS;
  const autoRefresh = options.autoRefresh ?? true;

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [errorSummary, setErrorSummary] = useState<ErrorSummary[]>([]);
  const [totalErrors24h, setTotalErrors24h] = useState(0);
  const [services, setServices] = useState<ServiceHealthStatus[]>([]);
  const [servicesSummary, setServicesSummary] = useState<HealthSummary | null>(
    null,
  );
  const [dependencies, setDependencies] = useState<DependencyHealth[]>([]);
  const [dependenciesSummary, setDependenciesSummary] =
    useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [availableServices, setAvailableServices] = useState<string[]>([]);
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);

  const refreshLogs = useCallback(async (filters: LogFilters = {}) => {
    try {
      const params = new URLSearchParams();
      if (filters.service) params.set("service", filters.service);
      if (filters.level) params.set("level", filters.level);
      if (filters.search) params.set("search", filters.search);
      if (filters.since_hours)
        params.set("since_hours", String(filters.since_hours));
      if (filters.limit) params.set("limit", String(filters.limit));

      const url = `/api/admin/logs${params.toString() ? `?${params}` : ""}`;
      const data = await fetchAPI<{
        logs: LogEntry[];
        count: number;
        available_services: string[];
        available_levels: string[];
      }>(url);

      setLogs(data.logs);
      setAvailableServices(data.available_services);
      setAvailableLevels(data.available_levels);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load logs";
      setError(message);
    }
  }, []);

  const refreshErrorSummary = useCallback(async () => {
    try {
      const data = await fetchAPI<{
        errors: ErrorSummary[];
        total_errors_24h: number;
        error_types_count: number;
      }>("/api/admin/logs/errors/summary");

      setErrorSummary(data.errors);
      setTotalErrors24h(data.total_errors_24h);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load error summary";
      setError(message);
    }
  }, []);

  const refreshServices = useCallback(async () => {
    try {
      const data = await fetchAPI<{
        services: ServiceHealthStatus[];
        summary: HealthSummary;
      }>("/api/admin/health/services");

      setServices(data.services);
      setServicesSummary(data.summary);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load service health";
      setError(message);
    }
  }, []);

  const refreshDependencies = useCallback(async () => {
    try {
      const data = await fetchAPI<{
        dependencies: DependencyHealth[];
        summary: HealthSummary;
      }>("/api/admin/health/dependencies");

      setDependencies(data.dependencies);
      setDependenciesSummary(data.summary);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load dependency health";
      setError(message);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        refreshLogs({ limit: 100 }),
        refreshErrorSummary(),
        refreshServices(),
        refreshDependencies(),
      ]);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to load troubleshooting data";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [refreshLogs, refreshErrorSummary, refreshServices, refreshDependencies]);

  // Initial load
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Auto-refresh health checks
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      Promise.all([refreshServices(), refreshDependencies()]).catch(() => {
        // Error handling already done in refresh functions
      });
    }, refreshIntervalMs);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshIntervalMs, refreshServices, refreshDependencies]);

  const value = useMemo(
    () => ({
      logs,
      errorSummary,
      totalErrors24h,
      services,
      servicesSummary,
      dependencies,
      dependenciesSummary,
      loading,
      error,
      lastUpdated,
      availableServices,
      availableLevels,
      refreshLogs,
      refreshErrorSummary,
      refreshServices,
      refreshDependencies,
      refreshAll,
    }),
    [
      logs,
      errorSummary,
      totalErrors24h,
      services,
      servicesSummary,
      dependencies,
      dependenciesSummary,
      loading,
      error,
      lastUpdated,
      availableServices,
      availableLevels,
      refreshLogs,
      refreshErrorSummary,
      refreshServices,
      refreshDependencies,
      refreshAll,
    ],
  );

  return value;
}
