/**
 * Tests for usePHI hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { usePHI } from "./usePHI";

vi.mock("../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

import { fetchAPI } from "../lib/api";

const mockRules = {
  rules: [
    {
      id: "rule-1",
      name: "SSN Detection",
      description: "Detects Social Security Numbers",
      phi_type: "ssn",
      status: "enabled",
      pattern: "\\d{3}-\\d{2}-\\d{4}",
      is_builtin: true,
      detection_count: 150,
      last_detection: "2024-01-15T12:00:00Z",
    },
    {
      id: "rule-2",
      name: "Email Detection",
      description: "Detects email addresses",
      phi_type: "email",
      status: "disabled",
      is_builtin: true,
      detection_count: 25,
    },
  ],
  total: 2,
  enabled: 1,
};

const mockStats = {
  total_detections: 500,
  detections_today: 25,
  detections_this_week: 150,
  by_type: { ssn: 100, email: 50, phone: 75 },
  by_day: [{ date: "2024-01-15", count: 25, by_type: { ssn: 15, email: 10 } }],
  routing_stats: { routed_local: 300, redacted_cloud: 150, blocked: 50 },
};

const mockRouting = {
  mode: "hybrid",
  confidence_threshold: 0.8,
  local_llm_enabled: true,
  local_llm_url: "http://localhost:11434",
  redact_before_cloud: true,
  audit_all_phi: true,
};

const mockHealth = {
  overall: "healthy",
  components: {
    detector: "healthy",
    redis_config: "healthy",
    local_llm: "degraded",
    audit_logging: "healthy",
  },
  routing_mode: "hybrid",
  timestamp: "2024-01-15T12:00:00Z",
};

const mockEvents = {
  events: [
    {
      id: "evt-1",
      timestamp: "2024-01-15T12:00:00Z",
      phi_types: ["ssn"],
      confidence: 0.95,
      action_taken: "redacted",
      user_id: "user-1",
    },
  ],
  total: 1,
  limit: 20,
  offset: 0,
};

const mockTestResult = {
  contains_phi: true,
  phi_types: ["ssn"],
  confidence: 0.95,
  details: { matches: 1 },
  redacted_text: "***-**-****",
};

const mockRedactResult = {
  original_length: 20,
  redacted_length: 12,
  redaction_count: 1,
  redacted_text: "***-**-****",
};

describe("usePHI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAPI).mockImplementation(
      async (url: string, options?: { method?: string }) => {
        if (options?.method === "PUT") return { success: true };
        if (options?.method === "POST" && url.includes("/test"))
          return mockTestResult;
        if (options?.method === "POST" && url.includes("/redact"))
          return mockRedactResult;
        if (options?.method === "PATCH") return { success: true };
        if (url.includes("/phi/rules")) return mockRules;
        if (url.includes("/phi/stats")) return mockStats;
        if (url.includes("/phi/routing")) return mockRouting;
        if (url.includes("/phi/health")) return mockHealth;
        if (url.includes("/phi/events")) return mockEvents;
        throw new Error("Unknown endpoint");
      },
    );
  });

  describe("initial load", () => {
    it("should return loading true initially", () => {
      const { result } = renderHook(() => usePHI());
      expect(result.current.loading).toBe(true);
    });

    it("should fetch all PHI data on mount", async () => {
      const { result } = renderHook(() => usePHI());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/phi/rules");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/phi/stats?days=7");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/phi/routing");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/phi/health");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/phi/events?limit=20");
    });

    it("should return rules after loading", async () => {
      const { result } = renderHook(() => usePHI());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.rules).toEqual(mockRules.rules);
      expect(result.current.rulesInfo).toEqual({ total: 2, enabled: 1 });
    });

    it("should return stats after loading", async () => {
      const { result } = renderHook(() => usePHI());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.stats).toEqual(mockStats);
      expect(result.current.stats?.total_detections).toBe(500);
    });

    it("should return routing config after loading", async () => {
      const { result } = renderHook(() => usePHI());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.routing).toEqual(mockRouting);
      expect(result.current.routing?.mode).toBe("hybrid");
    });

    it("should return health after loading", async () => {
      const { result } = renderHook(() => usePHI());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.health).toEqual(mockHealth);
      expect(result.current.health?.overall).toBe("healthy");
    });

    it("should return events after loading", async () => {
      const { result } = renderHook(() => usePHI());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.events).toEqual(mockEvents.events);
    });

    it("should set lastUpdated after loading", async () => {
      const { result } = renderHook(() => usePHI());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.lastUpdated).not.toBeNull();
    });

    it("should have no error on success", async () => {
      const { result } = renderHook(() => usePHI());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should set error on fetch failure", async () => {
      vi.mocked(fetchAPI).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => usePHI());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Network error");
    });
  });

  describe("updateRule", () => {
    it("should update rule status", async () => {
      const { result } = renderHook(() => usePHI());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.updateRule("rule-1", "disabled");
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/phi/rules/rule-1", {
        method: "PUT",
        body: JSON.stringify({ status: "disabled" }),
      });
    });

    it("should refresh rules after update", async () => {
      const { result } = renderHook(() => usePHI());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();
      vi.mocked(fetchAPI).mockImplementation(
        async (url: string, options?: { method?: string }) => {
          if (options?.method === "PUT") return { success: true };
          if (url.includes("/phi/rules")) return mockRules;
          throw new Error("Unknown endpoint");
        },
      );

      await act(async () => {
        await result.current.updateRule("rule-1", "disabled");
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/phi/rules");
    });
  });

  describe("testPHI", () => {
    it("should test text for PHI", async () => {
      const { result } = renderHook(() => usePHI());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let testResult;
      await act(async () => {
        testResult = await result.current.testPHI("123-45-6789");
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/phi/test", {
        method: "POST",
        body: JSON.stringify({ text: "123-45-6789", include_redacted: true }),
      });
      expect(testResult).toEqual(mockTestResult);
    });
  });

  describe("redactPHI", () => {
    it("should redact PHI from text", async () => {
      const { result } = renderHook(() => usePHI());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let redactResult;
      await act(async () => {
        redactResult = await result.current.redactPHI("123-45-6789");
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/phi/redact", {
        method: "POST",
        body: JSON.stringify({ text: "123-45-6789" }),
      });
      expect(redactResult).toEqual(mockRedactResult);
    });
  });

  describe("updateRouting", () => {
    it("should update routing config", async () => {
      const { result } = renderHook(() => usePHI());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.updateRouting({ mode: "local_only" });
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/phi/routing", {
        method: "PATCH",
        body: JSON.stringify({ mode: "local_only" }),
      });
    });

    it("should refresh routing after update", async () => {
      const { result } = renderHook(() => usePHI());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();
      vi.mocked(fetchAPI).mockImplementation(
        async (url: string, options?: { method?: string }) => {
          if (options?.method === "PATCH") return { success: true };
          if (url.includes("/phi/routing")) return mockRouting;
          throw new Error("Unknown endpoint");
        },
      );

      await act(async () => {
        await result.current.updateRouting({ mode: "local_only" });
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/phi/routing");
    });
  });

  describe("refreshAll", () => {
    it("should refetch all data", async () => {
      const { result } = renderHook(() => usePHI());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshAll();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/phi/rules");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/phi/stats?days=7");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/phi/routing");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/phi/health");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/phi/events?limit=20");
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
      const { result } = renderHook(() => usePHI());

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
        usePHI({ autoRefresh: true, refreshIntervalMs: 5000 }),
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
