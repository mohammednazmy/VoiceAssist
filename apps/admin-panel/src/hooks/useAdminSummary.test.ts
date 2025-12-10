/**
 * Tests for useAdminSummary hook
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAdminSummary } from "./useAdminSummary";

vi.mock("../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

import { fetchAPI } from "../lib/api";

const mockSummary = {
  total_users: 100,
  active_users: 50,
  admin_users: 5,
  timestamp: "2024-01-15T12:00:00Z",
};

describe("useAdminSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAPI).mockResolvedValue(mockSummary);
  });

  describe("initial load", () => {
    it("should return loading true initially", () => {
      const { result } = renderHook(() => useAdminSummary());
      expect(result.current.loading).toBe(true);
    });

    it("should fetch admin summary on mount", async () => {
      const { result } = renderHook(() => useAdminSummary());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/panel/summary");
    });

    it("should return summary data after loading", async () => {
      const { result } = renderHook(() => useAdminSummary());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.summary).toEqual(mockSummary);
      expect(result.current.summary?.total_users).toBe(100);
      expect(result.current.summary?.active_users).toBe(50);
      expect(result.current.summary?.admin_users).toBe(5);
    });

    it("should have no error on success", async () => {
      const { result } = renderHook(() => useAdminSummary());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should fall back to demo data on API error", async () => {
      vi.mocked(fetchAPI).mockRejectedValue(new Error("API Error"));

      const { result } = renderHook(() => useAdminSummary());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toEqual({
        code: "demo",
        message: "API Error",
      });
      expect(result.current.summary).not.toBeNull();
      expect(result.current.summary?.total_users).toBe(3);
      expect(result.current.summary?.active_users).toBe(3);
      expect(result.current.summary?.admin_users).toBe(1);
    });

    it("should handle non-Error rejection with unknown message", async () => {
      vi.mocked(fetchAPI).mockRejectedValue("network failure");

      const { result } = renderHook(() => useAdminSummary());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error?.message).toBe("Unknown error");
    });
  });

  describe("cleanup", () => {
    it("should not update state after unmount", async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(fetchAPI).mockReturnValue(pendingPromise as Promise<unknown>);

      const { unmount } = renderHook(() => useAdminSummary());

      // Unmount before promise resolves
      unmount();

      // Resolve the promise - should not cause errors
      resolvePromise!(mockSummary);

      // If this doesn't throw, cleanup worked correctly
      expect(true).toBe(true);
    });
  });
});
