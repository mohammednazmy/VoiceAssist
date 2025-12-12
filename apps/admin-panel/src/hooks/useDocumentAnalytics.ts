/**
 * useDocumentAnalytics hook
 * Fetches document and voice navigation analytics for the admin dashboard
 */

import { useCallback, useEffect, useState } from "react";
import { fetchAPI } from "../lib/api";

export interface DocumentAnalytics {
  period_days: number;
  timestamp: string;
  documents: {
    total: number;
    by_source: Record<string, number>;
    by_status: Record<string, number>;
    with_toc: number;
    with_figures: number;
    with_pages: number;
    total_pages: number;
    user_uploaded: number;
    public: number;
    recent_uploads: number;
  };
  voice_navigation: {
    total_sessions: number;
    active_sessions: number;
    sessions_in_period: number;
    unique_users_in_period: number;
    avg_pages_navigated: number;
    popular_documents: Array<{
      document_id: string;
      title: string;
      session_count: number;
    }>;
  };
}

interface UseDocumentAnalyticsOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
  days?: number;
}

interface UseDocumentAnalyticsReturn {
  analytics: DocumentAnalytics | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useDocumentAnalytics(
  options: UseDocumentAnalyticsOptions = {},
): UseDocumentAnalyticsReturn {
  const { autoRefresh = false, refreshInterval = 60000, days = 7 } = options;

  const [analytics, setAnalytics] = useState<DocumentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchAPI<{ data: DocumentAnalytics }>(
        `/api/admin/kb/analytics?days=${days}`,
      );
      setAnalytics(response.data);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to fetch document analytics";
      setError(message);
      console.error("Failed to fetch document analytics:", err);
    } finally {
      setLoading(false);
    }
  }, [days]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      refresh();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, refresh]);

  return {
    analytics,
    loading,
    error,
    refresh,
  };
}
