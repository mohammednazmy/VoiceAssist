/**
 * useModelAnalytics hook for Sprint 4 Analytics
 * Manages fetching model usage metrics, search stats, and cost tracking
 */

import { useCallback, useEffect, useState } from "react";
import { fetchAPI } from "../lib/api";

export interface ModelInfo {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "local";
  type: "chat" | "embedding" | "tts" | "stt";
  enabled: boolean;
  is_primary: boolean;
  supports_phi: boolean;
  context_window: number;
  cost_per_1k_input: number;
  cost_per_1k_output: number;
}

export interface ModelBreakdown {
  model_id: string;
  model_name: string;
  provider: string;
  requests: number;
  tokens_input: number;
  tokens_output: number;
  estimated_cost: number;
  avg_latency_ms: number;
}

export interface ModelUsageMetrics {
  total_requests_24h: number;
  total_tokens_input_24h: number;
  total_tokens_output_24h: number;
  estimated_cost_24h: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  error_rate: number;
  cloud_requests: number;
  local_requests: number;
  cloud_percentage: number;
  model_breakdown: ModelBreakdown[];
  period_days: number;
  timestamp: string;
}

export interface SearchStats {
  total_searches_24h: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  cache_hit_rate: number;
  top_queries: Array<{ query: string; count: number }>;
  search_types: {
    semantic: number;
    keyword: number;
    hybrid: number;
  };
  no_results_rate: number;
  period_days: number;
  timestamp: string;
}

export interface EmbeddingStats {
  total_documents: number;
  total_chunks: number;
  total_embeddings: number;
  embedding_dimensions: number;
  index_size_mb: number;
  last_indexed_at?: string;
  timestamp: string;
}

export interface ModelRoutingConfig {
  phi_detection_enabled: boolean;
  phi_route_to_local: boolean;
  default_chat_model: string;
  default_embedding_model: string;
  fallback_enabled: boolean;
  fallback_model?: string;
  timestamp: string;
}

interface UseModelAnalyticsOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
  days?: number;
}

interface UseModelAnalyticsReturn {
  // Data
  models: ModelInfo[];
  metrics: ModelUsageMetrics | null;
  searchStats: SearchStats | null;
  embeddingStats: EmbeddingStats | null;
  routingConfig: ModelRoutingConfig | null;

  // Loading states
  loading: boolean;
  metricsLoading: boolean;
  searchStatsLoading: boolean;

  // Error state
  error: string | null;

  // Actions
  refresh: () => Promise<void>;
  refreshMetrics: () => Promise<void>;
  refreshSearchStats: () => Promise<void>;
  updateRouting: (updates: Partial<ModelRoutingConfig>) => Promise<boolean>;
}

export function useModelAnalytics(
  options: UseModelAnalyticsOptions = {},
): UseModelAnalyticsReturn {
  const { autoRefresh = false, refreshInterval = 30000, days = 1 } = options;

  // Data state
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [metrics, setMetrics] = useState<ModelUsageMetrics | null>(null);
  const [searchStats, setSearchStats] = useState<SearchStats | null>(null);
  const [embeddingStats, setEmbeddingStats] = useState<EmbeddingStats | null>(
    null,
  );
  const [routingConfig, setRoutingConfig] = useState<ModelRoutingConfig | null>(
    null,
  );

  // Loading states
  const [loading, setLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [searchStatsLoading, setSearchStatsLoading] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Fetch all models
  const fetchModels = useCallback(async () => {
    try {
      const response = await fetchAPI<{ data: { models: ModelInfo[] } }>(
        "/api/admin/medical/models",
      );
      setModels(response.data.models);
    } catch (err) {
      console.error("Failed to fetch models:", err);
    }
  }, []);

  // Fetch metrics
  const refreshMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const response = await fetchAPI<{ data: ModelUsageMetrics }>(
        `/api/admin/medical/metrics?days=${days}`,
      );
      setMetrics(response.data);
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch metrics";
      setError(message);
    } finally {
      setMetricsLoading(false);
    }
  }, [days]);

  // Fetch search stats
  const refreshSearchStats = useCallback(async () => {
    setSearchStatsLoading(true);
    try {
      const response = await fetchAPI<{ data: SearchStats }>(
        `/api/admin/medical/search/stats?days=${days}`,
      );
      setSearchStats(response.data);
    } catch (err) {
      console.error("Failed to fetch search stats:", err);
    } finally {
      setSearchStatsLoading(false);
    }
  }, [days]);

  // Fetch embedding stats
  const fetchEmbeddingStats = useCallback(async () => {
    try {
      const response = await fetchAPI<{ data: EmbeddingStats }>(
        "/api/admin/medical/embeddings/stats",
      );
      setEmbeddingStats(response.data);
    } catch (err) {
      console.error("Failed to fetch embedding stats:", err);
    }
  }, []);

  // Fetch routing config
  const fetchRoutingConfig = useCallback(async () => {
    try {
      const response = await fetchAPI<{ data: ModelRoutingConfig }>(
        "/api/admin/medical/routing",
      );
      setRoutingConfig(response.data);
    } catch (err) {
      console.error("Failed to fetch routing config:", err);
    }
  }, []);

  // Refresh all data
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchModels(),
        refreshMetrics(),
        refreshSearchStats(),
        fetchEmbeddingStats(),
        fetchRoutingConfig(),
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to refresh data";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [
    fetchModels,
    refreshMetrics,
    refreshSearchStats,
    fetchEmbeddingStats,
    fetchRoutingConfig,
  ]);

  // Update routing configuration
  const updateRouting = useCallback(
    async (updates: Partial<ModelRoutingConfig>): Promise<boolean> => {
      try {
        await fetchAPI("/api/admin/medical/routing", {
          method: "PATCH",
          body: JSON.stringify(updates),
        });
        await fetchRoutingConfig();
        return true;
      } catch (err) {
        console.error("Failed to update routing:", err);
        return false;
      }
    },
    [fetchRoutingConfig],
  );

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      refreshMetrics();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, refreshMetrics]);

  return {
    models,
    metrics,
    searchStats,
    embeddingStats,
    routingConfig,
    loading,
    metricsLoading,
    searchStatsLoading,
    error,
    refresh,
    refreshMetrics,
    refreshSearchStats,
    updateRouting,
  };
}
