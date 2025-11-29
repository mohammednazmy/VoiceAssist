/**
 * Tests for useSystemKeys hook - System API key management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useSystemKeys } from "./useSystemKeys";

// Mock the api module
vi.mock("../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

import { fetchAPI } from "../lib/api";

const mockKeys = [
  {
    integration_id: "openai",
    key_name: "OPENAI_API_KEY",
    is_configured: true,
    source: "environment" as const,
    masked_value: "sk-...abc123",
    is_override: false,
    validation_status: "valid" as const,
    last_validated_at: "2024-01-15T12:00:00Z",
    updated_at: null,
  },
  {
    integration_id: "pubmed",
    key_name: "PUBMED_API_KEY",
    is_configured: true,
    source: "database" as const,
    masked_value: "pm-...xyz789",
    is_override: true,
    validation_status: "unknown" as const,
    last_validated_at: null,
    updated_at: "2024-01-14T10:00:00Z",
  },
  {
    integration_id: "elevenlabs",
    key_name: "ELEVENLABS_API_KEY",
    is_configured: false,
    source: "not_configured" as const,
    masked_value: null,
    is_override: false,
    validation_status: null,
    last_validated_at: null,
    updated_at: null,
  },
];

const mockSummary = {
  total: 3,
  configured: 2,
  from_env: 1,
  from_db: 1,
  not_configured: 1,
};

const mockKeysResponse = {
  keys: mockKeys,
  summary: mockSummary,
};

describe("useSystemKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAPI).mockResolvedValue(mockKeysResponse);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initial load", () => {
    it("should fetch system keys on mount", async () => {
      const { result } = renderHook(() => useSystemKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/integrations/api-keys/summary",
      );
      expect(result.current.keys).toEqual(mockKeys);
      expect(result.current.summary).toEqual(mockSummary);
      expect(result.current.error).toBeNull();
    });

    it("should handle fetch error", async () => {
      vi.mocked(fetchAPI).mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => useSystemKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Network error");
      expect(result.current.keys).toEqual([]);
    });

    it("should set lastUpdated after successful fetch", async () => {
      const { result } = renderHook(() => useSystemKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe("refreshKeys", () => {
    it("should refresh keys on demand", async () => {
      const { result } = renderHook(() => useSystemKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchAPI).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.refreshKeys();
      });

      expect(fetchAPI).toHaveBeenCalledTimes(2);
    });
  });

  describe("updateKey", () => {
    it("should update a system key value", async () => {
      const { result } = renderHook(() => useSystemKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.mocked(fetchAPI).mockResolvedValueOnce({ success: true });
      vi.mocked(fetchAPI).mockResolvedValueOnce(mockKeysResponse); // refresh after update

      await act(async () => {
        await result.current.updateKey("elevenlabs", "new-api-key-value");
      });

      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/integrations/elevenlabs/api-key",
        {
          method: "PUT",
          body: JSON.stringify({ value: "new-api-key-value" }),
        },
      );
    });

    it("should refresh keys after update", async () => {
      const { result } = renderHook(() => useSystemKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const updatedKeys = {
        ...mockKeysResponse,
        keys: mockKeys.map((k) =>
          k.integration_id === "elevenlabs"
            ? { ...k, is_configured: true, source: "database" as const }
            : k,
        ),
        summary: {
          ...mockSummary,
          configured: 3,
          not_configured: 0,
          from_db: 2,
        },
      };

      vi.mocked(fetchAPI).mockResolvedValueOnce({ success: true });
      vi.mocked(fetchAPI).mockResolvedValueOnce(updatedKeys);

      await act(async () => {
        await result.current.updateKey("elevenlabs", "new-key");
      });

      expect(result.current.summary?.configured).toBe(3);
    });
  });

  describe("clearOverride", () => {
    it("should clear a database override", async () => {
      const { result } = renderHook(() => useSystemKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.mocked(fetchAPI).mockResolvedValueOnce({ success: true });
      vi.mocked(fetchAPI).mockResolvedValueOnce(mockKeysResponse);

      await act(async () => {
        await result.current.clearOverride("pubmed");
      });

      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/integrations/pubmed/api-key",
        {
          method: "DELETE",
        },
      );
    });

    it("should refresh keys after clearing override", async () => {
      const { result } = renderHook(() => useSystemKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.mocked(fetchAPI).mockResolvedValueOnce({ success: true });
      vi.mocked(fetchAPI).mockResolvedValueOnce({
        ...mockKeysResponse,
        summary: { ...mockSummary, from_db: 0 },
      });

      await act(async () => {
        await result.current.clearOverride("pubmed");
      });

      expect(result.current.summary?.from_db).toBe(0);
    });
  });

  describe("validateKey", () => {
    it("should validate a system key and return result", async () => {
      const { result } = renderHook(() => useSystemKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const validationResult = {
        success: true,
        message: "API key is valid",
        latency_ms: 150,
      };

      vi.mocked(fetchAPI).mockResolvedValueOnce(validationResult);
      vi.mocked(fetchAPI).mockResolvedValueOnce(mockKeysResponse);

      let validationResponse;
      await act(async () => {
        validationResponse = await result.current.validateKey("openai");
      });

      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/integrations/openai/api-key/validate",
        {
          method: "POST",
        },
      );
      expect(validationResponse).toEqual(validationResult);
    });

    it("should handle validation failure", async () => {
      const { result } = renderHook(() => useSystemKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const failedValidation = {
        success: false,
        message: "Invalid API key",
        latency_ms: 200,
      };

      vi.mocked(fetchAPI).mockResolvedValueOnce(failedValidation);
      vi.mocked(fetchAPI).mockResolvedValueOnce(mockKeysResponse);

      let validationResponse;
      await act(async () => {
        validationResponse = await result.current.validateKey("openai");
      });

      expect(validationResponse?.success).toBe(false);
      expect(validationResponse?.message).toBe("Invalid API key");
    });

    it("should refresh keys after validation to update status", async () => {
      const { result } = renderHook(() => useSystemKeys());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.mocked(fetchAPI).mockResolvedValueOnce({
        success: true,
        message: "Valid",
        latency_ms: 100,
      });

      const updatedKeys = {
        ...mockKeysResponse,
        keys: mockKeys.map((k) =>
          k.integration_id === "pubmed"
            ? {
                ...k,
                validation_status: "valid" as const,
                last_validated_at: new Date().toISOString(),
              }
            : k,
        ),
      };
      vi.mocked(fetchAPI).mockResolvedValueOnce(updatedKeys);

      await act(async () => {
        await result.current.validateKey("pubmed");
      });

      const pubmedKey = result.current.keys.find(
        (k) => k.integration_id === "pubmed",
      );
      expect(pubmedKey?.validation_status).toBe("valid");
    });
  });

  describe("autoRefresh", () => {
    it("should auto-refresh when enabled", async () => {
      vi.useFakeTimers();

      const { result } = renderHook(() =>
        useSystemKeys({ autoRefresh: true, refreshIntervalMs: 5000 }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchAPI).toHaveBeenCalledTimes(1);

      // Advance timer
      vi.mocked(fetchAPI).mockResolvedValueOnce(mockKeysResponse);
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalledTimes(2);
      });
    });

    it("should not auto-refresh when disabled", async () => {
      vi.useFakeTimers();

      const { result } = renderHook(() =>
        useSystemKeys({ autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchAPI).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(120000);
      });

      // Should still be 1 call
      expect(fetchAPI).toHaveBeenCalledTimes(1);
    });
  });
});
