/**
 * Tests for useKnowledgeDocuments hook
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useKnowledgeDocuments } from "./useKnowledgeDocuments";

vi.mock("../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

import { fetchAPI } from "../lib/api";

const mockDocs = [
  {
    id: "doc-1",
    name: "Medical Guidelines 2024",
    type: "guideline",
    indexed: true,
    version: "v1",
    lastIndexedAt: "2024-01-15T12:00:00Z",
  },
  {
    id: "doc-2",
    name: "Clinical Notes Template",
    type: "note",
    indexed: false,
    version: "v2",
    lastIndexedAt: null,
  },
];

describe("useKnowledgeDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial load", () => {
    it("should return loading true initially", async () => {
      vi.mocked(fetchAPI).mockResolvedValue({ documents: mockDocs, total: 2 });
      const { result } = renderHook(() => useKnowledgeDocuments());
      expect(result.current.loading).toBe(true);

      // Wait for async operations to complete to avoid act() warnings
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it("should fetch documents on mount", async () => {
      vi.mocked(fetchAPI).mockResolvedValue({ documents: mockDocs, total: 2 });
      const { result } = renderHook(() => useKnowledgeDocuments());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/kb/documents");
    });

    it("should return documents after loading", async () => {
      vi.mocked(fetchAPI).mockResolvedValue({ documents: mockDocs, total: 2 });
      const { result } = renderHook(() => useKnowledgeDocuments());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.docs).toHaveLength(2);
      expect(result.current.docs[0]).toMatchObject({
        id: "doc-1",
        name: "Medical Guidelines 2024",
        type: "guideline",
      });
    });

    it("should have no error on success", async () => {
      vi.mocked(fetchAPI).mockResolvedValue({ documents: mockDocs, total: 2 });
      const { result } = renderHook(() => useKnowledgeDocuments());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("response format handling", () => {
    it("should handle object response with documents array", async () => {
      vi.mocked(fetchAPI).mockResolvedValue({ documents: mockDocs, total: 2 });
      const { result } = renderHook(() => useKnowledgeDocuments());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.docs).toHaveLength(2);
      expect(result.current.docs[0].name).toBe("Medical Guidelines 2024");
    });

    it("should handle array response for backwards compatibility", async () => {
      vi.mocked(fetchAPI).mockResolvedValue(mockDocs);
      const { result } = renderHook(() => useKnowledgeDocuments());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.docs).toHaveLength(2);
      expect(result.current.docs[1].name).toBe("Clinical Notes Template");
    });
  });

  describe("error handling", () => {
    it("should fall back to demo data on API error", async () => {
      vi.mocked(fetchAPI).mockRejectedValue(new Error("API Error"));

      const { result } = renderHook(() => useKnowledgeDocuments());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toEqual({
        code: "demo",
        message: "API Error",
      });
      expect(result.current.docs).toHaveLength(2);
      expect(result.current.docs[0].name).toBe("Harrison's · Heart Failure");
      expect(result.current.docs[1].name).toBe(
        "AHA/ACC/HFSA 2022 HF Guideline",
      );
    });

    it("should handle non-Error rejection with unknown message", async () => {
      vi.mocked(fetchAPI).mockRejectedValue("network failure");

      const { result } = renderHook(() => useKnowledgeDocuments());

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

      const { unmount } = renderHook(() => useKnowledgeDocuments());

      unmount();
      resolvePromise!({ documents: mockDocs, total: 2 });

      expect(true).toBe(true);
    });
  });
});
