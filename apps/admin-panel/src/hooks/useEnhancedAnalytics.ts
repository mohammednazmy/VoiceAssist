/**
 * useEnhancedAnalytics hook
 * Connects to the new analytics service endpoints for comprehensive dashboard data
 */

import { useCallback, useEffect, useState } from "react";
import { fetchAPI } from "../lib/api";

// Types matching the backend AnalyticsService responses

export interface AnalyticsOverview {
  period: {
    start: string;
    end: string;
    days: number;
  };
  metrics_summary: {
    total_api_calls: number;
    total_users: number;
    total_documents: number;
    total_searches: number;
    success_rate: number;
    avg_response_time_ms: number;
  };
  cost_summary: {
    total_cost_cents: number;
    total_cost_dollars: number;
    by_service: Record<string, number>;
  };
  system_health: {
    status: "healthy" | "degraded" | "unhealthy";
    services: Array<{
      name: string;
      status: string;
      latency_ms: number;
    }>;
  };
}

export interface UsageTrend {
  date: string;
  hour?: string;
  total_count: number;
  success_count: number;
  error_count: number;
  success_rate: number;
  avg_duration_ms: number;
}

export interface UsageComparison {
  current_period: {
    start: string;
    end: string;
    total_count: number;
    success_rate: number;
    avg_duration_ms: number;
  };
  previous_period: {
    start: string;
    end: string;
    total_count: number;
    success_rate: number;
    avg_duration_ms: number;
  };
  changes: {
    total_count_change: number;
    total_count_percent: number;
    success_rate_change: number;
    duration_change_ms: number;
  };
}

export interface UserEngagement {
  period_days: number;
  total_active_users: number;
  new_users: number;
  returning_users: number;
  avg_sessions_per_user: number;
  avg_messages_per_user: number;
  avg_session_duration_minutes: number;
  feature_usage: Record<string, number>;
}

export interface TopUser {
  user_id: string;
  email?: string;
  display_name?: string;
  sessions_count: number;
  messages_sent: number;
  voice_minutes: number;
  total_active_minutes: number;
  last_activity_at: string;
}

export interface DocumentInsight {
  document_id: string;
  title?: string;
  views_count: number;
  unique_viewers: number;
  search_appearances: number;
  citation_count: number;
  voice_reads: number;
  avg_relevance_score: number;
  helpfulness_percent: number;
}

export interface SearchInsight {
  query_text: string;
  search_count: number;
  avg_results_count: number;
  avg_duration_ms: number;
  click_through_rate: number;
  zero_results_rate: number;
}

export interface SystemHealth {
  overall_status: "healthy" | "degraded" | "unhealthy";
  services: Array<{
    name: string;
    status: string;
    cpu_percent?: number;
    memory_percent?: number;
    latency_p50_ms?: number;
    latency_p95_ms?: number;
    error_rate_percent?: number;
  }>;
  recent_errors: Array<{
    id: string;
    error_type: string;
    error_message: string;
    occurrence_count: number;
    first_seen: string;
    last_seen: string;
    is_resolved: boolean;
  }>;
}

export interface CostBreakdown {
  period_days: number;
  total_cost_cents: number;
  total_cost_dollars: number;
  by_service: Array<{
    service_type: string;
    cost_cents: number;
    cost_dollars: number;
    usage_units: number;
    usage_unit_type: string;
  }>;
  daily_costs: Array<{
    date: string;
    cost_cents: number;
    cost_dollars: number;
  }>;
}

interface UseEnhancedAnalyticsOptions {
  days?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface UseEnhancedAnalyticsReturn {
  // Data
  overview: AnalyticsOverview | null;
  usageTrends: UsageTrend[];
  usageComparison: UsageComparison | null;
  userEngagement: UserEngagement | null;
  topUsers: TopUser[];
  documentInsights: DocumentInsight[];
  searchInsights: SearchInsight[];
  systemHealth: SystemHealth | null;
  costBreakdown: CostBreakdown | null;

  // Loading states
  loading: boolean;
  overviewLoading: boolean;
  trendsLoading: boolean;
  usersLoading: boolean;
  healthLoading: boolean;
  costsLoading: boolean;

  // Error state
  error: string | null;

  // Actions
  refresh: () => Promise<void>;
  refreshOverview: () => Promise<void>;
  refreshTrends: (metricType?: string, granularity?: string) => Promise<void>;
  refreshUserEngagement: () => Promise<void>;
  refreshSystemHealth: () => Promise<void>;
  refreshCosts: () => Promise<void>;
  resolveError: (errorId: string) => Promise<boolean>;
}

export function useEnhancedAnalytics(
  options: UseEnhancedAnalyticsOptions = {}
): UseEnhancedAnalyticsReturn {
  const { days = 7, autoRefresh = false, refreshInterval = 60000 } = options;

  // Data state
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [usageTrends, setUsageTrends] = useState<UsageTrend[]>([]);
  const [usageComparison, setUsageComparison] =
    useState<UsageComparison | null>(null);
  const [userEngagement, setUserEngagement] = useState<UserEngagement | null>(
    null
  );
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [documentInsights, setDocumentInsights] = useState<DocumentInsight[]>(
    []
  );
  const [searchInsights, setSearchInsights] = useState<SearchInsight[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdown | null>(
    null
  );

  // Loading states
  const [loading, setLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [costsLoading, setCostsLoading] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Fetch overview
  const refreshOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const response = await fetchAPI<{ data: AnalyticsOverview }>(
        `/api/admin/analytics/overview?days=${days}`
      );
      setOverview(response.data);
      setError(null);
    } catch (err) {
      console.warn("Failed to fetch analytics overview:", err);
    } finally {
      setOverviewLoading(false);
    }
  }, [days]);

  // Fetch usage trends
  const refreshTrends = useCallback(
    async (metricType = "api_calls", granularity = "daily") => {
      setTrendsLoading(true);
      try {
        const [trendsResponse, comparisonResponse] = await Promise.all([
          fetchAPI<{ data: UsageTrend[] }>(
            `/api/admin/analytics/usage/trends?days=${days}&metric_type=${metricType}&granularity=${granularity}`
          ),
          fetchAPI<{ data: UsageComparison }>(
            `/api/admin/analytics/usage/comparison?days=${days}&metric_type=${metricType}`
          ),
        ]);
        setUsageTrends(trendsResponse.data);
        setUsageComparison(comparisonResponse.data);
      } catch (err) {
        console.warn("Failed to fetch usage trends:", err);
      } finally {
        setTrendsLoading(false);
      }
    },
    [days]
  );

  // Fetch user engagement
  const refreshUserEngagement = useCallback(async () => {
    setUsersLoading(true);
    try {
      const [engagementResponse, topUsersResponse] = await Promise.all([
        fetchAPI<{ data: UserEngagement }>(
          `/api/admin/analytics/users/engagement?days=${days}`
        ),
        fetchAPI<{ data: TopUser[] }>(
          `/api/admin/analytics/users/top?days=${days}&limit=10`
        ),
      ]);
      setUserEngagement(engagementResponse.data);
      setTopUsers(topUsersResponse.data);
    } catch (err) {
      console.warn("Failed to fetch user engagement:", err);
    } finally {
      setUsersLoading(false);
    }
  }, [days]);

  // Fetch document and search insights
  const refreshInsights = useCallback(async () => {
    try {
      const [docsResponse, searchResponse] = await Promise.all([
        fetchAPI<{ data: DocumentInsight[] }>(
          `/api/admin/analytics/documents/insights?days=${days}&limit=10`
        ),
        fetchAPI<{ data: SearchInsight[] }>(
          `/api/admin/analytics/search/insights?days=${days}&limit=10`
        ),
      ]);
      setDocumentInsights(docsResponse.data);
      setSearchInsights(searchResponse.data);
    } catch (err) {
      console.warn("Failed to fetch insights:", err);
    }
  }, [days]);

  // Fetch system health
  const refreshSystemHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const response = await fetchAPI<{ data: SystemHealth }>(
        `/api/admin/analytics/system/health?hours=${days * 24}`
      );
      setSystemHealth(response.data);
    } catch (err) {
      console.warn("Failed to fetch system health:", err);
    } finally {
      setHealthLoading(false);
    }
  }, [days]);

  // Fetch cost breakdown
  const refreshCosts = useCallback(async () => {
    setCostsLoading(true);
    try {
      const response = await fetchAPI<{ data: CostBreakdown }>(
        `/api/admin/analytics/costs/breakdown?days=${days}`
      );
      setCostBreakdown(response.data);
    } catch (err) {
      console.warn("Failed to fetch cost breakdown:", err);
    } finally {
      setCostsLoading(false);
    }
  }, [days]);

  // Resolve an error
  const resolveError = useCallback(
    async (errorId: string): Promise<boolean> => {
      try {
        await fetchAPI(`/api/admin/analytics/system/errors/${errorId}/resolve`, {
          method: "POST",
        });
        await refreshSystemHealth();
        return true;
      } catch (err) {
        console.error("Failed to resolve error:", err);
        return false;
      }
    },
    [refreshSystemHealth]
  );

  // Refresh all data
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        refreshOverview(),
        refreshTrends(),
        refreshUserEngagement(),
        refreshInsights(),
        refreshSystemHealth(),
        refreshCosts(),
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to refresh analytics";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [
    refreshOverview,
    refreshTrends,
    refreshUserEngagement,
    refreshInsights,
    refreshSystemHealth,
    refreshCosts,
  ]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      refreshOverview();
      refreshSystemHealth();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, refreshOverview, refreshSystemHealth]);

  return {
    overview,
    usageTrends,
    usageComparison,
    userEngagement,
    topUsers,
    documentInsights,
    searchInsights,
    systemHealth,
    costBreakdown,
    loading,
    overviewLoading,
    trendsLoading,
    usersLoading,
    healthLoading,
    costsLoading,
    error,
    refresh,
    refreshOverview,
    refreshTrends,
    refreshUserEngagement,
    refreshSystemHealth,
    refreshCosts,
    resolveError,
  };
}
