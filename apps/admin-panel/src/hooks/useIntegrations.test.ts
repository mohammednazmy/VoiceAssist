/**
 * Tests for useIntegrations hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useIntegrations } from "./useIntegrations";

vi.mock("../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

import { fetchAPI } from "../lib/api";

const mockIntegrations = [
  {
    id: "int-1",
    name: "PostgreSQL",
    type: "database",
    status: "connected",
    provider: "postgresql",
    last_checked: "2024-01-15T12:00:00Z",
  },
  {
    id: "int-2",
    name: "Redis Cache",
    type: "cache",
    status: "connected",
    provider: "redis",
    last_checked: "2024-01-15T12:00:00Z",
  },
  {
    id: "int-3",
    name: "OpenAI",
    type: "llm",
    status: "degraded",
    provider: "openai",
    last_checked: "2024-01-15T12:00:00Z",
    error_message: "Rate limited",
  },
];

const mockHealth = {
  overall_status: "degraded",
  total_integrations: 3,
  connected: 2,
  degraded: 1,
  errors: 0,
  not_configured: 0,
  checked_at: "2024-01-15T12:00:00Z",
};

const mockDetail = {
  id: "int-1",
  name: "PostgreSQL",
  type: "database",
  status: "connected",
  provider: "postgresql",
  description: "Main database connection",
  config: {
    host: "localhost",
    port: 5432,
    enabled: true,
  },
  has_api_key: false,
  last_checked: "2024-01-15T12:00:00Z",
};

const mockTestResult = {
  success: true,
  latency_ms: 45,
  message: "Connection successful",
  details: {},
};

describe("useIntegrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAPI).mockImplementation(async (url: string) => {
      if (url.includes("/integrations/health")) return mockHealth;
      if (url.includes("/integrations/") && url.includes("/test"))
        return mockTestResult;
      if (url.match(/\/integrations\/[^/]+$/)) return mockDetail;
      if (url.includes("/integrations/")) return mockIntegrations;
      throw new Error("Unknown endpoint");
    });
  });

  describe("initial load", () => {
    it("should return loading true initially", () => {
      const { result } = renderHook(() => useIntegrations());
      expect(result.current.loading).toBe(true);
    });

    it("should fetch integrations and health on mount", async () => {
      const { result } = renderHook(() => useIntegrations());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/integrations/");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/integrations/health");
    });

    it("should return integrations after loading", async () => {
      const { result } = renderHook(() => useIntegrations());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.integrations).toEqual(mockIntegrations);
      expect(result.current.integrations).toHaveLength(3);
    });

    it("should return health after loading", async () => {
      const { result } = renderHook(() => useIntegrations());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.health).toEqual(mockHealth);
      expect(result.current.health?.overall_status).toBe("degraded");
    });

    it("should set lastUpdated after loading", async () => {
      const { result } = renderHook(() => useIntegrations());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.lastUpdated).not.toBeNull();
    });

    it("should have no error on success", async () => {
      const { result } = renderHook(() => useIntegrations());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should set error on fetch failure", async () => {
      vi.mocked(fetchAPI).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useIntegrations());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Network error");
    });

    it("should handle non-Error rejection", async () => {
      vi.mocked(fetchAPI).mockRejectedValue("connection failed");

      const { result } = renderHook(() => useIntegrations());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Failed to fetch data");
    });
  });

  describe("refreshAll", () => {
    it("should refetch all data", async () => {
      const { result } = renderHook(() => useIntegrations());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshAll();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/integrations/");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/integrations/health");
    });
  });

  describe("getIntegrationDetail", () => {
    it("should fetch integration detail by id", async () => {
      const { result } = renderHook(() => useIntegrations());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let detail;
      await act(async () => {
        detail = await result.current.getIntegrationDetail("int-1");
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/integrations/int-1");
      expect(detail).toEqual(mockDetail);
    });
  });

  describe("testIntegration", () => {
    it("should test integration and return result", async () => {
      const { result } = renderHook(() => useIntegrations());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let testResult;
      await act(async () => {
        testResult = await result.current.testIntegration("int-1");
      });

      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/integrations/int-1/test",
        { method: "POST" },
      );
      expect(testResult).toEqual(mockTestResult);
    });

    it("should refresh data after testing", async () => {
      const { result } = renderHook(() => useIntegrations());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();
      vi.mocked(fetchAPI).mockImplementation(async (url: string) => {
        if (url.includes("/test")) return mockTestResult;
        if (url.includes("/health")) return mockHealth;
        return mockIntegrations;
      });

      await act(async () => {
        await result.current.testIntegration("int-1");
      });

      // Should have called refresh after test
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/integrations/");
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
      const { result } = renderHook(() => useIntegrations());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const callCount = vi.mocked(fetchAPI).mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(35000);
      });

      // Should not have made additional calls
      expect(vi.mocked(fetchAPI).mock.calls.length).toBe(callCount);
    });

    it("should auto refresh when enabled", async () => {
      const { result } = renderHook(() =>
        useIntegrations({ autoRefresh: true, refreshIntervalMs: 5000 }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const callCount = vi.mocked(fetchAPI).mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      // Should have made additional calls
      expect(vi.mocked(fetchAPI).mock.calls.length).toBeGreaterThan(callCount);
    });
  });
});
