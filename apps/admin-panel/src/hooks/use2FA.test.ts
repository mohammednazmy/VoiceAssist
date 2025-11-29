/**
 * Tests for use2FA hook - Two-Factor Authentication management
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { use2FA } from "./use2FA";

// Mock the apiClient module
const mockRequest = vi.fn();
vi.mock("../lib/apiClient", () => ({
  getApiClient: () => ({
    request: mockRequest,
  }),
}));

const mockStatus = {
  enabled: false,
  verified_at: null,
  backup_codes_remaining: 0,
};

const mockEnabledStatus = {
  enabled: true,
  verified_at: "2024-01-15T12:00:00Z",
  backup_codes_remaining: 8,
};

const mockSetupData = {
  qr_code: "data:image/png;base64,mockQRCode",
  manual_entry_key: "ABCD1234EFGH5678",
  backup_codes: [
    "1111-2222",
    "3333-4444",
    "5555-6666",
    "7777-8888",
    "9999-0000",
    "aaaa-bbbb",
    "cccc-dddd",
    "eeee-ffff",
  ],
};

describe("use2FA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for initial status fetch
    mockRequest.mockResolvedValue(mockStatus);
  });

  describe("initial load", () => {
    it("should fetch 2FA status on mount", async () => {
      const { result } = renderHook(() => use2FA());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockRequest).toHaveBeenCalledWith({
        method: "GET",
        url: "/api/auth/2fa/status",
      });
      expect(result.current.status).toEqual(mockStatus);
      expect(result.current.error).toBeNull();
    });

    it("should handle status fetch error", async () => {
      mockRequest.mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => use2FA());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Failed to load 2FA status");
    });
  });

  describe("refreshStatus", () => {
    it("should refresh 2FA status", async () => {
      const { result } = renderHook(() => use2FA());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Clear and set up for second call
      mockRequest.mockResolvedValueOnce(mockEnabledStatus);

      await act(async () => {
        await result.current.refreshStatus();
      });

      expect(result.current.status).toEqual(mockEnabledStatus);
    });
  });

  describe("startSetup", () => {
    it("should start 2FA setup and return setup data", async () => {
      const { result } = renderHook(() => use2FA());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockRequest.mockResolvedValueOnce(mockSetupData);

      let setupResult;
      await act(async () => {
        setupResult = await result.current.startSetup();
      });

      expect(mockRequest).toHaveBeenCalledWith({
        method: "POST",
        url: "/api/auth/2fa/setup",
      });
      expect(setupResult).toEqual(mockSetupData);
      expect(result.current.setupData).toEqual(mockSetupData);
      expect(result.current.setupLoading).toBe(false);
    });

    it("should handle setup error", async () => {
      const { result } = renderHook(() => use2FA());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockRequest.mockRejectedValueOnce({
        response: { data: { detail: "2FA is already enabled" } },
      });

      let setupResult;
      await act(async () => {
        setupResult = await result.current.startSetup();
      });

      expect(setupResult).toBeNull();
      expect(result.current.error).toBe("2FA is already enabled");
    });

    it("should set setupLoading during request", async () => {
      const { result } = renderHook(() => use2FA());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockRequest.mockReturnValueOnce(pendingPromise);

      act(() => {
        result.current.startSetup();
      });

      expect(result.current.setupLoading).toBe(true);

      await act(async () => {
        resolvePromise!(mockSetupData);
      });

      await waitFor(() => {
        expect(result.current.setupLoading).toBe(false);
      });
    });
  });

  describe("verifyAndEnable", () => {
    it("should verify code and enable 2FA", async () => {
      const { result } = renderHook(() => use2FA());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Setup first
      mockRequest.mockResolvedValueOnce(mockSetupData);
      await act(async () => {
        await result.current.startSetup();
      });

      // Then verify - returns success, then refreshes status
      mockRequest
        .mockResolvedValueOnce({ message: "2FA has been enabled successfully" })
        .mockResolvedValueOnce(mockEnabledStatus);

      let success;
      await act(async () => {
        success = await result.current.verifyAndEnable("123456");
      });

      expect(mockRequest).toHaveBeenCalledWith({
        method: "POST",
        url: "/api/auth/2fa/verify",
        data: { code: "123456" },
      });
      expect(success).toBe(true);
      expect(result.current.setupData).toBeNull(); // Cleared after success
    });

    it("should handle invalid verification code", async () => {
      const { result } = renderHook(() => use2FA());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockRequest.mockRejectedValueOnce({
        response: { data: { detail: "Invalid verification code" } },
      });

      let success;
      await act(async () => {
        success = await result.current.verifyAndEnable("000000");
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe("Invalid verification code");
    });

    it("should set verifyLoading during verification", async () => {
      const { result } = renderHook(() => use2FA());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockRequest.mockReturnValueOnce(pendingPromise);

      act(() => {
        result.current.verifyAndEnable("123456");
      });

      expect(result.current.verifyLoading).toBe(true);

      await act(async () => {
        resolvePromise!({});
        // Mock the status refresh that follows
        mockRequest.mockResolvedValueOnce(mockEnabledStatus);
      });

      await waitFor(() => {
        expect(result.current.verifyLoading).toBe(false);
      });
    });
  });

  describe("disable", () => {
    it("should disable 2FA with password and code", async () => {
      // Start with enabled status
      mockRequest.mockResolvedValueOnce(mockEnabledStatus);

      const { result } = renderHook(() => use2FA());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.status?.enabled).toBe(true);

      // Disable - returns success, then refreshes status
      mockRequest
        .mockResolvedValueOnce({
          message: "2FA has been disabled successfully",
        })
        .mockResolvedValueOnce(mockStatus);

      let success;
      await act(async () => {
        success = await result.current.disable("mypassword", "123456");
      });

      expect(mockRequest).toHaveBeenCalledWith({
        method: "POST",
        url: "/api/auth/2fa/disable",
        data: { password: "mypassword", code: "123456" },
      });
      expect(success).toBe(true);
    });

    it("should handle wrong password error", async () => {
      mockRequest.mockResolvedValueOnce(mockEnabledStatus);

      const { result } = renderHook(() => use2FA());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockRequest.mockRejectedValueOnce({
        response: { data: { detail: "Invalid password" } },
      });

      let success;
      await act(async () => {
        success = await result.current.disable("wrongpassword", "123456");
      });

      expect(success).toBe(false);
      expect(result.current.error).toBe("Invalid password");
    });

    it("should set disableLoading during request", async () => {
      mockRequest.mockResolvedValueOnce(mockEnabledStatus);

      const { result } = renderHook(() => use2FA());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockRequest.mockReturnValueOnce(pendingPromise);

      act(() => {
        result.current.disable("password", "123456");
      });

      expect(result.current.disableLoading).toBe(true);

      await act(async () => {
        resolvePromise!({});
        mockRequest.mockResolvedValueOnce(mockStatus);
      });

      await waitFor(() => {
        expect(result.current.disableLoading).toBe(false);
      });
    });
  });

  describe("regenerateBackupCodes", () => {
    it("should regenerate backup codes with TOTP verification", async () => {
      mockRequest.mockResolvedValueOnce(mockEnabledStatus);

      const { result } = renderHook(() => use2FA());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const newBackupCodes = [
        "new1-code",
        "new2-code",
        "new3-code",
        "new4-code",
        "new5-code",
        "new6-code",
        "new7-code",
        "new8-code",
      ];

      mockRequest
        .mockResolvedValueOnce({ backup_codes: newBackupCodes })
        .mockResolvedValueOnce({
          ...mockEnabledStatus,
          backup_codes_remaining: 8,
        });

      let codes;
      await act(async () => {
        codes = await result.current.regenerateBackupCodes("123456");
      });

      expect(mockRequest).toHaveBeenCalledWith({
        method: "POST",
        url: "/api/auth/2fa/backup-codes",
        data: { code: "123456" },
      });
      expect(codes).toEqual(newBackupCodes);
    });

    it("should handle regeneration error", async () => {
      mockRequest.mockResolvedValueOnce(mockEnabledStatus);

      const { result } = renderHook(() => use2FA());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockRequest.mockRejectedValueOnce({
        response: { data: { detail: "Invalid verification code" } },
      });

      let codes;
      await act(async () => {
        codes = await result.current.regenerateBackupCodes("000000");
      });

      expect(codes).toBeNull();
      expect(result.current.error).toBe("Invalid verification code");
    });
  });

  describe("clearSetupData", () => {
    it("should clear setup data", async () => {
      const { result } = renderHook(() => use2FA());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Start setup to have setupData
      mockRequest.mockResolvedValueOnce(mockSetupData);
      await act(async () => {
        await result.current.startSetup();
      });

      expect(result.current.setupData).not.toBeNull();

      act(() => {
        result.current.clearSetupData();
      });

      expect(result.current.setupData).toBeNull();
    });
  });
});
