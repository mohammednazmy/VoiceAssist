/**
 * Tests for useTools hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useTools } from "./useTools";

vi.mock("../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

import { fetchAPI } from "../lib/api";

const mockTools = {
  tools: [
    {
      tool_name: "calendar_lookup",
      display_name: "Calendar Lookup",
      description: "Look up calendar events",
      enabled: true,
      category: "calendar",
      total_calls_24h: 150,
      success_rate: 0.95,
      avg_duration_ms: 250,
      phi_enabled: false,
      requires_confirmation: false,
    },
    {
      tool_name: "file_search",
      display_name: "File Search",
      description: "Search patient files",
      enabled: true,
      category: "file",
      total_calls_24h: 75,
      success_rate: 0.88,
      avg_duration_ms: 450,
      phi_enabled: true,
      requires_confirmation: true,
      last_error: "Timeout",
      last_error_at: "2024-01-15T11:00:00Z",
    },
  ],
  total: 2,
  enabled_count: 2,
  disabled_count: 0,
  total_calls_24h: 225,
  categories: ["calendar", "file"],
};

const mockLogs = {
  logs: [
    {
      id: "log-1",
      tool_name: "calendar_lookup",
      user_email: "user@example.com",
      session_id: "session-1",
      call_id: "call-1",
      arguments: { query: "today" },
      status: "completed",
      duration_ms: 200,
      phi_detected: false,
      confirmation_required: false,
      created_at: "2024-01-15T12:00:00Z",
    },
  ],
  count: 1,
};

const mockAnalytics = {
  tools: [
    {
      tool_name: "calendar_lookup",
      display_name: "Calendar Lookup",
      category: "calendar",
      total_calls: 1500,
      success_count: 1425,
      failure_count: 50,
      timeout_count: 20,
      cancelled_count: 5,
      success_rate: 0.95,
      avg_duration_ms: 250,
      p95_duration_ms: 450,
      phi_detected_count: 0,
      confirmation_required_count: 0,
    },
  ],
  summary: {
    total_calls: 1500,
    total_success: 1425,
    total_failures: 75,
    total_phi_detected: 25,
    overall_success_rate: 0.95,
  },
  by_category: {
    calendar: { calls: 1500, success: 1425, failures: 75 },
  },
};

describe("useTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAPI).mockImplementation(
      async (url: string, options?: { method?: string }) => {
        if (options?.method === "PATCH") return { success: true };
        if (url.includes("/tools/logs")) return mockLogs;
        if (url.includes("/tools/analytics")) return mockAnalytics;
        if (url.includes("/tools")) return mockTools;
        throw new Error("Unknown endpoint");
      },
    );
  });

  describe("initial load", () => {
    it("should return loading true initially", async () => {
      const { result } = renderHook(() => useTools());
      expect(result.current.loading).toBe(true);

      // Wait for async operations to complete to avoid act() warnings
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it("should fetch all tools data on mount", async () => {
      const { result } = renderHook(() => useTools());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/tools");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/tools/logs");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/tools/analytics");
    });

    it("should return tools after loading", async () => {
      const { result } = renderHook(() => useTools());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.tools).toEqual(mockTools.tools);
      expect(result.current.tools).toHaveLength(2);
    });

    it("should return summary after loading", async () => {
      const { result } = renderHook(() => useTools());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.summary).toEqual({
        total: 2,
        enabled_count: 2,
        disabled_count: 0,
        total_calls_24h: 225,
        categories: ["calendar", "file"],
      });
    });

    it("should return logs after loading", async () => {
      const { result } = renderHook(() => useTools());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.logs).toEqual(mockLogs.logs);
    });

    it("should return analytics after loading", async () => {
      const { result } = renderHook(() => useTools());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.analytics).toEqual(mockAnalytics.tools);
      expect(result.current.analyticsSummary).toEqual(mockAnalytics.summary);
    });

    it("should set lastUpdated after loading", async () => {
      const { result } = renderHook(() => useTools());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.lastUpdated).not.toBeNull();
    });

    it("should have no error on success", async () => {
      const { result } = renderHook(() => useTools());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should set error on fetch failure", async () => {
      vi.mocked(fetchAPI).mockRejectedValue(new Error("Tools fetch failed"));

      const { result } = renderHook(() => useTools());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Tools fetch failed");
    });
  });

  describe("refreshTools", () => {
    it("should refetch tools", async () => {
      const { result } = renderHook(() => useTools());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshTools();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/tools");
    });
  });

  describe("refreshLogs", () => {
    it("should refetch logs without filters", async () => {
      const { result } = renderHook(() => useTools());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshLogs();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/tools/logs");
    });

    it("should refetch logs with filters", async () => {
      const { result } = renderHook(() => useTools());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshLogs({
          tool_name: "calendar_lookup",
          status: "completed",
          limit: 50,
          offset: 10,
        });
      });

      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/tools/logs?tool_name=calendar_lookup&status=completed&limit=50&offset=10",
      );
    });
  });

  describe("refreshAnalytics", () => {
    it("should refetch analytics", async () => {
      const { result } = renderHook(() => useTools());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshAnalytics();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/tools/analytics");
    });
  });

  describe("refreshAll", () => {
    it("should refetch all data", async () => {
      const { result } = renderHook(() => useTools());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshAll();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/tools");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/tools/logs");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/tools/analytics");
    });
  });

  describe("updateToolConfig", () => {
    it("should update tool configuration", async () => {
      const { result } = renderHook(() => useTools());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let success = false;
      await act(async () => {
        success = await result.current.updateToolConfig("calendar_lookup", {
          enabled: false,
          timeout_seconds: 60,
        });
      });

      expect(success).toBe(true);
      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/tools/calendar_lookup",
        {
          method: "PATCH",
          body: JSON.stringify({ enabled: false, timeout_seconds: 60 }),
        },
      );
    });

    it("should refresh tools after update", async () => {
      const { result } = renderHook(() => useTools());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();
      vi.mocked(fetchAPI).mockImplementation(
        async (url: string, options?: { method?: string }) => {
          if (options?.method === "PATCH") return { success: true };
          return mockTools;
        },
      );

      await act(async () => {
        await result.current.updateToolConfig("calendar_lookup", {
          enabled: false,
        });
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/tools");
    });

    it("should return false and set error on failure", async () => {
      vi.mocked(fetchAPI).mockImplementation(
        async (url: string, options?: { method?: string }) => {
          if (options?.method === "PATCH") throw new Error("Update failed");
          if (url.includes("/tools/logs")) return mockLogs;
          if (url.includes("/tools/analytics")) return mockAnalytics;
          if (url.includes("/tools")) return mockTools;
          throw new Error("Unknown endpoint");
        },
      );

      const { result } = renderHook(() => useTools());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let success = true;
      await act(async () => {
        success = await result.current.updateToolConfig("calendar_lookup", {
          enabled: false,
        });
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe("Update failed");
    });
  });

  describe("auto refresh", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should not auto refresh by default", async () => {
      const { result } = renderHook(() => useTools());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const callCount = vi.mocked(fetchAPI).mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(35000);
      });

      expect(vi.mocked(fetchAPI).mock.calls.length).toBe(callCount);
    });

    it("should auto refresh when enabled", async () => {
      const { result } = renderHook(() =>
        useTools({ autoRefresh: true, refreshIntervalMs: 5000 }),
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
  });
});
