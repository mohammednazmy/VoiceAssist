/**
 * useSystem hook for Sprint 4 System Management
 * Manages system resources, backup controls, and maintenance mode
 */

import { useCallback, useEffect, useState } from "react";
import { fetchAPI } from "../lib/api";

export interface ResourceMetrics {
  disk_total_gb: number;
  disk_used_gb: number;
  disk_free_gb: number;
  disk_usage_percent: number;
  memory_total_gb: number;
  memory_used_gb: number;
  memory_free_gb: number;
  memory_usage_percent: number;
  cpu_count: number;
  cpu_usage_percent: number;
  load_average_1m: number;
  load_average_5m: number;
  load_average_15m: number;
  timestamp: string;
}

export interface BackupStatus {
  last_backup_at?: string;
  last_backup_result: "success" | "failed" | "in_progress" | "unknown";
  backup_destination: string;
  schedule: string;
  retention_days: number;
  next_scheduled_at?: string;
  backup_size_mb?: number;
  timestamp: string;
}

export interface BackupHistoryEntry {
  id: string;
  started_at: string;
  completed_at?: string;
  status: "success" | "failed" | "in_progress";
  size_bytes?: number;
  backup_type: "full" | "incremental";
  error_message?: string;
}

export interface MaintenanceStatus {
  enabled: boolean;
  started_at?: string;
  started_by?: string;
  message?: string;
  estimated_end?: string;
  timestamp: string;
}

export interface SystemHealth {
  status: "healthy" | "degraded" | "unhealthy";
  uptime_seconds: number;
  services: Record<string, string>;
  last_checked_at: string;
}

export interface CacheNamespaceStats {
  namespace: string;
  key_count: number;
  estimated_size_bytes: number;
}

interface UseSystemOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface UseSystemReturn {
  // Data
  resources: ResourceMetrics | null;
  health: SystemHealth | null;
  backupStatus: BackupStatus | null;
  backupHistory: BackupHistoryEntry[];
  maintenanceStatus: MaintenanceStatus | null;
  cacheNamespaces: CacheNamespaceStats[];

  // Loading states
  loading: boolean;
  resourcesLoading: boolean;
  backupLoading: boolean;
  triggeringBackup: boolean;

  // Error state
  error: string | null;

  // Actions
  refresh: () => Promise<void>;
  refreshResources: () => Promise<void>;
  refreshBackup: () => Promise<void>;
  triggerBackup: (type: "full" | "incremental") => Promise<boolean>;
  enableMaintenance: (
    message?: string,
    durationMinutes?: number,
  ) => Promise<boolean>;
  disableMaintenance: () => Promise<boolean>;
  invalidateCacheNamespace: (namespace: string) => Promise<boolean>;
}

export function useSystem(options: UseSystemOptions = {}): UseSystemReturn {
  const { autoRefresh = false, refreshInterval = 30000 } = options;

  // Data state
  const [resources, setResources] = useState<ResourceMetrics | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [backupHistory, setBackupHistory] = useState<BackupHistoryEntry[]>([]);
  const [maintenanceStatus, setMaintenanceStatus] =
    useState<MaintenanceStatus | null>(null);
  const [cacheNamespaces, setCacheNamespaces] = useState<CacheNamespaceStats[]>(
    [],
  );

  // Loading states
  const [loading, setLoading] = useState(true);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [triggeringBackup, setTriggeringBackup] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Fetch system resources
  const refreshResources = useCallback(async () => {
    setResourcesLoading(true);
    try {
      const response = await fetchAPI<ResourceMetrics>(
        "/api/admin/system/resources",
      );
      setResources(response);
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch resources";
      setError(message);
    } finally {
      setResourcesLoading(false);
    }
  }, []);

  // Fetch system health
  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetchAPI<SystemHealth>("/api/admin/system/health");
      setHealth(response);
    } catch (err) {
      console.error("Failed to fetch health:", err);
    }
  }, []);

  // Fetch backup status and history
  const refreshBackup = useCallback(async () => {
    setBackupLoading(true);
    try {
      const [statusResponse, historyResponse] = await Promise.all([
        fetchAPI<BackupStatus>("/api/admin/system/backup/status"),
        fetchAPI<{ history: BackupHistoryEntry[] }>(
          "/api/admin/system/backup/history?limit=10",
        ),
      ]);
      setBackupStatus(statusResponse);
      setBackupHistory(historyResponse.history);
    } catch (err) {
      console.error("Failed to fetch backup data:", err);
    } finally {
      setBackupLoading(false);
    }
  }, []);

  // Fetch maintenance status
  const fetchMaintenance = useCallback(async () => {
    try {
      const response = await fetchAPI<MaintenanceStatus>(
        "/api/admin/system/maintenance",
      );
      setMaintenanceStatus(response);
    } catch (err) {
      console.error("Failed to fetch maintenance status:", err);
    }
  }, []);

  // Fetch cache namespaces
  const fetchCacheNamespaces = useCallback(async () => {
    try {
      const response = await fetchAPI<{ namespaces: CacheNamespaceStats[] }>(
        "/api/admin/cache/stats/namespaces",
      );
      setCacheNamespaces(response.namespaces);
    } catch (err) {
      console.error("Failed to fetch cache namespaces:", err);
    }
  }, []);

  // Refresh all data
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        refreshResources(),
        fetchHealth(),
        refreshBackup(),
        fetchMaintenance(),
        fetchCacheNamespaces(),
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to refresh data";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [
    refreshResources,
    fetchHealth,
    refreshBackup,
    fetchMaintenance,
    fetchCacheNamespaces,
  ]);

  // Trigger backup
  const triggerBackup = useCallback(
    async (type: "full" | "incremental"): Promise<boolean> => {
      setTriggeringBackup(true);
      try {
        await fetchAPI(`/api/admin/system/backup/trigger?backup_type=${type}`, {
          method: "POST",
        });
        await refreshBackup();
        return true;
      } catch (err) {
        console.error("Failed to trigger backup:", err);
        return false;
      } finally {
        setTriggeringBackup(false);
      }
    },
    [refreshBackup],
  );

  // Enable maintenance mode
  const enableMaintenance = useCallback(
    async (
      message: string = "System is under maintenance",
      durationMinutes: number = 30,
    ): Promise<boolean> => {
      try {
        await fetchAPI("/api/admin/system/maintenance/enable", {
          method: "POST",
          body: JSON.stringify({
            message,
            estimated_duration_minutes: durationMinutes,
          }),
        });
        await fetchMaintenance();
        return true;
      } catch (err) {
        console.error("Failed to enable maintenance:", err);
        return false;
      }
    },
    [fetchMaintenance],
  );

  // Disable maintenance mode
  const disableMaintenance = useCallback(async (): Promise<boolean> => {
    try {
      await fetchAPI("/api/admin/system/maintenance/disable", {
        method: "POST",
      });
      await fetchMaintenance();
      return true;
    } catch (err) {
      console.error("Failed to disable maintenance:", err);
      return false;
    }
  }, [fetchMaintenance]);

  // Invalidate cache namespace
  const invalidateCacheNamespace = useCallback(
    async (namespace: string): Promise<boolean> => {
      try {
        await fetchAPI(
          `/api/admin/cache/invalidate/namespace?namespace=${encodeURIComponent(namespace)}`,
          {
            method: "POST",
          },
        );
        await fetchCacheNamespaces();
        return true;
      } catch (err) {
        console.error("Failed to invalidate namespace:", err);
        return false;
      }
    },
    [fetchCacheNamespaces],
  );

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      refreshResources();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, refreshResources]);

  return {
    resources,
    health,
    backupStatus,
    backupHistory,
    maintenanceStatus,
    cacheNamespaces,
    loading,
    resourcesLoading,
    backupLoading,
    triggeringBackup,
    error,
    refresh,
    refreshResources,
    refreshBackup,
    triggerBackup,
    enableMaintenance,
    disableMaintenance,
    invalidateCacheNamespace,
  };
}
