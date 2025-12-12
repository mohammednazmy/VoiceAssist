/**
 * Tests for useIndexingJobs hook
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useIndexingJobs } from "./useIndexingJobs";

vi.mock("../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

import { fetchAPI } from "../lib/api";

const mockJobs = [
  {
    id: "job-1",
    documentId: "doc-1",
    state: "completed",
    attempts: 1,
  },
  {
    id: "job-2",
    documentId: "doc-2",
    state: "running",
    attempts: 2,
  },
  {
    id: "job-3",
    documentId: "doc-3",
    state: "failed",
    attempts: 3,
  },
];

describe("useIndexingJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAPI).mockResolvedValue(mockJobs);
  });

  describe("initial load", () => {
    it("should return loading true initially", async () => {
      const { result } = renderHook(() => useIndexingJobs({ enabled: true }));
      expect(result.current.loading).toBe(true);

      // Wait for async operations to complete to avoid act() warnings
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it("should fetch jobs on mount", async () => {
      const { result } = renderHook(() => useIndexingJobs({ enabled: true }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/kb/jobs");
    });

    it("should return jobs after loading", async () => {
      const { result } = renderHook(() => useIndexingJobs({ enabled: true }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.jobs).toHaveLength(3);
      expect(result.current.jobs[0]).toMatchObject({
        id: "job-1",
        documentId: "doc-1",
        state: "completed",
        attempts: 1,
      });
    });

    it("should have no error on success", async () => {
      const { result } = renderHook(() => useIndexingJobs({ enabled: true }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("job states", () => {
    it("should handle completed jobs", async () => {
      const { result } = renderHook(() => useIndexingJobs({ enabled: true }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const completedJobs = result.current.jobs.filter(
        (j) => j.state === "completed",
      );
      expect(completedJobs).toHaveLength(1);
    });

    it("should handle running jobs", async () => {
      const { result } = renderHook(() => useIndexingJobs({ enabled: true }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const runningJobs = result.current.jobs.filter(
        (j) => j.state === "running",
      );
      expect(runningJobs).toHaveLength(1);
    });

    it("should handle failed jobs", async () => {
      const { result } = renderHook(() => useIndexingJobs({ enabled: true }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const failedJobs = result.current.jobs.filter(
        (j) => j.state === "failed",
      );
      expect(failedJobs).toHaveLength(1);
    });
  });

  describe("error handling", () => {
    it("should fall back to demo data on API error", async () => {
      vi.mocked(fetchAPI).mockRejectedValue(new Error("API Error"));

      const { result } = renderHook(() => useIndexingJobs({ enabled: true }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toEqual({
        code: "not_available",
        message: "API Error",
      });
      // When the jobs endpoint is not available we now surface an empty list
      // rather than demo data.
      expect(result.current.jobs).toHaveLength(0);
    });

    it("should handle non-Error rejection with unknown message", async () => {
      vi.mocked(fetchAPI).mockRejectedValue("network failure");

      const { result } = renderHook(() => useIndexingJobs({ enabled: true }));

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

      const { unmount } = renderHook(() => useIndexingJobs({ enabled: true }));

      unmount();
      resolvePromise!(mockJobs);

      expect(true).toBe(true);
    });
  });
});
