/**
 * Tests for useBackups hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useBackups } from "./useBackups";

vi.mock("../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

import { fetchAPI } from "../lib/api";

const mockBackupStatus = {
  last_backup_at: "2024-01-15T00:00:00Z",
  last_backup_result: "success",
  backup_destination: "/backups/daily",
  schedule: "0 0 * * *",
  retention_days: 30,
  next_scheduled_at: "2024-01-16T00:00:00Z",
};

const mockBackupHistory = {
  history: [
    {
      id: "backup-1",
      started_at: "2024-01-15T00:00:00Z",
      completed_at: "2024-01-15T00:15:00Z",
      status: "success",
      size_bytes: 157286400,
      backup_type: "full",
    },
    {
      id: "backup-2",
      started_at: "2024-01-14T00:00:00Z",
      completed_at: "2024-01-14T00:10:00Z",
      status: "success",
      size_bytes: 104857600,
      backup_type: "incremental",
    },
  ],
};

describe("useBackups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAPI).mockImplementation(async (url: string) => {
      if (url.includes("/backup/status")) return mockBackupStatus;
      if (url.includes("/backup/history")) return mockBackupHistory;
      if (url.includes("/backup/trigger")) return { success: true };
      throw new Error("Unknown endpoint");
    });
  });

  describe("initial load", () => {
    it("should return loading true initially", () => {
      const { result } = renderHook(() => useBackups());
      expect(result.current.loading).toBe(true);
    });

    it("should fetch all backup data on mount", async () => {
      const { result } = renderHook(() => useBackups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/system/backup/status");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/system/backup/history");
    });

    it("should return backup status after loading", async () => {
      const { result } = renderHook(() => useBackups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.backupStatus).toEqual(mockBackupStatus);
      expect(result.current.backupStatus?.last_backup_result).toBe("success");
    });

    it("should return backup history after loading", async () => {
      const { result } = renderHook(() => useBackups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.backupHistory).toEqual(mockBackupHistory.history);
      expect(result.current.backupHistory).toHaveLength(2);
    });

    it("should derive DR status from backup status", async () => {
      const { result } = renderHook(() => useBackups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.drStatus).not.toBeNull();
      expect(result.current.drStatus?.replica_status).toBe("healthy");
    });

    it("should set lastUpdated after loading", async () => {
      const { result } = renderHook(() => useBackups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.lastUpdated).not.toBeNull();
    });

    it("should have no error on success", async () => {
      const { result } = renderHook(() => useBackups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should set error on status fetch failure", async () => {
      vi.mocked(fetchAPI).mockImplementation(async (url: string) => {
        if (url.includes("/backup/status"))
          throw new Error("Status fetch failed");
        if (url.includes("/backup/history"))
          throw new Error("History fetch failed");
        throw new Error("Unknown endpoint");
      });

      const { result } = renderHook(() => useBackups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).not.toBeNull();
    });

    it("should handle individual refresh errors", async () => {
      const { result } = renderHook(() => useBackups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Now mock an error for individual refresh
      vi.mocked(fetchAPI).mockRejectedValue(new Error("History fetch failed"));

      await act(async () => {
        await result.current.refreshBackupHistory();
      });

      expect(result.current.error).toBe("History fetch failed");
    });
  });

  describe("triggerBackup", () => {
    it("should trigger backup successfully", async () => {
      const { result } = renderHook(() => useBackups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let success = false;
      await act(async () => {
        success = await result.current.triggerBackup();
      });

      expect(success).toBe(true);
      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/system/backup/trigger",
        {
          method: "POST",
        },
      );
    });

    it("should set triggeringBackup while in progress", async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(fetchAPI).mockImplementation(async (url: string) => {
        if (url.includes("/backup/trigger")) return pendingPromise;
        if (url.includes("/backup/status")) return mockBackupStatus;
        if (url.includes("/backup/history")) return mockBackupHistory;
        throw new Error("Unknown endpoint");
      });

      const { result } = renderHook(() => useBackups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Start trigger
      let triggerPromise: Promise<boolean>;
      act(() => {
        triggerPromise = result.current.triggerBackup();
      });

      expect(result.current.triggeringBackup).toBe(true);

      // Complete trigger
      await act(async () => {
        resolvePromise!({ success: true });
        await triggerPromise;
      });

      expect(result.current.triggeringBackup).toBe(false);
    });

    it("should return false on trigger failure", async () => {
      vi.mocked(fetchAPI).mockImplementation(async (url: string) => {
        if (url.includes("/backup/trigger")) throw new Error("Trigger failed");
        if (url.includes("/backup/status")) return mockBackupStatus;
        if (url.includes("/backup/history")) return mockBackupHistory;
        throw new Error("Unknown endpoint");
      });

      const { result } = renderHook(() => useBackups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let success = true;
      await act(async () => {
        success = await result.current.triggerBackup();
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe("Trigger failed");
    });
  });

  describe("refresh functions", () => {
    it("should refresh backup status", async () => {
      const { result } = renderHook(() => useBackups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshBackupStatus();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/system/backup/status");
    });

    it("should refresh backup history", async () => {
      const { result } = renderHook(() => useBackups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshBackupHistory();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/system/backup/history");
    });

    it("should refresh all data", async () => {
      const { result } = renderHook(() => useBackups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshAll();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/system/backup/status");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/system/backup/history");
    });
  });

  describe("auto refresh", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should auto refresh by default", async () => {
      const { result } = renderHook(() =>
        useBackups({ refreshIntervalMs: 5000 }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const callCount = vi.mocked(fetchAPI).mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(vi.mocked(fetchAPI).mock.calls.length).toBeGreaterThan(callCount);
    });

    it("should not auto refresh when disabled", async () => {
      const { result } = renderHook(() =>
        useBackups({ autoRefresh: false, refreshIntervalMs: 5000 }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const callCount = vi.mocked(fetchAPI).mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      expect(vi.mocked(fetchAPI).mock.calls.length).toBe(callCount);
    });
  });
});
