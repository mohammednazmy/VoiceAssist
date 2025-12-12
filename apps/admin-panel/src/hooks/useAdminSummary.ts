import { useEffect, useState, useCallback, useRef } from "react";
import { fetchAPI } from "../lib/api";
import type { APIErrorShape } from "../types";

export interface AdminSummary {
  total_users: number;
  active_users: number;
  admin_users: number;
  timestamp: string;
}

interface UseAdminSummaryOptions {
  /** Auto-refresh interval in ms (default: 60000 = 1 minute, 0 = disabled) */
  refreshInterval?: number;
  /** Enable auto-refresh (default: true) */
  autoRefresh?: boolean;
}

export function useAdminSummary(options: UseAdminSummaryOptions = {}) {
  const { refreshInterval = 60000, autoRefresh = true } = options;

  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<APIErrorShape | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  const load = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      setError(null);

      try {
        const data = await fetchAPI<AdminSummary>("/api/admin/panel/summary");
        if (isMountedRef.current) {
          setSummary(data);
          setLastFetched(new Date());
          setFetchCount((prev) => prev + 1);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.warn("Admin summary fetch failed, using demo values:", message);
        if (isMountedRef.current) {
          setError({ code: "demo", message });
          // Only set demo data on first load failure, not on refresh failures
          if (!summary) {
            setSummary({
              total_users: 3,
              active_users: 3,
              admin_users: 1,
              timestamp: new Date().toISOString(),
            });
          }
        }
      } finally {
        if (isMountedRef.current && showLoading) setLoading(false);
      }
    },
    [summary],
  );

  // Manual refetch (always shows loading)
  const refetch = useCallback(() => {
    return load(true);
  }, [load]);

  // Silent refresh (no loading indicator)
  const silentRefresh = useCallback(() => {
    return load(false);
  }, [load]);

  // Initial load
  useEffect(() => {
    isMountedRef.current = true;
    load(true);

    return () => {
      isMountedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      silentRefresh();
    }, refreshInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, refreshInterval, silentRefresh]);

  // Check if data is stale (older than refresh interval)
  const isStale = lastFetched
    ? Date.now() - lastFetched.getTime() > refreshInterval
    : false;

  return {
    summary,
    loading,
    error,
    refetch,
    silentRefresh,
    lastFetched,
    fetchCount,
    isStale,
  };
}
