/**
 * Hook for fetching audit logs from the admin API
 */

import { useState, useCallback, useEffect } from "react";
import { getApiClient } from "../lib/apiClient";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  level: string;
  action: string;
  user_id: string | null;
  user_email: string | null;
  resource_type: string | null;
  resource_id: string | null;
  success: boolean;
  details: string | null;
  ip_address: string | null;
  request_id: string | null;
}

interface AuditLogsResponse {
  total: number;
  offset: number;
  limit: number;
  logs: AuditLogEntry[];
}

interface UseAuditLogsOptions {
  autoRefresh?: boolean;
  refreshIntervalMs?: number;
  limit?: number;
}

interface UseAuditLogsResult {
  logs: AuditLogEntry[];
  total: number;
  loading: boolean;
  error: string | null;
  offset: number;
  limit: number;
  refresh: () => Promise<void>;
  setOffset: (offset: number) => void;
  setActionFilter: (action: string | null) => void;
  actionFilter: string | null;
  exportLogs: () => Promise<void>;
}

export function useAuditLogs(
  options: UseAuditLogsOptions = {},
): UseAuditLogsResult {
  const {
    autoRefresh = false,
    refreshIntervalMs = 30000,
    limit = 50,
  } = options;

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [actionFilter, setActionFilter] = useState<string | null>(null);

  const apiClient = getApiClient();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("offset", offset.toString());
      params.set("limit", limit.toString());
      if (actionFilter) {
        params.set("action", actionFilter);
      }

      const response = await apiClient.request<{ data: AuditLogsResponse }>({
        method: "GET",
        url: `/api/admin/audit-logs?${params.toString()}`,
      });

      setLogs(response.data.logs);
      setTotal(response.data.total);
    } catch (err: any) {
      console.error("Failed to fetch audit logs:", err);
      setError("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [apiClient, offset, limit, actionFilter]);

  const exportLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (actionFilter) {
        params.set("action", actionFilter);
      }
      params.set("limit", "500");

      // Trigger CSV download
      const token = localStorage.getItem("auth_token");
      const baseUrl = apiClient.getBaseUrl();
      const url = `${baseUrl}/api/admin/audit-logs/export?${params.toString()}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Failed to export audit logs:", err);
      setError("Failed to export audit logs");
    }
  }, [apiClient, actionFilter]);

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchLogs, refreshIntervalMs);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshIntervalMs, fetchLogs]);

  return {
    logs,
    total,
    loading,
    error,
    offset,
    limit,
    refresh: fetchLogs,
    setOffset,
    setActionFilter,
    actionFilter,
    exportLogs,
  };
}
