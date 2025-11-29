/**
 * Tests for useCreateUser hook
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useCreateUser } from "./useCreateUser";

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

const mockCreatedUser = {
  id: "user-123",
  email: "newuser@example.com",
  full_name: "New User",
  is_admin: false,
  is_active: true,
  created_at: "2024-01-15T12:00:00Z",
};

const mockAdminUser = {
  ...mockCreatedUser,
  is_admin: true,
};

describe("useCreateUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createUser", () => {
    it("should create a standard user successfully", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce(mockCreatedUser);

      const { result } = renderHook(() => useCreateUser());

      let createdUser;
      await act(async () => {
        createdUser = await result.current.createUser({
          email: "newuser@example.com",
          full_name: "New User",
          password: "SecurePass123!",
          is_admin: false,
          is_active: true,
        });
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: "newuser@example.com",
          password: "SecurePass123!",
          full_name: "New User",
        }),
      });

      expect(createdUser).toEqual(mockCreatedUser);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("should create an admin user with role update", async () => {
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockCreatedUser) // Register call
        .mockResolvedValueOnce(mockAdminUser); // Role update call

      const { result } = renderHook(() => useCreateUser());

      let createdUser;
      await act(async () => {
        createdUser = await result.current.createUser({
          email: "newuser@example.com",
          full_name: "New User",
          password: "SecurePass123!",
          is_admin: true,
          is_active: true,
        });
      });

      // Should call register first
      expect(fetchAPI).toHaveBeenNthCalledWith(1, "/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: "newuser@example.com",
          password: "SecurePass123!",
          full_name: "New User",
        }),
      });

      // Then update role
      expect(fetchAPI).toHaveBeenNthCalledWith(
        2,
        "/api/admin/panel/users/user-123",
        {
          method: "PUT",
          body: JSON.stringify({
            is_admin: true,
            action_reason: "Admin role assigned during user creation",
          }),
        },
      );

      expect(createdUser?.is_admin).toBe(true);
    });

    it("should deactivate user if is_active is false", async () => {
      const inactiveUser = { ...mockCreatedUser, is_active: false };
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockCreatedUser)
        .mockResolvedValueOnce(inactiveUser);

      const { result } = renderHook(() => useCreateUser());

      await act(async () => {
        await result.current.createUser({
          email: "newuser@example.com",
          full_name: "New User",
          password: "SecurePass123!",
          is_admin: false,
          is_active: false,
        });
      });

      // Should call deactivate
      expect(fetchAPI).toHaveBeenNthCalledWith(
        2,
        "/api/admin/panel/users/user-123",
        {
          method: "PUT",
          body: JSON.stringify({
            is_active: false,
            action_reason: "Account created as inactive",
          }),
        },
      );
    });

    it("should handle email already registered error", async () => {
      const apiError = new APIError("Email already registered", "EMAIL_EXISTS");
      vi.mocked(fetchAPI).mockRejectedValueOnce(apiError);

      const { result } = renderHook(() => useCreateUser());

      await act(async () => {
        try {
          await result.current.createUser({
            email: "existing@example.com",
            full_name: "User",
            password: "SecurePass123!",
            is_admin: false,
            is_active: true,
          });
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe("This email is already registered");
    });

    it("should handle generic API error", async () => {
      vi.mocked(fetchAPI).mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => useCreateUser());

      await act(async () => {
        try {
          await result.current.createUser({
            email: "newuser@example.com",
            full_name: "User",
            password: "SecurePass123!",
            is_admin: false,
            is_active: true,
          });
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe("Network error");
    });

    it("should set isLoading during request", async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(fetchAPI).mockReturnValueOnce(
        pendingPromise as Promise<unknown>,
      );

      const { result } = renderHook(() => useCreateUser());

      // Start the request
      act(() => {
        result.current.createUser({
          email: "newuser@example.com",
          full_name: "User",
          password: "SecurePass123!",
          is_admin: false,
          is_active: true,
        });
      });

      // Should be loading
      expect(result.current.isLoading).toBe(true);

      // Resolve the promise
      await act(async () => {
        resolvePromise!(mockCreatedUser);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe("checkEmailExists", () => {
    it("should return true if email exists", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce({
        users: [{ email: "existing@example.com" }],
        total: 1,
      });

      const { result } = renderHook(() => useCreateUser());

      let exists;
      await act(async () => {
        exists = await result.current.checkEmailExists("existing@example.com");
      });

      expect(exists).toBe(true);
      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/panel/users?search=existing%40example.com&limit=1",
      );
    });

    it("should return false if email does not exist", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce({
        users: [],
        total: 0,
      });

      const { result } = renderHook(() => useCreateUser());

      let exists;
      await act(async () => {
        exists = await result.current.checkEmailExists("new@example.com");
      });

      expect(exists).toBe(false);
    });

    it("should return false on API error", async () => {
      vi.mocked(fetchAPI).mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => useCreateUser());

      let exists;
      await act(async () => {
        exists = await result.current.checkEmailExists("test@example.com");
      });

      // Should return false on error to not block user creation
      expect(exists).toBe(false);
    });

    it("should be case-insensitive when checking email", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce({
        users: [{ email: "Test@Example.COM" }],
        total: 1,
      });

      const { result } = renderHook(() => useCreateUser());

      let exists;
      await act(async () => {
        exists = await result.current.checkEmailExists("test@example.com");
      });

      expect(exists).toBe(true);
    });
  });
});
