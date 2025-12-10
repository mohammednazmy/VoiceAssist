/**
 * Tests for useTroubleshooting hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useTroubleshooting } from "./useTroubleshooting";

vi.mock("../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

import { fetchAPI } from "../lib/api";

const mockLogs = {
  logs: [
    {
      timestamp: "2024-01-15T12:00:00Z",
      level: "ERROR",
      service: "api",
      trace_id: "trace-123",
      message: "Database connection timeout",
      extra: { duration_ms: 5000 },
    },
    {
      timestamp: "2024-01-15T11:55:00Z",
      level: "WARNING",
      service: "worker",
      message: "High memory usage",
    },
    {
      timestamp: "2024-01-15T11:50:00Z",
      level: "INFO",
      service: "api",
      message: "Request processed successfully",
    },
  ],
  count: 3,
  available_services: ["api", "worker", "scheduler"],
  available_levels: ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
};

const mockErrorSummary = {
  errors: [
    {
      error_type: "DatabaseError",
      count: 15,
      last_occurrence: "2024-01-15T12:00:00Z",
      affected_services: ["api", "worker"],
      sample_trace_id: "trace-123",
      sample_message: "Connection timeout",
    },
    {
      error_type: "ValidationError",
      count: 8,
      last_occurrence: "2024-01-15T11:30:00Z",
      affected_services: ["api"],
      sample_message: "Invalid input",
    },
  ],
  total_errors_24h: 23,
  error_types_count: 2,
};

const mockServices = {
  services: [
    {
      service_name: "api",
      status: "healthy",
      last_check_at: "2024-01-15T12:00:00Z",
      latency_ms: 25,
      details: { requests_per_sec: 100 },
    },
    {
      service_name: "worker",
      status: "degraded",
      last_check_at: "2024-01-15T12:00:00Z",
      latency_ms: 150,
      error_message: "High queue depth",
      details: { queue_depth: 500 },
    },
  ],
  summary: {
    total: 2,
    healthy: 1,
    degraded: 1,
    unhealthy: 0,
    overall_status: "degraded",
  },
};

const mockDependencies = {
  dependencies: [
    {
      name: "PostgreSQL",
      type: "database",
      status: "healthy",
      latency_ms: 15,
      version: "15.2",
      details: { connections: 10 },
    },
    {
      name: "Redis",
      type: "cache",
      status: "healthy",
      latency_ms: 2,
      version: "7.0",
      details: { used_memory: "1GB" },
    },
  ],
  summary: {
    total: 2,
    healthy: 2,
    degraded: 0,
    unhealthy: 0,
    overall_status: "healthy",
  },
};

describe("useTroubleshooting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAPI).mockImplementation(async (url: string) => {
      if (url.includes("/logs/errors/summary")) return mockErrorSummary;
      if (url.includes("/logs")) return mockLogs;
      if (url.includes("/health/services")) return mockServices;
      if (url.includes("/health/dependencies")) return mockDependencies;
      throw new Error("Unknown endpoint");
    });
  });

  describe("initial load", () => {
    it("should return loading true initially", () => {
      const { result } = renderHook(() => useTroubleshooting());
      expect(result.current.loading).toBe(true);
    });

    it("should fetch all troubleshooting data on mount", async () => {
      const { result } = renderHook(() => useTroubleshooting());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/logs?limit=100");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/logs/errors/summary");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/health/services");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/health/dependencies");
    });

    it("should return logs after loading", async () => {
      const { result } = renderHook(() => useTroubleshooting());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.logs).toEqual(mockLogs.logs);
      expect(result.current.logs).toHaveLength(3);
    });

    it("should return available services and levels", async () => {
      const { result } = renderHook(() => useTroubleshooting());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.availableServices).toEqual([
        "api",
        "worker",
        "scheduler",
      ]);
      expect(result.current.availableLevels).toEqual([
        "DEBUG",
        "INFO",
        "WARNING",
        "ERROR",
        "CRITICAL",
      ]);
    });

    it("should return error summary after loading", async () => {
      const { result } = renderHook(() => useTroubleshooting());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.errorSummary).toEqual(mockErrorSummary.errors);
      expect(result.current.totalErrors24h).toBe(23);
    });

    it("should return services health after loading", async () => {
      const { result } = renderHook(() => useTroubleshooting());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.services).toEqual(mockServices.services);
      expect(result.current.servicesSummary).toEqual(mockServices.summary);
    });

    it("should return dependencies health after loading", async () => {
      const { result } = renderHook(() => useTroubleshooting());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.dependencies).toEqual(
        mockDependencies.dependencies,
      );
      expect(result.current.dependenciesSummary).toEqual(
        mockDependencies.summary,
      );
    });

    it("should set lastUpdated after loading", async () => {
      const { result } = renderHook(() => useTroubleshooting());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.lastUpdated).not.toBeNull();
    });

    it("should have no error on success", async () => {
      const { result } = renderHook(() => useTroubleshooting());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should set error on fetch failure", async () => {
      vi.mocked(fetchAPI).mockRejectedValue(
        new Error("Troubleshooting fetch failed"),
      );

      const { result } = renderHook(() => useTroubleshooting());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Troubleshooting fetch failed");
    });
  });

  describe("refreshLogs", () => {
    it("should refetch logs without filters", async () => {
      const { result } = renderHook(() => useTroubleshooting());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshLogs();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/logs");
    });

    it("should refetch logs with filters", async () => {
      const { result } = renderHook(() => useTroubleshooting());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshLogs({
          service: "api",
          level: "ERROR",
          search: "timeout",
          since_hours: 24,
          limit: 50,
        });
      });

      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/logs?service=api&level=ERROR&search=timeout&since_hours=24&limit=50",
      );
    });
  });

  describe("refreshErrorSummary", () => {
    it("should refetch error summary", async () => {
      const { result } = renderHook(() => useTroubleshooting());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshErrorSummary();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/logs/errors/summary");
    });
  });

  describe("refreshServices", () => {
    it("should refetch services health", async () => {
      const { result } = renderHook(() => useTroubleshooting());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshServices();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/health/services");
    });
  });

  describe("refreshDependencies", () => {
    it("should refetch dependencies health", async () => {
      const { result } = renderHook(() => useTroubleshooting());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshDependencies();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/health/dependencies");
    });
  });

  describe("refreshAll", () => {
    it("should refetch all data", async () => {
      const { result } = renderHook(() => useTroubleshooting());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshAll();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/logs?limit=100");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/logs/errors/summary");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/health/services");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/health/dependencies");
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
        useTroubleshooting({ refreshIntervalMs: 5000 }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const callCount = vi.mocked(fetchAPI).mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      // Should have made additional calls for services and dependencies
      expect(vi.mocked(fetchAPI).mock.calls.length).toBeGreaterThan(callCount);
    });

    it("should not auto refresh when disabled", async () => {
      const { result } = renderHook(() =>
        useTroubleshooting({ autoRefresh: false, refreshIntervalMs: 5000 }),
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
