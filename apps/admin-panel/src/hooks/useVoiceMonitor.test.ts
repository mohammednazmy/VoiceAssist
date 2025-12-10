/**
 * Tests for useVoiceMonitor hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useVoiceMonitor } from "./useVoiceMonitor";

vi.mock("../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

import { fetchAPI } from "../lib/api";

const mockSessions = {
  sessions: [
    {
      session_id: "session-1",
      user_id: "user-1",
      user_email: "user1@example.com",
      connected_at: "2024-01-15T11:00:00Z",
      session_type: "voice",
      client_info: { browser: "Chrome", os: "Windows" },
      messages_count: 15,
      last_activity: "2024-01-15T12:00:00Z",
    },
    {
      session_id: "session-2",
      user_id: "user-2",
      user_email: "user2@example.com",
      connected_at: "2024-01-15T11:30:00Z",
      session_type: "realtime",
      client_info: { browser: "Safari", os: "macOS" },
      messages_count: 8,
      last_activity: "2024-01-15T11:55:00Z",
    },
  ],
  total: 2,
};

const mockMetrics = {
  active_sessions: 2,
  total_sessions_24h: 50,
  avg_session_duration_sec: 300,
  stt_latency_p95_ms: 150,
  tts_latency_p95_ms: 200,
  error_rate_24h: 0.02,
  connections_by_type: { voice: 25, realtime: 20, text: 5 },
  timestamp: "2024-01-15T12:00:00Z",
};

const mockHealth = {
  status: "healthy",
  realtime_api_enabled: true,
  openai_api_configured: true,
  redis_connected: true,
  active_connections: 2,
  details: { max_connections: 100 },
  timestamp: "2024-01-15T12:00:00Z",
};

const mockConfig = {
  default_voice: "alloy",
  default_language: "en",
  vad_enabled: true,
  vad_threshold: 0.5,
  max_session_duration_sec: 3600,
  stt_provider: "openai",
  tts_provider: "openai",
  realtime_enabled: true,
  timestamp: "2024-01-15T12:00:00Z",
};

describe("useVoiceMonitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAPI).mockImplementation(
      async (url: string, options?: { method?: string }) => {
        if (options?.method === "POST" && url.includes("/disconnect")) {
          return { success: true };
        }
        if (url.includes("/voice/sessions")) return mockSessions;
        if (url.includes("/voice/metrics")) return mockMetrics;
        if (url.includes("/voice/health")) return mockHealth;
        if (url.includes("/voice/config")) return mockConfig;
        throw new Error("Unknown endpoint");
      },
    );
  });

  describe("initial load", () => {
    it("should return loading true initially", () => {
      const { result } = renderHook(() => useVoiceMonitor());
      expect(result.current.loading).toBe(true);
    });

    it("should fetch all voice data on mount", async () => {
      const { result } = renderHook(() => useVoiceMonitor());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/voice/sessions");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/voice/metrics");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/voice/health");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/voice/config");
    });

    it("should return sessions after loading", async () => {
      const { result } = renderHook(() => useVoiceMonitor());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.sessions).toEqual(mockSessions.sessions);
      expect(result.current.sessions).toHaveLength(2);
    });

    it("should return metrics after loading", async () => {
      const { result } = renderHook(() => useVoiceMonitor());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.metrics).toEqual(mockMetrics);
      expect(result.current.metrics?.active_sessions).toBe(2);
      expect(result.current.metrics?.stt_latency_p95_ms).toBe(150);
    });

    it("should return health after loading", async () => {
      const { result } = renderHook(() => useVoiceMonitor());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.health).toEqual(mockHealth);
      expect(result.current.health?.status).toBe("healthy");
      expect(result.current.health?.realtime_api_enabled).toBe(true);
    });

    it("should return config after loading", async () => {
      const { result } = renderHook(() => useVoiceMonitor());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.config).toEqual(mockConfig);
      expect(result.current.config?.default_voice).toBe("alloy");
      expect(result.current.config?.vad_enabled).toBe(true);
    });

    it("should set lastUpdated after loading", async () => {
      const { result } = renderHook(() => useVoiceMonitor());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.lastUpdated).not.toBeNull();
    });

    it("should have no error on success", async () => {
      const { result } = renderHook(() => useVoiceMonitor());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should set error on fetch failure", async () => {
      vi.mocked(fetchAPI).mockRejectedValue(
        new Error("Voice data fetch failed"),
      );

      const { result } = renderHook(() => useVoiceMonitor());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Voice data fetch failed");
    });
  });

  describe("refreshSessions", () => {
    it("should refetch sessions", async () => {
      const { result } = renderHook(() => useVoiceMonitor());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshSessions();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/voice/sessions");
    });
  });

  describe("refreshMetrics", () => {
    it("should refetch metrics", async () => {
      const { result } = renderHook(() => useVoiceMonitor());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshMetrics();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/voice/metrics");
    });
  });

  describe("refreshHealth", () => {
    it("should refetch health", async () => {
      const { result } = renderHook(() => useVoiceMonitor());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshHealth();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/voice/health");
    });
  });

  describe("refreshAll", () => {
    it("should refetch all data", async () => {
      const { result } = renderHook(() => useVoiceMonitor());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshAll();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/voice/sessions");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/voice/metrics");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/voice/health");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/voice/config");
    });
  });

  describe("disconnectSession", () => {
    it("should disconnect a session successfully", async () => {
      const { result } = renderHook(() => useVoiceMonitor());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let success = false;
      await act(async () => {
        success = await result.current.disconnectSession("session-1");
      });

      expect(success).toBe(true);
      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/voice/sessions/session-1/disconnect",
        { method: "POST" },
      );
    });

    it("should refresh sessions after disconnect", async () => {
      const { result } = renderHook(() => useVoiceMonitor());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();
      vi.mocked(fetchAPI).mockImplementation(
        async (url: string, options?: { method?: string }) => {
          if (options?.method === "POST") return { success: true };
          if (url.includes("/voice/sessions")) return mockSessions;
          throw new Error("Unknown endpoint");
        },
      );

      await act(async () => {
        await result.current.disconnectSession("session-1");
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/voice/sessions");
    });

    it("should return false and set error on failure", async () => {
      vi.mocked(fetchAPI).mockImplementation(
        async (url: string, options?: { method?: string }) => {
          if (options?.method === "POST") throw new Error("Disconnect failed");
          if (url.includes("/voice/sessions")) return mockSessions;
          if (url.includes("/voice/metrics")) return mockMetrics;
          if (url.includes("/voice/health")) return mockHealth;
          if (url.includes("/voice/config")) return mockConfig;
          throw new Error("Unknown endpoint");
        },
      );

      const { result } = renderHook(() => useVoiceMonitor());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let success = true;
      await act(async () => {
        success = await result.current.disconnectSession("session-1");
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe("Disconnect failed");
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
        useVoiceMonitor({ refreshIntervalMs: 5000 }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const callCount = vi.mocked(fetchAPI).mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      // Should have made additional calls for sessions and metrics
      expect(vi.mocked(fetchAPI).mock.calls.length).toBeGreaterThan(callCount);
    });

    it("should not auto refresh when disabled", async () => {
      const { result } = renderHook(() =>
        useVoiceMonitor({ autoRefresh: false, refreshIntervalMs: 5000 }),
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

    it("should refresh sessions and metrics during auto refresh", async () => {
      const { result } = renderHook(() =>
        useVoiceMonitor({ refreshIntervalMs: 5000 }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      // Should have called sessions and metrics
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/voice/sessions");
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/voice/metrics");
      // Should NOT have called health or config during auto refresh
      expect(fetchAPI).not.toHaveBeenCalledWith("/api/admin/voice/health");
      expect(fetchAPI).not.toHaveBeenCalledWith("/api/admin/voice/config");
    });
  });
});
