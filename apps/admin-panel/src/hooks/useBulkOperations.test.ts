/**
 * Tests for useBulkOperations hook
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useBulkOperations } from "./useBulkOperations";

vi.mock("../lib/api", () => ({
  fetchAPI: vi.fn(),
  APIError: class APIError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { fetchAPI, APIError } from "../lib/api";

const mockBulkResult = {
  action: "activate" as const,
  total_requested: 3,
  successful: 2,
  failed: 1,
  skipped: 0,
  results: {
    successful: [
      { user_id: "user-1", email: "user1@example.com" },
      { user_id: "user-2", email: "user2@example.com" },
    ],
    failed: [{ user_id: "user-3", reason: "User not found" }],
    skipped: [],
  },
};

describe("useBulkOperations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("selection management", () => {
    it("should start with empty selection", () => {
      const { result } = renderHook(() => useBulkOperations());

      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.selectedCount).toBe(0);
      expect(result.current.isAllSelected).toBe(false);
    });

    it("should toggle selection on", () => {
      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.toggleSelection("user-1");
      });

      expect(result.current.selectedIds.has("user-1")).toBe(true);
      expect(result.current.selectedCount).toBe(1);
    });

    it("should toggle selection off", () => {
      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.toggleSelection("user-1");
      });

      expect(result.current.selectedIds.has("user-1")).toBe(true);

      act(() => {
        result.current.toggleSelection("user-1");
      });

      expect(result.current.selectedIds.has("user-1")).toBe(false);
      expect(result.current.selectedCount).toBe(0);
    });

    it("should select multiple users", () => {
      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.toggleSelection("user-1");
        result.current.toggleSelection("user-2");
        result.current.toggleSelection("user-3");
      });

      expect(result.current.selectedCount).toBe(3);
      expect(result.current.selectedIds.has("user-1")).toBe(true);
      expect(result.current.selectedIds.has("user-2")).toBe(true);
      expect(result.current.selectedIds.has("user-3")).toBe(true);
    });

    it("should select all users at once", () => {
      const { result } = renderHook(() => useBulkOperations(5));

      act(() => {
        result.current.selectAll([
          "user-1",
          "user-2",
          "user-3",
          "user-4",
          "user-5",
        ]);
      });

      expect(result.current.selectedCount).toBe(5);
      expect(result.current.isAllSelected).toBe(true);
    });

    it("should clear selection", () => {
      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.toggleSelection("user-1");
        result.current.toggleSelection("user-2");
      });

      expect(result.current.selectedCount).toBe(2);

      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectedCount).toBe(0);
      expect(result.current.selectedIds.size).toBe(0);
    });

    it("should check if user is selected", () => {
      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.toggleSelection("user-1");
      });

      expect(result.current.isSelected("user-1")).toBe(true);
      expect(result.current.isSelected("user-2")).toBe(false);
    });

    it("should report isAllSelected correctly", () => {
      const { result } = renderHook(() => useBulkOperations(3));

      expect(result.current.isAllSelected).toBe(false);

      act(() => {
        result.current.selectAll(["user-1", "user-2", "user-3"]);
      });

      expect(result.current.isAllSelected).toBe(true);

      act(() => {
        result.current.toggleSelection("user-3");
      });

      expect(result.current.isAllSelected).toBe(false);
    });
  });

  describe("executeBulkOperation", () => {
    it("should execute bulk activate operation", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce(mockBulkResult);

      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.selectAll(["user-1", "user-2", "user-3"]);
      });

      let response;
      await act(async () => {
        response = await result.current.executeBulkOperation(
          "activate",
          undefined,
          "Bulk activation",
        );
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/panel/users/bulk", {
        method: "POST",
        body: JSON.stringify({
          user_ids: ["user-1", "user-2", "user-3"],
          action: "activate",
          reason: "Bulk activation",
        }),
      });

      expect(response).toEqual(mockBulkResult);
      expect(result.current.lastResult).toEqual(mockBulkResult);
    });

    it("should execute bulk deactivate operation", async () => {
      const deactivateResult = {
        ...mockBulkResult,
        action: "deactivate" as const,
      };
      vi.mocked(fetchAPI).mockResolvedValueOnce(deactivateResult);

      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.toggleSelection("user-1");
        result.current.toggleSelection("user-2");
      });

      await act(async () => {
        await result.current.executeBulkOperation(
          "deactivate",
          undefined,
          "Security concern",
        );
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/panel/users/bulk", {
        method: "POST",
        body: JSON.stringify({
          user_ids: ["user-1", "user-2"],
          action: "deactivate",
          reason: "Security concern",
        }),
      });
    });

    it("should execute bulk set_role operation", async () => {
      const setRoleResult = { ...mockBulkResult, action: "set_role" as const };
      vi.mocked(fetchAPI).mockResolvedValueOnce(setRoleResult);

      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.toggleSelection("user-1");
        result.current.toggleSelection("user-2");
      });

      await act(async () => {
        await result.current.executeBulkOperation(
          "set_role",
          "viewer",
          "Downgrade to viewer",
        );
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/panel/users/bulk", {
        method: "POST",
        body: JSON.stringify({
          user_ids: ["user-1", "user-2"],
          action: "set_role",
          role: "viewer",
          reason: "Downgrade to viewer",
        }),
      });
    });

    it("should remove successfully processed users from selection", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce(mockBulkResult);

      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.selectAll(["user-1", "user-2", "user-3"]);
      });

      expect(result.current.selectedCount).toBe(3);

      await act(async () => {
        await result.current.executeBulkOperation("activate");
      });

      // user-1 and user-2 were successful, user-3 failed
      expect(result.current.selectedIds.has("user-1")).toBe(false);
      expect(result.current.selectedIds.has("user-2")).toBe(false);
      expect(result.current.selectedIds.has("user-3")).toBe(true);
      expect(result.current.selectedCount).toBe(1);
    });

    it("should throw error when no users selected", async () => {
      const { result } = renderHook(() => useBulkOperations());

      await act(async () => {
        try {
          await result.current.executeBulkOperation("activate");
          expect.fail("Should have thrown");
        } catch (err) {
          expect((err as Error).message).toBe("No users selected");
        }
      });
    });

    it("should handle API errors", async () => {
      const apiError = new APIError("Forbidden", "FORBIDDEN");
      vi.mocked(fetchAPI).mockRejectedValueOnce(apiError);

      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.toggleSelection("user-1");
      });

      await act(async () => {
        try {
          await result.current.executeBulkOperation("activate");
        } catch {
          // Expected
        }
      });

      expect(result.current.error).toBe("Forbidden");
      expect(result.current.isLoading).toBe(false);
    });

    it("should set isLoading during operation", async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(fetchAPI).mockReturnValueOnce(
        pendingPromise as Promise<unknown>,
      );

      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.toggleSelection("user-1");
      });

      act(() => {
        result.current.executeBulkOperation("activate");
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolvePromise!(mockBulkResult);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("should execute without reason", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce(mockBulkResult);

      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.toggleSelection("user-1");
      });

      await act(async () => {
        await result.current.executeBulkOperation("activate");
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/panel/users/bulk", {
        method: "POST",
        body: JSON.stringify({
          user_ids: ["user-1"],
          action: "activate",
          reason: undefined,
        }),
      });
    });
  });

  describe("clearError", () => {
    it("should clear error state", async () => {
      vi.mocked(fetchAPI).mockRejectedValueOnce(new Error("Some error"));

      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.toggleSelection("user-1");
      });

      await act(async () => {
        try {
          await result.current.executeBulkOperation("activate");
        } catch {
          // Expected
        }
      });

      expect(result.current.error).toBe("Some error");

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("result tracking", () => {
    it("should store last result", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce(mockBulkResult);

      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.toggleSelection("user-1");
      });

      await act(async () => {
        await result.current.executeBulkOperation("activate");
      });

      expect(result.current.lastResult).toEqual(mockBulkResult);
      expect(result.current.lastResult?.successful).toBe(2);
      expect(result.current.lastResult?.failed).toBe(1);
    });

    it("should clear lastResult on new operation", async () => {
      const result1 = { ...mockBulkResult };
      const result2 = { ...mockBulkResult, successful: 5 };

      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(result1)
        .mockResolvedValueOnce(result2);

      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.toggleSelection("user-1");
      });

      await act(async () => {
        await result.current.executeBulkOperation("activate");
      });

      expect(result.current.lastResult?.successful).toBe(2);

      act(() => {
        result.current.toggleSelection("user-2");
      });

      await act(async () => {
        await result.current.executeBulkOperation("deactivate");
      });

      expect(result.current.lastResult?.successful).toBe(5);
    });
  });
});
