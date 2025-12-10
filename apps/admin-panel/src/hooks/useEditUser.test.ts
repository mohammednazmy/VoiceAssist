/**
 * Tests for useEditUser hook
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useEditUser } from "./useEditUser";

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

import { fetchAPI } from "../lib/api";

const mockUpdatedUser = {
  user: {
    id: "user-123",
    email: "test@example.com",
    full_name: "Updated Name",
    is_admin: false,
    admin_role: "user",
    is_active: true,
  },
  rate_limit: {
    limit: 10,
    remaining: 9,
    reset_in: 60,
  },
};

describe("useEditUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("updateUser", () => {
    it("should update user successfully", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce(mockUpdatedUser);

      const { result } = renderHook(() => useEditUser());

      let response;
      await act(async () => {
        response = await result.current.updateUser("user-123", {
          full_name: "Updated Name",
        });
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/panel/users/user-123", {
        method: "PUT",
        body: JSON.stringify({
          full_name: "Updated Name",
        }),
      });

      expect(response).toEqual(mockUpdatedUser);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("should update user role to admin", async () => {
      const adminResponse = {
        ...mockUpdatedUser,
        user: { ...mockUpdatedUser.user, is_admin: true, admin_role: "admin" },
      };
      vi.mocked(fetchAPI).mockResolvedValueOnce(adminResponse);

      const { result } = renderHook(() => useEditUser());

      await act(async () => {
        await result.current.updateUser("user-123", {
          admin_role: "admin",
          action_reason: "Promoted to admin",
        });
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/panel/users/user-123", {
        method: "PUT",
        body: JSON.stringify({
          admin_role: "admin",
          action_reason: "Promoted to admin",
        }),
      });
    });

    it("should update user role to viewer", async () => {
      const viewerResponse = {
        ...mockUpdatedUser,
        user: { ...mockUpdatedUser.user, admin_role: "viewer" },
      };
      vi.mocked(fetchAPI).mockResolvedValueOnce(viewerResponse);

      const { result } = renderHook(() => useEditUser());

      await act(async () => {
        await result.current.updateUser("user-123", {
          admin_role: "viewer",
        });
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/panel/users/user-123", {
        method: "PUT",
        body: JSON.stringify({
          admin_role: "viewer",
        }),
      });
    });

    it("should deactivate user", async () => {
      const inactiveResponse = {
        ...mockUpdatedUser,
        user: { ...mockUpdatedUser.user, is_active: false },
      };
      vi.mocked(fetchAPI).mockResolvedValueOnce(inactiveResponse);

      const { result } = renderHook(() => useEditUser());

      await act(async () => {
        await result.current.updateUser("user-123", {
          is_active: false,
          action_reason: "User requested deactivation",
        });
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/panel/users/user-123", {
        method: "PUT",
        body: JSON.stringify({
          is_active: false,
          action_reason: "User requested deactivation",
        }),
      });
    });

    it("should track rate limit info", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce(mockUpdatedUser);

      const { result } = renderHook(() => useEditUser());

      await act(async () => {
        await result.current.updateUser("user-123", { full_name: "Test" });
      });

      expect(result.current.rateLimitInfo).toEqual({
        limit: 10,
        remaining: 9,
        reset_in: 60,
      });
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(fetchAPI).mockRejectedValueOnce(new Error("User not found"));

      const { result } = renderHook(() => useEditUser());

      await act(async () => {
        try {
          await result.current.updateUser("invalid-id", { full_name: "Test" });
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe("User not found");
      expect(result.current.isLoading).toBe(false);
    });

    it("should handle permission denied error", async () => {
      vi.mocked(fetchAPI).mockRejectedValueOnce(
        new Error("Cannot modify your own account"),
      );

      const { result } = renderHook(() => useEditUser());

      await act(async () => {
        try {
          await result.current.updateUser("my-user-id", { admin_role: "user" });
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe("Cannot modify your own account");
    });

    it("should set isLoading during request", async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(fetchAPI).mockReturnValueOnce(
        pendingPromise as Promise<unknown>,
      );

      const { result } = renderHook(() => useEditUser());

      act(() => {
        result.current.updateUser("user-123", { full_name: "Test" });
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolvePromise!(mockUpdatedUser);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("should update multiple fields at once", async () => {
      const multiUpdateResponse = {
        user: {
          id: "user-123",
          email: "test@example.com",
          full_name: "New Full Name",
          is_admin: true,
          admin_role: "admin",
          is_active: false,
        },
      };
      vi.mocked(fetchAPI).mockResolvedValueOnce(multiUpdateResponse);

      const { result } = renderHook(() => useEditUser());

      await act(async () => {
        await result.current.updateUser("user-123", {
          full_name: "New Full Name",
          admin_role: "admin",
          is_active: false,
          action_reason: "Multiple updates",
        });
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/panel/users/user-123", {
        method: "PUT",
        body: JSON.stringify({
          full_name: "New Full Name",
          admin_role: "admin",
          is_active: false,
          action_reason: "Multiple updates",
        }),
      });
    });
  });

  describe("clearError", () => {
    it("should clear error state", async () => {
      vi.mocked(fetchAPI).mockRejectedValueOnce(new Error("Some error"));

      const { result } = renderHook(() => useEditUser());

      await act(async () => {
        try {
          await result.current.updateUser("user-123", { full_name: "Test" });
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
});
