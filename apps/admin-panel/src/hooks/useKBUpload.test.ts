/**
 * Tests for useKBUpload hook
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useKBUpload } from "./useKBUpload";

vi.mock("../lib/apiClient", () => ({
  getApiClient: vi.fn(),
}));

import { getApiClient } from "../lib/apiClient";

const mockRequest = vi.fn();

const mockApiClient = {
  request: mockRequest,
};

describe("useKBUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiClient).mockReturnValue(mockApiClient as any);
  });

  describe("uploadDocument", () => {
    it("should upload a text file successfully", async () => {
      mockRequest.mockResolvedValueOnce({
        ok: true,
        source: "test-document",
        title: "Test Document",
        author: "",
        chunks: 5,
      });

      const { result } = renderHook(() => useKBUpload());

      const file = new File(["test content"], "test-document.txt", {
        type: "text/plain",
      });

      let uploadResult;
      await act(async () => {
        uploadResult = await result.current.uploadDocument(file);
      });

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          url: "/api/admin/kb/documents",
          headers: { "Content-Type": "multipart/form-data" },
        }),
      );

      expect(uploadResult).toEqual({
        ok: true,
        source: "test-document",
        title: "Test Document",
        author: "",
        chunks: 5,
      });

      expect(result.current.isUploading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("should call onProgress during upload", async () => {
      // Simulate upload with progress
      mockRequest.mockImplementation(async (config) => {
        // Simulate progress callbacks
        if (config.onUploadProgress) {
          config.onUploadProgress({ loaded: 50, total: 100 });
          config.onUploadProgress({ loaded: 100, total: 100 });
        }
        return {
          ok: true,
          source: "test",
          title: "Test",
          author: "",
          chunks: 1,
        };
      });

      const { result } = renderHook(() => useKBUpload());

      const file = new File(["test"], "test.txt", { type: "text/plain" });
      const onProgress = vi.fn();

      await act(async () => {
        await result.current.uploadDocument(file, "Test", "", onProgress);
      });

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          loaded: 50,
          total: 100,
          percent: 50,
          stage: "uploading",
        }),
      );
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          loaded: 100,
          total: 100,
          percent: 100,
        }),
      );
    });

    it("should handle 415 unsupported file type error", async () => {
      mockRequest.mockRejectedValueOnce({
        response: {
          status: 415,
          data: { detail: "Only .txt or .md files" },
        },
      });

      const { result } = renderHook(() => useKBUpload());

      const file = new File(["test"], "test.pdf", { type: "application/pdf" });

      await act(async () => {
        try {
          await result.current.uploadDocument(file);
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe("Only .txt or .md files");
    });

    it("should handle 413 file too large error", async () => {
      mockRequest.mockRejectedValueOnce({
        response: {
          status: 413,
          data: { detail: "File too large (> 15728640 bytes)" },
        },
      });

      const { result } = renderHook(() => useKBUpload());

      const file = new File(["test"], "large.txt", { type: "text/plain" });

      await act(async () => {
        try {
          await result.current.uploadDocument(file);
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toContain("File too large");
    });

    it("should handle 401 unauthorized error", async () => {
      mockRequest.mockRejectedValueOnce({
        response: {
          status: 401,
          data: { detail: "Invalid API key" },
        },
      });

      const { result } = renderHook(() => useKBUpload());

      const file = new File(["test"], "test.txt", { type: "text/plain" });

      await act(async () => {
        try {
          await result.current.uploadDocument(file);
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe(
        "Unauthorized. Please check your credentials.",
      );
    });

    it("should handle generic network error", async () => {
      mockRequest.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useKBUpload());

      const file = new File(["test"], "test.txt", { type: "text/plain" });

      await act(async () => {
        try {
          await result.current.uploadDocument(file);
        } catch {
          // Expected to throw
        }
      });

      await waitFor(() => {
        expect(result.current.error).toBe("Network error");
      });
    });

    it("should set isUploading during request", async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockRequest.mockReturnValueOnce(pendingPromise);

      const { result } = renderHook(() => useKBUpload());

      const file = new File(["test"], "test.txt", { type: "text/plain" });

      // Start the upload
      act(() => {
        result.current.uploadDocument(file);
      });

      // Should be uploading
      expect(result.current.isUploading).toBe(true);

      // Resolve the promise
      await act(async () => {
        resolvePromise!({
          ok: true,
          source: "test",
          title: "Test",
          author: "",
          chunks: 1,
        });
      });

      await waitFor(() => {
        expect(result.current.isUploading).toBe(false);
      });
    });

    it("should use filename as title when not provided", async () => {
      mockRequest.mockResolvedValueOnce({
        ok: true,
        source: "my-document",
        title: "my-document",
        author: "",
        chunks: 1,
      });

      const { result } = renderHook(() => useKBUpload());

      const file = new File(["test"], "my-document.txt", {
        type: "text/plain",
      });

      await act(async () => {
        await result.current.uploadDocument(file);
      });

      // Check that FormData was created with title from filename
      const callArgs = mockRequest.mock.calls[0][0];
      const formData = callArgs.data as FormData;
      expect(formData.get("title")).toBe("my-document");
    });

    it("should use custom title when provided", async () => {
      mockRequest.mockResolvedValueOnce({
        ok: true,
        source: "custom-title",
        title: "Custom Title",
        author: "",
        chunks: 1,
      });

      const { result } = renderHook(() => useKBUpload());

      const file = new File(["test"], "document.txt", { type: "text/plain" });

      await act(async () => {
        await result.current.uploadDocument(file, "Custom Title");
      });

      const callArgs = mockRequest.mock.calls[0][0];
      const formData = callArgs.data as FormData;
      expect(formData.get("title")).toBe("Custom Title");
    });
  });

  describe("clearError", () => {
    it("should clear the error state", async () => {
      mockRequest.mockRejectedValue(new Error("Test error"));

      const { result } = renderHook(() => useKBUpload());

      const file = new File(["test"], "test.txt", { type: "text/plain" });

      await act(async () => {
        try {
          await result.current.uploadDocument(file);
        } catch {
          // Expected to throw
        }
      });

      await waitFor(() => {
        expect(result.current.error).toBe("Test error");
      });

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });
});
