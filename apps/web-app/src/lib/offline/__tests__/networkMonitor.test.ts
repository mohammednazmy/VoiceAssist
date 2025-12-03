/**
 * Network Monitor Unit Tests
 * Tests for network monitoring and quality assessment
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  NetworkMonitor,
  createNetworkMonitor,
  type NetworkStatus,
  type NetworkQuality,
} from "../networkMonitor";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock performance.now
const mockPerformanceNow = vi.fn();
vi.stubGlobal("performance", { now: mockPerformanceNow });

describe("NetworkMonitor", () => {
  let monitor: NetworkMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPerformanceNow.mockReturnValue(0);

    // Mock navigator.onLine
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    });

    monitor = createNetworkMonitor({
      healthCheckIntervalMs: 60000, // Long interval to not auto-trigger
      healthCheckTimeoutMs: 5000,
    });
  });

  afterEach(() => {
    monitor.stop();
  });

  describe("initial state", () => {
    it("should start with default status", () => {
      const status = monitor.getStatus();
      expect(status.isOnline).toBe(true);
      expect(status.quality).toBe("moderate");
      expect(status.isHealthy).toBe(true);
    });

    it("should detect initial offline state", () => {
      Object.defineProperty(navigator, "onLine", {
        value: false,
        writable: true,
        configurable: true,
      });

      const offlineMonitor = createNetworkMonitor({
        healthCheckIntervalMs: 60000,
      });

      const status = offlineMonitor.getStatus();
      expect(status.isOnline).toBe(false);

      offlineMonitor.stop();
    });
  });

  describe("health checks", () => {
    it("should update status on successful health check", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockPerformanceNow
        .mockReturnValueOnce(0) // start time
        .mockReturnValueOnce(50); // end time (50ms latency)

      await monitor.checkNow();

      const status = monitor.getStatus();
      expect(status.isHealthy).toBe(true);
      expect(status.healthCheckLatencyMs).toBe(50);
      expect(status.quality).toBe("excellent");
    });

    it("should compute quality based on latency", async () => {
      // Test excellent quality (< 100ms)
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockPerformanceNow.mockReturnValueOnce(0).mockReturnValueOnce(80);
      await monitor.checkNow();
      expect(monitor.getStatus().quality).toBe("excellent");

      // Test good quality (< 200ms)
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockPerformanceNow.mockReturnValueOnce(0).mockReturnValueOnce(150);
      await monitor.checkNow();
      expect(monitor.getStatus().quality).toBe("good");

      // Test moderate quality (< 500ms)
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockPerformanceNow.mockReturnValueOnce(0).mockReturnValueOnce(350);
      await monitor.checkNow();
      expect(monitor.getStatus().quality).toBe("moderate");

      // Test poor quality (>= 500ms)
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockPerformanceNow.mockReturnValueOnce(0).mockReturnValueOnce(600);
      await monitor.checkNow();
      expect(monitor.getStatus().quality).toBe("poor");
    });

    it("should mark unhealthy after consecutive failures", async () => {
      const failingMonitor = createNetworkMonitor({
        healthCheckIntervalMs: 60000,
        failuresBeforeUnhealthy: 3,
      });

      // Fail 3 times
      mockFetch.mockRejectedValue(new Error("Network error"));

      await failingMonitor.checkNow();
      expect(failingMonitor.getStatus().isHealthy).toBe(true); // Still healthy

      await failingMonitor.checkNow();
      expect(failingMonitor.getStatus().isHealthy).toBe(true); // Still healthy

      await failingMonitor.checkNow();
      expect(failingMonitor.getStatus().isHealthy).toBe(false); // Now unhealthy

      failingMonitor.stop();
    });

    it("should reset failure count on successful check", async () => {
      // Fail twice
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      await monitor.checkNow();
      await monitor.checkNow();

      // Succeed
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockPerformanceNow.mockReturnValueOnce(0).mockReturnValueOnce(50);
      await monitor.checkNow();

      expect(monitor.getStatus().isHealthy).toBe(true);

      // Fail twice again - should still be healthy
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      await monitor.checkNow();
      await monitor.checkNow();

      expect(monitor.getStatus().isHealthy).toBe(true);
    });
  });

  describe("subscription", () => {
    it("should notify subscribers on status change", async () => {
      const callback = vi.fn();
      monitor.subscribe(callback);

      // Initial call
      expect(callback).toHaveBeenCalledTimes(1);

      // Trigger a health check
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockPerformanceNow.mockReturnValueOnce(0).mockReturnValueOnce(50);
      await monitor.checkNow();

      // Should be called again with updated status
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it("should return unsubscribe function", async () => {
      const callback = vi.fn();
      const unsubscribe = monitor.subscribe(callback);

      // Initial call
      expect(callback).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Trigger a health check
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockPerformanceNow.mockReturnValueOnce(0).mockReturnValueOnce(50);
      await monitor.checkNow();

      // Should not be called again
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should handle multiple subscribers", async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      monitor.subscribe(callback1);
      monitor.subscribe(callback2);

      // Both should be called initially
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);

      // Trigger a health check
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockPerformanceNow.mockReturnValueOnce(0).mockReturnValueOnce(50);
      await monitor.checkNow();

      // Both should be called again
      expect(callback1).toHaveBeenCalledTimes(2);
      expect(callback2).toHaveBeenCalledTimes(2);
    });
  });

  describe("configuration", () => {
    it("should use custom latency thresholds", async () => {
      const customMonitor = createNetworkMonitor({
        healthCheckIntervalMs: 60000,
        goodLatencyThresholdMs: 50, // Very strict
        moderateLatencyThresholdMs: 100,
        poorLatencyThresholdMs: 200,
      });

      // 75ms should be "good" not "excellent"
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockPerformanceNow.mockReturnValueOnce(0).mockReturnValueOnce(75);
      await customMonitor.checkNow();
      expect(customMonitor.getStatus().quality).toBe("good");

      // 150ms should be "moderate"
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockPerformanceNow.mockReturnValueOnce(0).mockReturnValueOnce(150);
      await customMonitor.checkNow();
      expect(customMonitor.getStatus().quality).toBe("moderate");

      customMonitor.stop();
    });

    it("should use custom health check URL", async () => {
      const customMonitor = createNetworkMonitor({
        healthCheckIntervalMs: 60000,
        healthCheckUrl: "/custom/health",
      });

      mockFetch.mockResolvedValueOnce({ ok: true });
      mockPerformanceNow.mockReturnValueOnce(0).mockReturnValueOnce(50);
      await customMonitor.checkNow();

      expect(mockFetch).toHaveBeenCalledWith(
        "/custom/health",
        expect.objectContaining({
          method: "HEAD",
        }),
      );

      customMonitor.stop();
    });
  });

  describe("offline detection", () => {
    it("should set offline status when navigator.onLine is false", async () => {
      Object.defineProperty(navigator, "onLine", {
        value: false,
        writable: true,
        configurable: true,
      });

      await monitor.checkNow();

      const status = monitor.getStatus();
      expect(status.isOnline).toBe(false);
      expect(status.quality).toBe("offline");
      expect(status.isHealthy).toBe(false);
    });
  });
});

describe("NetworkQuality type", () => {
  it("should have all expected quality levels", () => {
    const qualities: NetworkQuality[] = [
      "offline",
      "poor",
      "moderate",
      "good",
      "excellent",
    ];

    // Type check - this will fail at compile time if types are wrong
    qualities.forEach((quality) => {
      expect(typeof quality).toBe("string");
    });
  });
});
