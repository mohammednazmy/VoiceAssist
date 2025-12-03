/**
 * Tests for usePrompts hook - CRUD, versioning, testing, caching
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { usePrompts, usePrompt } from "./usePrompts";

// Mock fetchAPI
vi.mock("../lib/api", () => ({
  fetchAPI: vi.fn(),
}));

import { fetchAPI } from "../lib/api";

const mockPrompts = [
  {
    id: "prompt-1",
    name: "system_prompt",
    prompt_type: "system",
    content: "You are a helpful assistant.",
    description: "Main system prompt",
    version: 3,
    status: "published",
    is_active: true,
    created_at: "2024-01-10T10:00:00Z",
    updated_at: "2024-01-15T12:00:00Z",
    published_at: "2024-01-15T12:00:00Z",
  },
  {
    id: "prompt-2",
    name: "greeting_prompt",
    prompt_type: "template",
    content: "Hello, {{name}}!",
    description: "User greeting template",
    version: 1,
    status: "draft",
    is_active: false,
    created_at: "2024-01-12T10:00:00Z",
    updated_at: "2024-01-12T10:00:00Z",
    published_at: null,
  },
];

const mockListResponse = {
  prompts: mockPrompts,
  total: 2,
  page: 1,
  total_pages: 1,
};

const mockVersionsResponse = {
  versions: [
    {
      version: 3,
      content: "Updated content",
      updated_at: "2024-01-15T12:00:00Z",
    },
    {
      version: 2,
      content: "Second version",
      updated_at: "2024-01-13T12:00:00Z",
    },
    {
      version: 1,
      content: "Initial content",
      updated_at: "2024-01-10T12:00:00Z",
    },
  ],
  total: 3,
  page: 1,
  total_pages: 1,
};

const mockDiffResponse = {
  version_a: 1,
  version_b: 2,
  diff: [
    { type: "removed", content: "Initial content" },
    { type: "added", content: "Second version" },
  ],
};

const mockTestResponse = {
  rendered: "Hello, John!",
  tokens: 3,
  duration_ms: 15,
};

const mockStats = {
  total_prompts: 10,
  published: 5,
  drafts: 3,
  archived: 2,
  total_versions: 25,
};

const mockCacheStats = {
  hits: 1000,
  misses: 50,
  hit_rate: 0.95,
  size: 50,
  max_size: 100,
};

describe("usePrompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAPI).mockResolvedValue(mockListResponse);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("initial load", () => {
    it("should load prompts on mount", async () => {
      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchAPI).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/prompts"),
      );
      expect(result.current.prompts).toHaveLength(2);
      expect(result.current.total).toBe(2);
    });

    it("should set error on fetch failure", async () => {
      vi.mocked(fetchAPI).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Network error");
    });
  });

  describe("filtering", () => {
    it("should apply filters to query string", async () => {
      const { result } = renderHook(() =>
        usePrompts({
          initialFilters: {
            prompt_type: "system",
            status: "published",
            is_active: true,
            search: "test",
          },
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetchAPI).toHaveBeenCalledWith(
        expect.stringMatching(/prompt_type=system/),
      );
      expect(fetchAPI).toHaveBeenCalledWith(
        expect.stringMatching(/status=published/),
      );
      expect(fetchAPI).toHaveBeenCalledWith(
        expect.stringMatching(/is_active=true/),
      );
      expect(fetchAPI).toHaveBeenCalledWith(
        expect.stringMatching(/search=test/),
      );
    });

    it("should update filters and refetch", async () => {
      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      act(() => {
        result.current.setFilters({ prompt_type: "template" });
      });

      await waitFor(() => {
        expect(fetchAPI).toHaveBeenCalledWith(
          expect.stringMatching(/prompt_type=template/),
        );
      });
    });
  });

  describe("refreshPrompts", () => {
    it("should refetch prompts list", async () => {
      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.clearAllMocks();

      await act(async () => {
        await result.current.refreshPrompts();
      });

      expect(fetchAPI).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/prompts"),
      );
    });
  });

  describe("getPrompt", () => {
    it("should fetch single prompt by id", async () => {
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockListResponse)
        .mockResolvedValueOnce(mockPrompts[0]);

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const prompt = await result.current.getPrompt("prompt-1");

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/prompts/prompt-1");
      expect(prompt).toEqual(mockPrompts[0]);
    });

    it("should return null and set error on failure", async () => {
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockListResponse)
        .mockRejectedValueOnce(new Error("Not found"));

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const prompt = await result.current.getPrompt("invalid-id");

      expect(prompt).toBeNull();
      expect(result.current.error).toBe("Not found");
    });
  });

  describe("createPrompt", () => {
    it("should create new prompt", async () => {
      const newPrompt = {
        name: "new_prompt",
        prompt_type: "template" as const,
        content: "New content",
        description: "New description",
      };

      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockListResponse)
        .mockResolvedValueOnce({ id: "prompt-3", ...newPrompt })
        .mockResolvedValueOnce(mockListResponse);

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const created = await result.current.createPrompt(newPrompt);

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/prompts", {
        method: "POST",
        body: JSON.stringify(newPrompt),
      });
      expect(created).toEqual(expect.objectContaining({ name: "new_prompt" }));
    });

    it("should return null and set error on failure", async () => {
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockListResponse)
        .mockRejectedValueOnce(new Error("Validation error"));

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const created = await result.current.createPrompt({
        name: "",
        prompt_type: "system",
        content: "",
        description: "",
      });

      expect(created).toBeNull();
      expect(result.current.error).toBe("Validation error");
    });
  });

  describe("updatePrompt", () => {
    it("should update existing prompt", async () => {
      const updates = { content: "Updated content" };

      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockListResponse)
        .mockResolvedValueOnce({ ...mockPrompts[0], ...updates })
        .mockResolvedValueOnce(mockListResponse);

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const updated = await result.current.updatePrompt("prompt-1", updates);

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/prompts/prompt-1", {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      expect(updated?.content).toBe("Updated content");
    });
  });

  describe("deletePrompt", () => {
    it("should delete prompt", async () => {
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockListResponse)
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce(mockListResponse);

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const deleted = await result.current.deletePrompt("prompt-1");

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/prompts/prompt-1", {
        method: "DELETE",
      });
      expect(deleted).toBe(true);
    });

    it("should return false and set error on failure", async () => {
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockListResponse)
        .mockRejectedValueOnce(new Error("Delete failed"));

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const deleted = await result.current.deletePrompt("prompt-1");

      expect(deleted).toBe(false);
      expect(result.current.error).toBe("Delete failed");
    });
  });

  describe("publishPrompt", () => {
    it("should publish prompt", async () => {
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockListResponse)
        .mockResolvedValueOnce({ ...mockPrompts[1], status: "published" })
        .mockResolvedValueOnce(mockListResponse);

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const published = await result.current.publishPrompt("prompt-2", {
        release_notes: "First release",
      });

      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/prompts/prompt-2/publish",
        expect.objectContaining({
          method: "POST",
        }),
      );
      expect(published?.status).toBe("published");
    });
  });

  describe("rollbackPrompt", () => {
    it("should rollback to specific version", async () => {
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockListResponse)
        .mockResolvedValueOnce({ ...mockPrompts[0], version: 1 })
        .mockResolvedValueOnce(mockListResponse);

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const rolledBack = await result.current.rollbackPrompt("prompt-1", {
        target_version: 1,
      });

      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/prompts/prompt-1/rollback",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ target_version: 1 }),
        }),
      );
      expect(rolledBack?.version).toBe(1);
    });
  });

  describe("getVersions", () => {
    it("should fetch version history", async () => {
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockListResponse)
        .mockResolvedValueOnce(mockVersionsResponse);

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const versions = await result.current.getVersions("prompt-1");

      expect(fetchAPI).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/prompts/prompt-1/versions"),
      );
      expect(versions?.versions).toHaveLength(3);
    });
  });

  describe("getDiff", () => {
    it("should fetch diff between versions", async () => {
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockListResponse)
        .mockResolvedValueOnce(mockDiffResponse);

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const diff = await result.current.getDiff("prompt-1", 1, 2);

      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/prompts/prompt-1/diff?version_a=1&version_b=2",
      );
      expect(diff?.diff).toHaveLength(2);
    });
  });

  describe("testPrompt", () => {
    it("should test prompt with variables", async () => {
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockListResponse)
        .mockResolvedValueOnce(mockTestResponse);

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const testResult = await result.current.testPrompt("prompt-2", {
        variables: { name: "John" },
      });

      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/prompts/prompt-2/test",
        expect.objectContaining({
          method: "POST",
        }),
      );
      expect(testResult?.rendered).toBe("Hello, John!");
    });
  });

  describe("duplicatePrompt", () => {
    it("should duplicate prompt with new name", async () => {
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockListResponse)
        .mockResolvedValueOnce({
          ...mockPrompts[0],
          name: "system_prompt_copy",
        })
        .mockResolvedValueOnce(mockListResponse);

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const duplicated = await result.current.duplicatePrompt("prompt-1", {
        new_name: "system_prompt_copy",
      });

      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/prompts/prompt-1/duplicate",
        expect.objectContaining({
          method: "POST",
        }),
      );
      expect(duplicated?.name).toBe("system_prompt_copy");
    });
  });

  describe("toggleActive", () => {
    it("should toggle active status", async () => {
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockListResponse)
        .mockResolvedValueOnce({ ...mockPrompts[0], is_active: false })
        .mockResolvedValueOnce(mockListResponse);

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const toggled = await result.current.toggleActive("prompt-1");

      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/prompts/prompt-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ is_active: false }),
        }),
      );
      expect(toggled?.is_active).toBe(false);
    });

    it("should set error if prompt not found", async () => {
      vi.mocked(fetchAPI).mockResolvedValueOnce(mockListResponse);

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const toggled = await result.current.toggleActive("nonexistent");

      expect(toggled).toBeNull();
      expect(result.current.error).toBe("Prompt not found");
    });
  });

  describe("archivePrompt", () => {
    it("should archive prompt", async () => {
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockListResponse)
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce(mockListResponse);

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const archived = await result.current.archivePrompt("prompt-1");

      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/prompts/prompt-1/archive",
        { method: "POST" },
      );
      expect(archived).toBe(true);
    });
  });

  describe("getStats", () => {
    it("should fetch prompt statistics", async () => {
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockListResponse)
        .mockResolvedValueOnce(mockStats);

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const stats = await result.current.getStats();

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/prompts/stats");
      expect(stats?.total_prompts).toBe(10);
    });
  });

  describe("getCacheStats", () => {
    it("should fetch cache statistics", async () => {
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockListResponse)
        .mockResolvedValueOnce(mockCacheStats);

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const cacheStats = await result.current.getCacheStats();

      expect(fetchAPI).toHaveBeenCalledWith("/api/admin/prompts/cache/stats");
      expect(cacheStats?.hit_rate).toBe(0.95);
    });
  });

  describe("invalidateCache", () => {
    it("should invalidate all cache", async () => {
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockListResponse)
        .mockResolvedValueOnce({});

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const invalidated = await result.current.invalidateCache();

      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/prompts/cache/invalidate",
        { method: "POST" },
      );
      expect(invalidated).toBe(true);
    });

    it("should invalidate specific prompt cache", async () => {
      vi.mocked(fetchAPI)
        .mockResolvedValueOnce(mockListResponse)
        .mockResolvedValueOnce({});

      const { result } = renderHook(() => usePrompts());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const invalidated = await result.current.invalidateCache("prompt-1");

      expect(fetchAPI).toHaveBeenCalledWith(
        "/api/admin/prompts/prompt-1/cache/invalidate",
        { method: "POST" },
      );
      expect(invalidated).toBe(true);
    });
  });
});

describe("usePrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch prompt when id is provided", async () => {
    vi.mocked(fetchAPI).mockResolvedValue(mockPrompts[0]);

    const { result } = renderHook(() => usePrompt("prompt-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetchAPI).toHaveBeenCalledWith("/api/admin/prompts/prompt-1");
    expect(result.current.prompt).toEqual(mockPrompts[0]);
  });

  it("should not fetch when id is null", async () => {
    const { result } = renderHook(() => usePrompt(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.prompt).toBeNull();
    expect(fetchAPI).not.toHaveBeenCalled();
  });

  it("should set error on fetch failure", async () => {
    vi.mocked(fetchAPI).mockRejectedValue(new Error("Failed to load"));

    const { result } = renderHook(() => usePrompt("invalid"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Failed to load");
    expect(result.current.prompt).toBeNull();
  });

  it("should provide refresh function", async () => {
    vi.mocked(fetchAPI).mockResolvedValue(mockPrompts[0]);

    const { result } = renderHook(() => usePrompt("prompt-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    vi.clearAllMocks();

    await act(async () => {
      await result.current.refresh();
    });

    expect(fetchAPI).toHaveBeenCalledWith("/api/admin/prompts/prompt-1");
  });
});
