/**
 * Tests for useAuditLogs hook - Audit log fetching and export
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAuditLogs } from "./useAuditLogs";

// Mock the apiClient module
const mockRequest = vi.fn();
const mockGetBaseUrl = vi.fn().mockReturnValue("https://admin.asimo.io");

vi.mock("../lib/apiClient", () => ({
  getApiClient: () => ({
    request: mockRequest,
    getBaseUrl: mockGetBaseUrl,
  }),
}));

// Mock fetch for export functionality
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn().mockReturnValue("mock-token"),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
Object.defineProperty(window, "localStorage", { value: mockLocalStorage });

// Mock URL.createObjectURL and revokeObjectURL
const mockCreateObjectURL = vi.fn().mockReturnValue("blob:mock-url");
const mockRevokeObjectURL = vi.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

const mockLogs = [
  {
    id: "log-1",
    timestamp: "2024-01-15T12:00:00Z",
    level: "info",
    action: "auth.login",
    user_id: "user-123",
    user_email: "admin@example.com",
    resource_type: "user",
    resource_id: "user-123",
    success: true,
    details: "Login successful",
    ip_address: "192.168.1.1",
    request_id: "req-abc",
  },
  {
    id: "log-2",
    timestamp: "2024-01-15T11:55:00Z",
    level: "warn",
    action: "auth.2fa_enabled",
    user_id: "user-456",
    user_email: "user@example.com",
    resource_type: "user",
    resource_id: "user-456",
    success: true,
    details: "2FA enabled",
    ip_address: "192.168.1.2",
    request_id: "req-def",
  },
];

const mockLogsResponse = {
  data: {
    total: 100,
    offset: 0,
    limit: 50,
    logs: mockLogs,
  },
};

describe("useAuditLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest.mockResolvedValue(mockLogsResponse);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initial load", () => {
    it("should fetch audit logs on mount", async () => {
      const { result } = renderHook(() => useAuditLogs());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockRequest).toHaveBeenCalledWith({
        method: "GET",
        url: "/api/admin/audit-logs?offset=0&limit=50",
      });
      expect(result.current.logs).toEqual(mockLogs);
      expect(result.current.total).toBe(100);
      expect(result.current.error).toBeNull();
    });

    it("should handle fetch error", async () => {
      mockRequest.mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => useAuditLogs());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Failed to load audit logs");
      expect(result.current.logs).toEqual([]);
    });

    it("should respect custom limit option", async () => {
      const { result } = renderHook(() => useAuditLogs({ limit: 25 }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockRequest).toHaveBeenCalledWith({
        method: "GET",
        url: "/api/admin/audit-logs?offset=0&limit=25",
      });
      expect(result.current.limit).toBe(25);
    });
  });

  describe("refresh", () => {
    it("should refresh logs on demand", async () => {
      const { result } = renderHook(() => useAuditLogs());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Clear and set up for refresh
      mockRequest.mockResolvedValueOnce({
        data: {
          ...mockLogsResponse.data,
          total: 105, // Updated count
        },
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.total).toBe(105);
    });
  });

  describe("pagination", () => {
    it("should update offset and refetch", async () => {
      const { result } = renderHook(() => useAuditLogs());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockRequest.mockResolvedValueOnce({
        data: {
          ...mockLogsResponse.data,
          offset: 50,
        },
      });

      act(() => {
        result.current.setOffset(50);
      });

      await waitFor(() => {
        expect(mockRequest).toHaveBeenCalledWith({
          method: "GET",
          url: "/api/admin/audit-logs?offset=50&limit=50",
        });
      });

      expect(result.current.offset).toBe(50);
    });
  });

  describe("filtering", () => {
    it("should filter by action type", async () => {
      const { result } = renderHook(() => useAuditLogs());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockRequest.mockResolvedValueOnce({
        data: {
          total: 20,
          offset: 0,
          limit: 50,
          logs: [mockLogs[0]], // Only auth.login logs
        },
      });

      act(() => {
        result.current.setActionFilter("auth.login");
      });

      await waitFor(() => {
        expect(mockRequest).toHaveBeenCalledWith({
          method: "GET",
          url: "/api/admin/audit-logs?offset=0&limit=50&action=auth.login",
        });
      });

      expect(result.current.actionFilter).toBe("auth.login");
    });

    it("should clear action filter", async () => {
      const { result } = renderHook(() => useAuditLogs());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Set filter first
      act(() => {
        result.current.setActionFilter("auth.login");
      });

      await waitFor(() => {
        expect(result.current.actionFilter).toBe("auth.login");
      });

      mockRequest.mockResolvedValueOnce(mockLogsResponse);

      // Clear filter
      act(() => {
        result.current.setActionFilter(null);
      });

      await waitFor(() => {
        expect(mockRequest).toHaveBeenLastCalledWith({
          method: "GET",
          url: "/api/admin/audit-logs?offset=0&limit=50",
        });
      });

      expect(result.current.actionFilter).toBeNull();
    });
  });

  describe("autoRefresh", () => {
    it("should auto-refresh when enabled", async () => {
      vi.useFakeTimers();

      const { result } = renderHook(() =>
        useAuditLogs({ autoRefresh: true, refreshIntervalMs: 5000 }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Advance timer
      mockRequest.mockResolvedValueOnce(mockLogsResponse);
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(mockRequest).toHaveBeenCalledTimes(2);
      });
    });

    it("should not auto-refresh when disabled", async () => {
      vi.useFakeTimers();

      const { result } = renderHook(() =>
        useAuditLogs({ autoRefresh: false, refreshIntervalMs: 5000 }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Advance timer
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });

      // Should still be 1 call
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe("exportLogs", () => {
    it("should export logs as CSV", async () => {
      const { result } = renderHook(() => useAuditLogs());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Mock successful export
      const mockBlob = new Blob(["csv,data"], { type: "text/csv" });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      // Mock document methods
      const mockClick = vi.fn();
      const mockAppendChild = vi.fn();
      const mockRemoveChild = vi.fn();
      const mockAnchor = { href: "", download: "", click: mockClick };

      vi.spyOn(document, "createElement").mockReturnValue(
        mockAnchor as unknown as HTMLElement,
      );
      vi.spyOn(document.body, "appendChild").mockImplementation(
        mockAppendChild,
      );
      vi.spyOn(document.body, "removeChild").mockImplementation(
        mockRemoveChild,
      );

      await act(async () => {
        await result.current.exportLogs();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://admin.asimo.io/api/admin/audit-logs/export?limit=500",
        {
          headers: {
            Authorization: "Bearer mock-token",
          },
        },
      );
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();
    });

    it("should export with action filter", async () => {
      const { result } = renderHook(() => useAuditLogs());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Set action filter
      act(() => {
        result.current.setActionFilter("auth.login");
      });

      await waitFor(() => {
        expect(result.current.actionFilter).toBe("auth.login");
      });

      const mockBlob = new Blob(["csv,data"], { type: "text/csv" });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      const mockClick = vi.fn();
      const mockAnchor = { href: "", download: "", click: mockClick };
      vi.spyOn(document, "createElement").mockReturnValue(
        mockAnchor as unknown as HTMLElement,
      );
      vi.spyOn(document.body, "appendChild").mockImplementation(
        () => mockAnchor as unknown as HTMLElement,
      );
      vi.spyOn(document.body, "removeChild").mockImplementation(
        () => mockAnchor as unknown as HTMLElement,
      );

      await act(async () => {
        await result.current.exportLogs();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://admin.asimo.io/api/admin/audit-logs/export?action=auth.login&limit=500",
        expect.any(Object),
      );
    });

    it("should handle export error", async () => {
      const { result } = renderHook(() => useAuditLogs());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await act(async () => {
        await result.current.exportLogs();
      });

      expect(result.current.error).toBe("Failed to export audit logs");
    });
  });
});
