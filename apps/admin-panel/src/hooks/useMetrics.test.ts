/**
 * Tests for useMetrics hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useMetrics } from "./useMetrics";

vi.mock("../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

vi.mock("../services/websocket", () => ({
  websocketService: {
    getStatus: vi.fn(() => "closed"),
    subscribeStatus: vi.fn(() => () => {}),
    subscribeMessages: vi.fn(() => () => {}),
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
}));

import { fetchAPI } from "../lib/api";
import { websocketService, ConnectionStatus } from "../services/websocket";

const mockMetrics = {
  total_users: 100,
  active_users: 50,
  admin_users: 5,
  timestamp: "2024-01-15T12:00:00Z",
};

const mockHealth = {
  database: true,
  redis: true,
  qdrant: true,
};

describe("useMetrics", () => {
  let statusCallback: ((status: ConnectionStatus) => void) | null = null;
  let messageCallback:
    | ((event: { type: string; payload?: unknown }) => void)
    | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    statusCallback = null;
    messageCallback = null;

    vi.mocked(websocketService.getStatus).mockReturnValue("closed");
    vi.mocked(websocketService.subscribeStatus).mockImplementation(
      (callback) => {
        statusCallback = callback;
        return () => {
          statusCallback = null;
        };
      },
    );
    vi.mocked(websocketService.subscribeMessages).mockImplementation(
      (callback) => {
        messageCallback = callback;
        return () => {
          messageCallback = null;
        };
      },
    );

    vi.mocked(fetchAPI).mockImplementation(async (url: string) => {
      if (url.includes("/panel/summary")) return mockMetrics;
      if (url.includes("/health")) return mockHealth;
      throw new Error("Unknown endpoint");
    });
  });

  afterEach(() => {
    statusCallback = null;
    messageCallback = null;
  });

  describe("initial load", () => {
    it("should return loading true initially", async () => {
      const { result } = renderHook(() => useMetrics());
      expect(result.current.loading).toBe(true);

      // Wait for async operations to complete to avoid act() warnings
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it("should fetch metrics and health on mount", async () => {
      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/panel/summary");
      expect(fetchAPI).toHaveBeenCalledWith("/health");
    });

    it("should return metrics after loading", async () => {
      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.metrics).toEqual(mockMetrics);
      expect(result.current.metrics?.total_users).toBe(100);
    });

    it("should return health after loading", async () => {
      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.health).toEqual(mockHealth);
    });

    it("should set lastUpdated after loading", async () => {
      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.lastUpdated).not.toBeNull();
    });

    it("should have no error on success", async () => {
      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should set error on metrics fetch failure", async () => {
      vi.mocked(fetchAPI).mockRejectedValue(new Error("Metrics fetch failed"));

      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Metrics fetch failed");
    });

    it("should use fallback health on health fetch failure", async () => {
      vi.mocked(fetchAPI).mockImplementation(async (url: string) => {
        if (url.includes("/panel/summary")) return mockMetrics;
        if (url.includes("/health")) throw new Error("Health fetch failed");
        throw new Error("Unknown endpoint");
      });

      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should have fallback health values
      expect(result.current.health?.database).toBe(true);
      expect(result.current.health?.redis).toBe(true);
      expect(result.current.health?.qdrant).toBe(true);
    });
  });

  describe("WebSocket integration", () => {
    it("should connect to WebSocket on mount", async () => {
      renderHook(() => useMetrics());

      await waitFor(() => {
        expect(websocketService.connect).toHaveBeenCalled();
      });
    });

    it("should subscribe to status updates", async () => {
      renderHook(() => useMetrics());

      await waitFor(() => {
        expect(websocketService.subscribeStatus).toHaveBeenCalled();
      });
    });

    it("should subscribe to messages", async () => {
      renderHook(() => useMetrics());

      await waitFor(() => {
        expect(websocketService.subscribeMessages).toHaveBeenCalled();
      });
    });

    it("should update connection status on WebSocket status change", async () => {
      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.connectionStatus).toBe("closed");

      act(() => {
        if (statusCallback) {
          statusCallback("open");
        }
      });

      expect(result.current.connectionStatus).toBe("open");
    });

    it("should update metrics on metrics:update event", async () => {
      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const updatedMetrics = {
        total_users: 150,
        active_users: 75,
      };

      act(() => {
        if (messageCallback) {
          messageCallback({
            type: "metrics:update",
            payload: { metrics: updatedMetrics },
          });
        }
      });

      expect(result.current.metrics?.total_users).toBe(150);
      expect(result.current.metrics?.active_users).toBe(75);
    });

    it("should update metrics on metric event", async () => {
      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        if (messageCallback) {
          messageCallback({
            type: "metric",
            payload: { metrics: { total_users: 200 } },
          });
        }
      });

      expect(result.current.metrics?.total_users).toBe(200);
    });

    it("should not update metrics when paused", async () => {
      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Pause
      act(() => {
        result.current.togglePause();
      });

      expect(result.current.isPaused).toBe(true);

      const originalTotal = result.current.metrics?.total_users;

      // Try to update via WebSocket
      act(() => {
        if (messageCallback) {
          messageCallback({
            type: "metrics:update",
            payload: { metrics: { total_users: 500 } },
          });
        }
      });

      // Should not have changed
      expect(result.current.metrics?.total_users).toBe(originalTotal);
    });
  });

  describe("refreshNow", () => {
    it("should refetch all data", async () => {
      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshNow();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/panel/summary");
      expect(fetchAPI).toHaveBeenCalledWith("/health");
    });
  });

  describe("toggleAutoRefresh", () => {
    it("should toggle auto refresh state", async () => {
      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.autoRefresh).toBe(true);

      act(() => {
        result.current.toggleAutoRefresh();
      });

      expect(result.current.autoRefresh).toBe(false);

      act(() => {
        result.current.toggleAutoRefresh();
      });

      expect(result.current.autoRefresh).toBe(true);
    });
  });

  describe("togglePause", () => {
    it("should toggle pause state", async () => {
      const { result } = renderHook(() => useMetrics());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isPaused).toBe(false);

      act(() => {
        result.current.togglePause();
      });

      expect(result.current.isPaused).toBe(true);

      act(() => {
        result.current.togglePause();
      });

      expect(result.current.isPaused).toBe(false);
    });
  });

  describe("auto refresh", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should auto refresh when enabled and not paused", async () => {
      const { result } = renderHook(() =>
        useMetrics({ refreshIntervalMs: 5000 }),
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

    it("should not auto refresh when paused", async () => {
      const { result } = renderHook(() =>
        useMetrics({ refreshIntervalMs: 5000 }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.togglePause();
      });

      const callCount = vi.mocked(fetchAPI).mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      // Should not have made additional calls while paused
      expect(vi.mocked(fetchAPI).mock.calls.length).toBe(callCount);
    });

    it("should not auto refresh when autoRefresh is disabled", async () => {
      const { result } = renderHook(() =>
        useMetrics({ refreshIntervalMs: 5000 }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.toggleAutoRefresh();
      });

      const callCount = vi.mocked(fetchAPI).mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      expect(vi.mocked(fetchAPI).mock.calls.length).toBe(callCount);
    });
  });
});
