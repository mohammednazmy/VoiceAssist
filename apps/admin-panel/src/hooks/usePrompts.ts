import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAPI } from "../lib/api";
import type {
  Prompt,
  PromptCreate,
  PromptUpdate,
  PromptPublish,
  PromptRollback,
  PromptTest,
  PromptDuplicate,
  PromptListResponse,
  PromptTestResponse,
  PromptVersionsResponse,
  PromptDiffResponse,
  PromptStats,
  PromptCacheStats,
  PromptType,
  PromptStatus,
} from "../types";

interface UsePromptsOptions {
  refreshIntervalMs?: number;
  autoRefresh?: boolean;
  initialFilters?: PromptFilters;
}

interface PromptFilters {
  prompt_type?: PromptType;
  status?: PromptStatus;
  is_active?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}

interface UsePromptsState {
  // Data
  prompts: Prompt[];
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;

  // CRUD Operations
  refreshPrompts: () => Promise<void>;
  getPrompt: (id: string) => Promise<Prompt | null>;
  createPrompt: (prompt: PromptCreate) => Promise<Prompt | null>;
  updatePrompt: (id: string, updates: PromptUpdate) => Promise<Prompt | null>;
  deletePrompt: (id: string) => Promise<boolean>;

  // Publishing & Versioning
  publishPrompt: (
    id: string,
    options?: PromptPublish,
  ) => Promise<Prompt | null>;
  rollbackPrompt: (
    id: string,
    options: PromptRollback,
  ) => Promise<Prompt | null>;
  getVersions: (
    id: string,
    page?: number,
    pageSize?: number,
  ) => Promise<PromptVersionsResponse | null>;
  getDiff: (
    id: string,
    versionA: number,
    versionB: number,
  ) => Promise<PromptDiffResponse | null>;

  // Testing
  testPrompt: (
    id: string,
    testData: PromptTest,
  ) => Promise<PromptTestResponse | null>;

  // Utilities
  duplicatePrompt: (
    id: string,
    options: PromptDuplicate,
  ) => Promise<Prompt | null>;
  toggleActive: (id: string) => Promise<Prompt | null>;
  archivePrompt: (id: string) => Promise<boolean>;

  // Stats & Cache
  getStats: () => Promise<PromptStats | null>;
  getCacheStats: () => Promise<PromptCacheStats | null>;
  invalidateCache: (id?: string) => Promise<boolean>;

  // Filtering
  filters: PromptFilters;
  setFilters: (filters: PromptFilters) => void;
}

const DEFAULT_REFRESH_MS = 30000;
const DEFAULT_PAGE_SIZE = 20;

export function usePrompts(options: UsePromptsOptions = {}): UsePromptsState {
  const refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_MS;
  const autoRefresh = options.autoRefresh ?? false;

  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [filters, setFilters] = useState<PromptFilters>(
    options.initialFilters ?? {},
  );

  // Build query string from filters
  const buildQueryString = useCallback((f: PromptFilters): string => {
    const params = new URLSearchParams();
    if (f.prompt_type) params.append("prompt_type", f.prompt_type);
    if (f.status) params.append("status", f.status);
    if (f.is_active !== undefined)
      params.append("is_active", String(f.is_active));
    if (f.search) params.append("search", f.search);
    params.append("page", String(f.page ?? 1));
    params.append("page_size", String(f.page_size ?? DEFAULT_PAGE_SIZE));
    return params.toString();
  }, []);

  // Refresh prompts list
  const refreshPrompts = useCallback(async () => {
    try {
      const queryString = buildQueryString(filters);
      const data = await fetchAPI<PromptListResponse>(
        `/api/admin/prompts?${queryString}`,
      );
      setPrompts(data.prompts);
      setTotal(data.total);
      setPage(data.page);
      setTotalPages(data.total_pages);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load prompts";
      setError(message);
    }
  }, [filters, buildQueryString]);

  // Get single prompt
  const getPrompt = useCallback(async (id: string): Promise<Prompt | null> => {
    try {
      const data = await fetchAPI<Prompt>(`/api/admin/prompts/${id}`);
      return data;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load prompt";
      setError(message);
      return null;
    }
  }, []);

  // Create prompt
  const createPrompt = useCallback(
    async (prompt: PromptCreate): Promise<Prompt | null> => {
      try {
        const data = await fetchAPI<Prompt>("/api/admin/prompts", {
          method: "POST",
          body: JSON.stringify(prompt),
        });
        await refreshPrompts();
        return data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create prompt";
        setError(message);
        return null;
      }
    },
    [refreshPrompts],
  );

  // Update prompt
  const updatePrompt = useCallback(
    async (id: string, updates: PromptUpdate): Promise<Prompt | null> => {
      try {
        const data = await fetchAPI<Prompt>(`/api/admin/prompts/${id}`, {
          method: "PATCH",
          body: JSON.stringify(updates),
        });
        await refreshPrompts();
        return data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update prompt";
        setError(message);
        return null;
      }
    },
    [refreshPrompts],
  );

  // Delete prompt
  const deletePrompt = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await fetchAPI(`/api/admin/prompts/${id}`, {
          method: "DELETE",
        });
        await refreshPrompts();
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete prompt";
        setError(message);
        return false;
      }
    },
    [refreshPrompts],
  );

  // Publish prompt
  const publishPrompt = useCallback(
    async (
      id: string,
      publishOptions?: PromptPublish,
    ): Promise<Prompt | null> => {
      try {
        const data = await fetchAPI<Prompt>(
          `/api/admin/prompts/${id}/publish`,
          {
            method: "POST",
            body: JSON.stringify(publishOptions ?? {}),
          },
        );
        await refreshPrompts();
        return data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to publish prompt";
        setError(message);
        return null;
      }
    },
    [refreshPrompts],
  );

  // Rollback prompt
  const rollbackPrompt = useCallback(
    async (
      id: string,
      rollbackOptions: PromptRollback,
    ): Promise<Prompt | null> => {
      try {
        const data = await fetchAPI<Prompt>(
          `/api/admin/prompts/${id}/rollback`,
          {
            method: "POST",
            body: JSON.stringify(rollbackOptions),
          },
        );
        await refreshPrompts();
        return data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to rollback prompt";
        setError(message);
        return null;
      }
    },
    [refreshPrompts],
  );

  // Get version history
  const getVersions = useCallback(
    async (
      id: string,
      versionPage: number = 1,
      pageSize: number = 20,
    ): Promise<PromptVersionsResponse | null> => {
      try {
        const data = await fetchAPI<PromptVersionsResponse>(
          `/api/admin/prompts/${id}/versions?page=${versionPage}&page_size=${pageSize}`,
        );
        return data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load versions";
        setError(message);
        return null;
      }
    },
    [],
  );

  // Get diff between versions
  const getDiff = useCallback(
    async (
      id: string,
      versionA: number,
      versionB: number,
    ): Promise<PromptDiffResponse | null> => {
      try {
        const data = await fetchAPI<PromptDiffResponse>(
          `/api/admin/prompts/${id}/diff?version_a=${versionA}&version_b=${versionB}`,
        );
        return data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load diff";
        setError(message);
        return null;
      }
    },
    [],
  );

  // Test prompt
  const testPrompt = useCallback(
    async (
      id: string,
      testData: PromptTest,
    ): Promise<PromptTestResponse | null> => {
      try {
        const data = await fetchAPI<PromptTestResponse>(
          `/api/admin/prompts/${id}/test`,
          {
            method: "POST",
            body: JSON.stringify(testData),
          },
        );
        return data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to test prompt";
        setError(message);
        return null;
      }
    },
    [],
  );

  // Duplicate prompt
  const duplicatePrompt = useCallback(
    async (id: string, dupOptions: PromptDuplicate): Promise<Prompt | null> => {
      try {
        const data = await fetchAPI<Prompt>(
          `/api/admin/prompts/${id}/duplicate`,
          {
            method: "POST",
            body: JSON.stringify(dupOptions),
          },
        );
        await refreshPrompts();
        return data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to duplicate prompt";
        setError(message);
        return null;
      }
    },
    [refreshPrompts],
  );

  // Toggle active status
  const toggleActive = useCallback(
    async (id: string): Promise<Prompt | null> => {
      const prompt = prompts.find((p) => p.id === id);
      if (!prompt) {
        setError("Prompt not found");
        return null;
      }
      return updatePrompt(id, { is_active: !prompt.is_active });
    },
    [prompts, updatePrompt],
  );

  // Archive prompt (set status to archived)
  const archivePrompt = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await fetchAPI(`/api/admin/prompts/${id}/archive`, {
          method: "POST",
        });
        await refreshPrompts();
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to archive prompt";
        setError(message);
        return false;
      }
    },
    [refreshPrompts],
  );

  // Get stats
  const getStats = useCallback(async (): Promise<PromptStats | null> => {
    try {
      const data = await fetchAPI<PromptStats>("/api/admin/prompts/stats");
      return data;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load stats";
      setError(message);
      return null;
    }
  }, []);

  // Get cache stats
  const getCacheStats =
    useCallback(async (): Promise<PromptCacheStats | null> => {
      try {
        const data = await fetchAPI<PromptCacheStats>(
          "/api/admin/prompts/cache/stats",
        );
        return data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load cache stats";
        setError(message);
        return null;
      }
    }, []);

  // Invalidate cache
  const invalidateCache = useCallback(async (id?: string): Promise<boolean> => {
    try {
      const endpoint = id
        ? `/api/admin/prompts/${id}/cache/invalidate`
        : "/api/admin/prompts/cache/invalidate";
      await fetchAPI(endpoint, { method: "POST" });
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to invalidate cache";
      setError(message);
      return false;
    }
  }, []);

  // Initial load
  useEffect(() => {
    setLoading(true);
    refreshPrompts().finally(() => setLoading(false));
  }, [refreshPrompts]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      refreshPrompts().catch(() => {
        // Error handling already done in refresh function
      });
    }, refreshIntervalMs);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshIntervalMs, refreshPrompts]);

  const value = useMemo(
    () => ({
      // Data
      prompts,
      total,
      page,
      totalPages,
      loading,
      error,
      lastUpdated,

      // CRUD
      refreshPrompts,
      getPrompt,
      createPrompt,
      updatePrompt,
      deletePrompt,

      // Publishing & Versioning
      publishPrompt,
      rollbackPrompt,
      getVersions,
      getDiff,

      // Testing
      testPrompt,

      // Utilities
      duplicatePrompt,
      toggleActive,
      archivePrompt,

      // Stats & Cache
      getStats,
      getCacheStats,
      invalidateCache,

      // Filtering
      filters,
      setFilters,
    }),
    [
      prompts,
      total,
      page,
      totalPages,
      loading,
      error,
      lastUpdated,
      refreshPrompts,
      getPrompt,
      createPrompt,
      updatePrompt,
      deletePrompt,
      publishPrompt,
      rollbackPrompt,
      getVersions,
      getDiff,
      testPrompt,
      duplicatePrompt,
      toggleActive,
      archivePrompt,
      getStats,
      getCacheStats,
      invalidateCache,
      filters,
    ],
  );

  return value;
}

// Utility hook for single prompt operations
export function usePrompt(promptId: string | null) {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPrompt = useCallback(async () => {
    if (!promptId) {
      setPrompt(null);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchAPI<Prompt>(`/api/admin/prompts/${promptId}`);
      setPrompt(data);
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load prompt";
      setError(message);
      setPrompt(null);
    } finally {
      setLoading(false);
    }
  }, [promptId]);

  useEffect(() => {
    fetchPrompt();
  }, [fetchPrompt]);

  return {
    prompt,
    loading,
    error,
    refresh: fetchPrompt,
  };
}
