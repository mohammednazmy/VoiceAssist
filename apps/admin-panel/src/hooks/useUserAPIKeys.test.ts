/**
 * Tests for useUserAPIKeys hook - User API key management
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useUserAPIKeys, UserAPIKeyCreated } from "./useUserAPIKeys";

// Mock the api module
vi.mock("../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

import { fetchAPI } from "../lib/api";

const mockKeys = [
  {
    id: "key-1",
    name: "Production API Key",
    key_prefix: "vak_prod_",
    created_at: "2024-01-10T12:00:00Z",
    last_used_at: "2024-01-15T09:30:00Z",
    expires_at: null,
    is_revoked: false,
  },
  {
    id: "key-2",
    name: "Development Key",
    key_prefix: "vak_dev_",
    created_at: "2024-01-05T08:00:00Z",
    last_used_at: null,
    expires_at: "2024-12-31T23:59:59Z",
    is_revoked: false,
  },
  {
    id: "key-3",
    name: "Old Key",
    key_prefix: "vak_old_",
    created_at: "2023-06-01T00:00:00Z",
    last_used_at: "2023-12-01T12:00:00Z",
    expires_at: null,
    is_revoked: true,
  },
];

const mockKeysResponse = {
  keys: mockKeys,
  total: 3,
};

const mockCreatedKey = {
  id: "key-4",
  name: "New API Key",
  key_prefix: "vak_new_",
  key: "vak_new_abcdef123456789", // Full key, only shown once
  created_at: "2024-01-16T10:00:00Z",
  last_used_at: null,
  expires_at: null,
  is_revoked: false,
};

describe("useUserAPIKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAPI).mockResolvedValue(mockKeysResponse);
  });

  describe("initial load", () => {
    it("should fetch user API keys on mount", async () => {
      const { result } = renderHook(() => useUserAPIKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/auth/api-keys");
      expect(result.current.keys).toEqual(mockKeys);
      expect(result.current.error).toBeNull();
    });

    it("should handle fetch error", async () => {
      vi.mocked(fetchAPI).mockRejectedValueOnce(new Error("Unauthorized"));

      const { result } = renderHook(() => useUserAPIKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Unauthorized");
      expect(result.current.keys).toEqual([]);
    });

    it("should set lastUpdated after successful fetch", async () => {
      const { result } = renderHook(() => useUserAPIKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.lastUpdated).toBeInstanceOf(Date);
    });

    it("should set loading state during fetch", async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(fetchAPI).mockReturnValueOnce(
        pendingPromise as Promise<unknown>,
      );

      const { result } = renderHook(() => useUserAPIKeys());

      // Should be loading initially
      expect(result.current.loading).toBe(true);

      await act(async () => {
        resolvePromise!(mockKeysResponse);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe("refreshKeys", () => {
    it("should refresh keys on demand", async () => {
      const { result } = renderHook(() => useUserAPIKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchAPI).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.refreshKeys();
      });

      expect(fetchAPI).toHaveBeenCalledTimes(2);
    });

    it("should update lastUpdated on refresh", async () => {
      const { result } = renderHook(() => useUserAPIKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialLastUpdated = result.current.lastUpdated;

      // Wait a bit to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));

      await act(async () => {
        await result.current.refreshKeys();
      });

      expect(result.current.lastUpdated?.getTime()).toBeGreaterThanOrEqual(
        initialLastUpdated?.getTime() || 0,
      );
    });
  });

  describe("createKey", () => {
    it("should create a new API key without expiration", async () => {
      const { result } = renderHook(() => useUserAPIKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockCreatedKey)
        .mockResolvedValueOnce({
          ...mockKeysResponse,
          keys: [...mockKeys, mockCreatedKey],
        });

      let createdKey: UserAPIKeyCreated | undefined;
      await act(async () => {
        createdKey = await result.current.createKey("New API Key");
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/auth/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: "New API Key",
          expires_in_days: null,
        }),
      });
      expect(createdKey).toEqual(mockCreatedKey);
      expect(createdKey!.key).toBe("vak_new_abcdef123456789"); // Full key returned
    });

    it("should create a new API key with expiration", async () => {
      const { result } = renderHook(() => useUserAPIKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const keyWithExpiry = {
        ...mockCreatedKey,
        expires_at: "2024-04-16T10:00:00Z",
      };

      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(keyWithExpiry)
        .mockResolvedValueOnce(mockKeysResponse);

      let createdKey: UserAPIKeyCreated | undefined;
      await act(async () => {
        createdKey = await result.current.createKey("Expiring Key", 90);
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/auth/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: "Expiring Key",
          expires_in_days: 90,
        }),
      });
      expect(createdKey!.expires_at).toBe("2024-04-16T10:00:00Z");
    });

    it("should refresh keys after creation", async () => {
      const { result } = renderHook(() => useUserAPIKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.keys.length).toBe(3);

      const newKeysList = [...mockKeys, { ...mockCreatedKey, key: undefined }];
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockCreatedKey)
        .mockResolvedValueOnce({ keys: newKeysList, total: 4 });

      await act(async () => {
        await result.current.createKey("New Key");
      });

      expect(result.current.keys.length).toBe(4);
    });

    it("should throw error on creation failure", async () => {
      const { result } = renderHook(() => useUserAPIKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.mocked(fetchAPI).mockRejectedValueOnce(
        new Error("Rate limit exceeded"),
      );

      await expect(
        act(async () => {
          await result.current.createKey("Test Key");
        }),
      ).rejects.toThrow("Rate limit exceeded");
    });
  });

  describe("revokeKey", () => {
    it("should revoke an API key", async () => {
      const { result } = renderHook(() => useUserAPIKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.mocked(fetchAPI)
        .mockResolvedValueOnce({ message: "Key revoked" })
        .mockResolvedValueOnce(mockKeysResponse);

      await act(async () => {
        await result.current.revokeKey("key-1");
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/auth/api-keys/key-1", {
        method: "DELETE",
      });
    });

    it("should refresh keys after revocation", async () => {
      const { result } = renderHook(() => useUserAPIKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const updatedKeys = mockKeys.map((k) =>
        k.id === "key-1" ? { ...k, is_revoked: true } : k,
      );

      vi.mocked(fetchAPI)
        .mockResolvedValueOnce({ message: "Key revoked" })
        .mockResolvedValueOnce({ keys: updatedKeys, total: 3 });

      await act(async () => {
        await result.current.revokeKey("key-1");
      });

      const revokedKey = result.current.keys.find((k) => k.id === "key-1");
      expect(revokedKey?.is_revoked).toBe(true);
    });

    it("should throw error on revocation failure", async () => {
      const { result } = renderHook(() => useUserAPIKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.mocked(fetchAPI).mockRejectedValueOnce(new Error("Key not found"));

      await expect(
        act(async () => {
          await result.current.revokeKey("nonexistent-key");
        }),
      ).rejects.toThrow("Key not found");
    });
  });

  describe("edge cases", () => {
    it("should handle empty keys list", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce({ keys: [], total: 0 });

      const { result } = renderHook(() => useUserAPIKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.keys).toEqual([]);
    });

    it("should filter out revoked keys in active keys count", async () => {
      const { result } = renderHook(() => useUserAPIKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const activeKeys = result.current.keys.filter((k) => !k.is_revoked);
      expect(activeKeys.length).toBe(2);
    });
  });
});
