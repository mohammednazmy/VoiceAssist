/**
 * Tests for useFeatureFlags hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useFeatureFlags } from "./useFeatureFlags";

vi.mock("../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

import { fetchAPI } from "../lib/api";

const mockFlags = [
  {
    name: "voice_mode",
    description: "Enable voice interaction mode",
    flag_type: "boolean",
    enabled: true,
    value: true,
    default_value: false,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-15T12:00:00Z",
  },
  {
    name: "beta_features",
    description: "Enable beta features",
    flag_type: "boolean",
    enabled: false,
    value: false,
    default_value: false,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-10T12:00:00Z",
  },
  {
    name: "max_upload_size",
    description: "Maximum file upload size in MB",
    flag_type: "number",
    enabled: true,
    value: 50,
    default_value: 25,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-05T12:00:00Z",
  },
];

describe("useFeatureFlags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAPI).mockImplementation(
      async (url: string, options?: { method?: string }) => {
        if (options?.method === "POST" && url === "/api/admin/feature-flags") {
          return { success: true };
        }
        if (options?.method === "PATCH") {
          return { success: true };
        }
        if (options?.method === "DELETE") {
          return { success: true };
        }
        if (url === "/api/admin/feature-flags") {
          return { flags: mockFlags, total: 3 };
        }
        throw new Error("Unknown endpoint");
      },
    );
  });

  describe("initial load", () => {
    it("should return loading true initially", async () => {
      const { result } = renderHook(() => useFeatureFlags());
      expect(result.current.loading).toBe(true);

      // Wait for async operations to complete to avoid act() warnings
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it("should fetch flags on mount", async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/feature-flags");
    });

    it("should return flags after loading", async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.flags).toEqual(mockFlags);
      expect(result.current.flags).toHaveLength(3);
    });

    it("should set lastUpdated after loading", async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.lastUpdated).not.toBeNull();
    });

    it("should have no error on success", async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should set error on fetch failure", async () => {
      vi.mocked(fetchAPI).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Network error");
    });
  });

  describe("createFlag", () => {
    it("should create a new flag", async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const newFlag = {
        name: "new_feature",
        description: "A new feature flag",
        flag_type: "boolean" as const,
        enabled: false,
      };

      let success = false;
      await act(async () => {
        success = await result.current.createFlag(newFlag);
      });

      expect(success).toBe(true);
      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/feature-flags", {
        method: "POST",
        body: JSON.stringify(newFlag),
      });
    });

    it("should return false and set error on failure", async () => {
      vi.mocked(fetchAPI).mockImplementation(
        async (url: string, options?: { method?: string }) => {
          if (options?.method === "POST") throw new Error("Create failed");
          return { flags: mockFlags, total: 3 };
        },
      );

      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let success = true;
      await act(async () => {
        success = await result.current.createFlag({
          name: "test",
          description: "test",
        });
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe("Create failed");
    });
  });

  describe("updateFlag", () => {
    it("should update an existing flag", async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let success = false;
      await act(async () => {
        success = await result.current.updateFlag("voice_mode", {
          enabled: false,
        });
      });

      expect(success).toBe(true);
      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/feature-flags/voice_mode",
        {
          method: "PATCH",
          body: JSON.stringify({ enabled: false }),
        },
      );
    });

    it("should return false and set error on failure", async () => {
      vi.mocked(fetchAPI).mockImplementation(
        async (url: string, options?: { method?: string }) => {
          if (options?.method === "PATCH") throw new Error("Update failed");
          return { flags: mockFlags, total: 3 };
        },
      );

      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let success = true;
      await act(async () => {
        success = await result.current.updateFlag("voice_mode", {
          enabled: false,
        });
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe("Update failed");
    });
  });

  describe("deleteFlag", () => {
    it("should delete a flag", async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let success = false;
      await act(async () => {
        success = await result.current.deleteFlag("beta_features");
      });

      expect(success).toBe(true);
      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/feature-flags/beta_features",
        {
          method: "DELETE",
        },
      );
    });

    it("should return false and set error on failure", async () => {
      vi.mocked(fetchAPI).mockImplementation(
        async (url: string, options?: { method?: string }) => {
          if (options?.method === "DELETE") throw new Error("Delete failed");
          return { flags: mockFlags, total: 3 };
        },
      );

      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let success = true;
      await act(async () => {
        success = await result.current.deleteFlag("beta_features");
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe("Delete failed");
    });
  });

  describe("toggleFlag", () => {
    it("should toggle flag enabled state", async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let success = false;
      await act(async () => {
        success = await result.current.toggleFlag("voice_mode");
      });

      expect(success).toBe(true);
      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/feature-flags/voice_mode",
        {
          method: "PATCH",
          body: JSON.stringify({ enabled: false }),
        },
      );
    });

    it("should return false for non-existent flag", async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let success = true;
      await act(async () => {
        success = await result.current.toggleFlag("non_existent");
      });

      expect(success).toBe(false);
    });
  });

  describe("refreshFlags", () => {
    it("should refetch flags", async () => {
      const { result } = renderHook(() => useFeatureFlags());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshFlags();
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/feature-flags");
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
      const { result } = renderHook(() => useFeatureFlags());

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
        useFeatureFlags({ autoRefresh: true, refreshIntervalMs: 5000 }),
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
