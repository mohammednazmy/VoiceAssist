/**
 * useIntegrations hook for Admin Integrations page
 * Manages fetching and testing of external integrations
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAPI } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

export type IntegrationStatus =
  | "connected"
  | "disconnected"
  | "error"
  | "degraded"
  | "not_configured";

export type IntegrationType =
  | "database"
  | "cache"
  | "vector_db"
  | "storage"
  | "llm"
  | "tts"
  | "stt"
  | "realtime"
  | "oauth"
  | "monitoring"
  | "external_api";

export interface IntegrationSummary {
  id: string;
  name: string;
  type: IntegrationType;
  status: IntegrationStatus;
  provider: string;
  last_checked?: string;
  error_message?: string;
}

export interface IntegrationConfig {
  host?: string;
  port?: number;
  enabled?: boolean;
  timeout_sec?: number;
  model?: string;
  endpoint?: string;
  extra?: Record<string, unknown>;
}

export interface IntegrationDetail {
  id: string;
  name: string;
  type: IntegrationType;
  status: IntegrationStatus;
  provider: string;
  description: string;
  config: IntegrationConfig;
  has_api_key: boolean;
  last_checked?: string;
  error_message?: string;
}

export interface IntegrationTestResult {
  success: boolean;
  latency_ms: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface IntegrationsHealth {
  overall_status: "healthy" | "degraded" | "unhealthy" | "critical";
  total_integrations: number;
  connected: number;
  degraded: number;
  errors: number;
  not_configured: number;
  checked_at: string;
}

interface UseIntegrationsOptions {
  autoRefresh?: boolean;
  refreshIntervalMs?: number;
}

interface UseIntegrationsResult {
  integrations: IntegrationSummary[];
  health: IntegrationsHealth | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refreshAll: () => Promise<void>;
  getIntegrationDetail: (id: string) => Promise<IntegrationDetail>;
  testIntegration: (id: string) => Promise<IntegrationTestResult>;
}

export function useIntegrations(
  options: UseIntegrationsOptions = {},
): UseIntegrationsResult {
  const { autoRefresh = false, refreshIntervalMs = 30000 } = options;
  const { token } = useAuth();

  const [integrations, setIntegrations] = useState<IntegrationSummary[]>([]);
  const [health, setHealth] = useState<IntegrationsHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchIntegrations = useCallback(async () => {
    try {
      const response = await fetchAPI<IntegrationSummary[]>(
        "/admin/integrations/",
        { method: "GET" },
        token,
      );
      setIntegrations(response);
      return response;
    } catch (err) {
      console.error("Failed to fetch integrations:", err);
      throw err;
    }
  }, [token]);

  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetchAPI<IntegrationsHealth>(
        "/admin/integrations/health",
        { method: "GET" },
        token,
      );
      setHealth(response);
      return response;
    } catch (err) {
      console.error("Failed to fetch integrations health:", err);
      throw err;
    }
  }, [token]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchIntegrations(), fetchHealth()]);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [fetchIntegrations, fetchHealth]);

  const getIntegrationDetail = useCallback(
    async (id: string): Promise<IntegrationDetail> => {
      const response = await fetchAPI<IntegrationDetail>(
        `/admin/integrations/${id}`,
        { method: "GET" },
        token,
      );
      return response;
    },
    [token],
  );

  const testIntegration = useCallback(
    async (id: string): Promise<IntegrationTestResult> => {
      const response = await fetchAPI<IntegrationTestResult>(
        `/admin/integrations/${id}/test`,
        { method: "POST" },
        token,
      );
      // Refresh the list after testing to update status
      await refreshAll();
      return response;
    },
    [token, refreshAll],
  );

  // Initial load
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const intervalId = setInterval(() => {
      refreshAll();
    }, refreshIntervalMs);

    return () => clearInterval(intervalId);
  }, [autoRefresh, refreshIntervalMs, refreshAll]);

  return useMemo(
    () => ({
      integrations,
      health,
      loading,
      error,
      lastUpdated,
      refreshAll,
      getIntegrationDetail,
      testIntegration,
    }),
    [
      integrations,
      health,
      loading,
      error,
      lastUpdated,
      refreshAll,
      getIntegrationDetail,
      testIntegration,
    ],
  );
}
