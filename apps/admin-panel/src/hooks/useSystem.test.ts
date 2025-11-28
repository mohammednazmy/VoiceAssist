/**
 * Tests for useSystem hook - Sprint 4 System Management
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useSystem } from "./useSystem";

// Mock fetchAPI
vi.mock("../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

import { fetchAPI } from "../lib/api";

const mockResources = {
  data: {
    disk_total_gb: 500,
    disk_used_gb: 200,
    disk_free_gb: 300,
    disk_usage_percent: 40,
    memory_total_gb: 32,
    memory_used_gb: 16,
    memory_free_gb: 16,
    memory_usage_percent: 50,
    cpu_count: 8,
    cpu_usage_percent: 25,
    load_average_1m: 1.5,
    load_average_5m: 1.2,
    load_average_15m: 1.0,
    timestamp: "2024-01-15T12:00:00Z",
  },
};

const mockHealth = {
  data: {
    status: "healthy",
    uptime_seconds: 86400,
    services: {
      api: "healthy",
      database: "healthy",
      redis: "healthy",
    },
    last_checked_at: "2024-01-15T12:00:00Z",
  },
};

const mockBackupStatus = {
  data: {
    last_backup_at: "2024-01-15T00:00:00Z",
    last_backup_result: "success",
    backup_destination: "/backups/daily",
    schedule: "0 0 * * *",
    retention_days: 30,
    backup_size_mb: 150.5,
    timestamp: "2024-01-15T12:00:00Z",
  },
};

const mockBackupHistory = {
  data: {
    history: [
      {
        id: "backup-1",
        started_at: "2024-01-15T00:00:00Z",
        completed_at: "2024-01-15T00:15:00Z",
        status: "success",
        size_bytes: 157286400,
        backup_type: "full",
      },
    ],
  },
};

const mockMaintenance = {
  data: {
    enabled: false,
    timestamp: "2024-01-15T12:00:00Z",
  },
};

const mockCacheNamespaces = {
  data: {
    namespaces: [
      { namespace: "kb", key_count: 500, estimated_size_bytes: 1048576 },
      { namespace: "session", key_count: 100, estimated_size_bytes: 524288 },
    ],
  },
};

describe("useSystem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAPI).mockImplementation(async (url: string) => {
      if (url.includes("/resources")) return mockResources;
      if (url.includes("/health")) return mockHealth;
      if (url.includes("/backup/status")) return mockBackupStatus;
      if (url.includes("/backup/history")) return mockBackupHistory;
      if (url.includes("/maintenance")) return mockMaintenance;
      if (url.includes("/cache/stats/namespaces")) return mockCacheNamespaces;
      throw new Error("Unknown endpoint");
    });
  });

  it("should fetch all system data on mount", async () => {
    const { result } = renderHook(() => useSystem());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.resources?.disk_usage_percent).toBe(40);
    expect(result.current.health?.status).toBe("healthy");
    expect(result.current.backupStatus?.last_backup_result).toBe("success");
    expect(result.current.backupHistory).toHaveLength(1);
    expect(result.current.maintenanceStatus?.enabled).toBe(false);
    expect(result.current.cacheNamespaces).toHaveLength(2);
  });

  it("should handle resource fetch errors", async () => {
    vi.mocked(fetchAPI).mockImplementation(async (url: string) => {
      if (url.includes("/resources")) throw new Error("Resource fetch failed");
      if (url.includes("/health")) return mockHealth;
      if (url.includes("/backup/status")) return mockBackupStatus;
      if (url.includes("/backup/history")) return mockBackupHistory;
      if (url.includes("/maintenance")) return mockMaintenance;
      if (url.includes("/cache/stats/namespaces")) return mockCacheNamespaces;
      throw new Error("Unknown endpoint");
    });

    const { result } = renderHook(() => useSystem());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Resource fetch failed");
  });

  it("should trigger backup successfully", async () => {
    vi.mocked(fetchAPI).mockImplementation(
      async (url: string, options?: { method?: string }) => {
        if (options?.method === "POST" && url.includes("/backup/trigger")) {
          return { success: true };
        }
        if (url.includes("/resources")) return mockResources;
        if (url.includes("/health")) return mockHealth;
        if (url.includes("/backup/status")) return mockBackupStatus;
        if (url.includes("/backup/history")) return mockBackupHistory;
        if (url.includes("/maintenance")) return mockMaintenance;
        if (url.includes("/cache/stats/namespaces")) return mockCacheNamespaces;
        throw new Error("Unknown endpoint");
      },
    );

    const { result } = renderHook(() => useSystem());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let success = false;
    await act(async () => {
      success = await result.current.triggerBackup("full");
    });

    expect(success).toBe(true);
    expect(fetchAPI).toHaveBeenCalledWith(
      "/api/admin/system/backup/trigger?backup_type=full",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("should enable maintenance mode", async () => {
    vi.mocked(fetchAPI).mockImplementation(
      async (url: string, options?: { method?: string }) => {
        if (options?.method === "POST" && url.includes("/maintenance/enable")) {
          return { success: true };
        }
        if (url.includes("/resources")) return mockResources;
        if (url.includes("/health")) return mockHealth;
        if (url.includes("/backup/status")) return mockBackupStatus;
        if (url.includes("/backup/history")) return mockBackupHistory;
        if (url.includes("/maintenance")) return mockMaintenance;
        if (url.includes("/cache/stats/namespaces")) return mockCacheNamespaces;
        throw new Error("Unknown endpoint");
      },
    );

    const { result } = renderHook(() => useSystem());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let success = false;
    await act(async () => {
      success = await result.current.enableMaintenance("Test maintenance", 60);
    });

    expect(success).toBe(true);
    expect(fetchAPI).toHaveBeenCalledWith(
      "/api/admin/system/maintenance/enable",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message: "Test maintenance",
          estimated_duration_minutes: 60,
        }),
      }),
    );
  });

  it("should disable maintenance mode", async () => {
    vi.mocked(fetchAPI).mockImplementation(
      async (url: string, options?: { method?: string }) => {
        if (
          options?.method === "POST" &&
          url.includes("/maintenance/disable")
        ) {
          return { success: true };
        }
        if (url.includes("/resources")) return mockResources;
        if (url.includes("/health")) return mockHealth;
        if (url.includes("/backup/status")) return mockBackupStatus;
        if (url.includes("/backup/history")) return mockBackupHistory;
        if (url.includes("/maintenance")) return mockMaintenance;
        if (url.includes("/cache/stats/namespaces")) return mockCacheNamespaces;
        throw new Error("Unknown endpoint");
      },
    );

    const { result } = renderHook(() => useSystem());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let success = false;
    await act(async () => {
      success = await result.current.disableMaintenance();
    });

    expect(success).toBe(true);
  });

  it("should invalidate cache namespace", async () => {
    vi.mocked(fetchAPI).mockImplementation(
      async (url: string, options?: { method?: string }) => {
        if (
          options?.method === "POST" &&
          url.includes("/cache/invalidate/namespace")
        ) {
          return { success: true };
        }
        if (url.includes("/resources")) return mockResources;
        if (url.includes("/health")) return mockHealth;
        if (url.includes("/backup/status")) return mockBackupStatus;
        if (url.includes("/backup/history")) return mockBackupHistory;
        if (url.includes("/maintenance")) return mockMaintenance;
        if (url.includes("/cache/stats/namespaces")) return mockCacheNamespaces;
        throw new Error("Unknown endpoint");
      },
    );

    const { result } = renderHook(() => useSystem());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let success = false;
    await act(async () => {
      success = await result.current.invalidateCacheNamespace("kb");
    });

    expect(success).toBe(true);
    expect(fetchAPI).toHaveBeenCalledWith(
      "/api/admin/cache/invalidate/namespace?namespace=kb",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("should return loading states correctly", async () => {
    const { result } = renderHook(() => useSystem());

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.triggeringBackup).toBe(false);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("should refresh all data when refresh is called", async () => {
    const { result } = renderHook(() => useSystem());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    vi.clearAllMocks();
    vi.mocked(fetchAPI).mockImplementation(async (url: string) => {
      if (url.includes("/resources")) return mockResources;
      if (url.includes("/health")) return mockHealth;
      if (url.includes("/backup/status")) return mockBackupStatus;
      if (url.includes("/backup/history")) return mockBackupHistory;
      if (url.includes("/maintenance")) return mockMaintenance;
      if (url.includes("/cache/stats/namespaces")) return mockCacheNamespaces;
      throw new Error("Unknown endpoint");
    });

    await act(async () => {
      await result.current.refresh();
    });

    // Should have called all endpoints again
    expect(fetchAPI).toHaveBeenCalled();
  });
});
