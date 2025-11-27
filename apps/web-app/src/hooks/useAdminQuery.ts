/**
 * useAdminQuery Hook
 * Reusable hook for admin API queries with loading, error, and refresh functionality
 */

import { useState, useEffect, useCallback, useRef } from "react";

export interface UseAdminQueryOptions<T> {
  /** Initial data value */
  initialData?: T;
  /** Auto-refresh interval in milliseconds (0 = disabled) */
  refreshInterval?: number;
  /** Whether to fetch immediately on mount */
  fetchOnMount?: boolean;
  /** Callback on successful fetch */
  onSuccess?: (data: T) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface UseAdminQueryResult<T> {
  /** The fetched data */
  data: T | null;
  /** Whether the query is currently loading */
  isLoading: boolean;
  /** Whether this is the initial load */
  isInitialLoading: boolean;
  /** Error that occurred during fetch */
  error: string | null;
  /** Manually trigger a refresh */
  refresh: () => Promise<void>;
  /** Reset error state */
  clearError: () => void;
}

/**
 * Custom hook for admin API queries
 *
 * @param fetcher - Async function that fetches the data
 * @param deps - Dependencies array that triggers refetch when changed
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * const { data, isLoading, error, refresh } = useAdminQuery(
 *   () => adminApi.getUsers({ offset, limit }),
 *   [offset, limit],
 *   { refreshInterval: 30000 }
 * );
 * ```
 */
export function useAdminQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  options: UseAdminQueryOptions<T> = {},
): UseAdminQueryResult<T> {
  const {
    initialData = null,
    refreshInterval = 0,
    fetchOnMount = true,
    onSuccess,
    onError,
  } = options;

  const [data, setData] = useState<T | null>(initialData as T | null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(fetchOnMount);
  const [error, setError] = useState<string | null>(null);

  const fetcherRef = useRef(fetcher);
  const mountedRef = useRef(true);

  // Keep fetcher ref updated
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const fetchData = useCallback(async () => {
    if (!mountedRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await fetcherRef.current();
      if (mountedRef.current) {
        setData(result);
        setIsInitialLoading(false);
        onSuccess?.(result);
      }
    } catch (err) {
      if (mountedRef.current) {
        const errorMessage =
          err instanceof Error ? err.message : "An error occurred";
        setError(errorMessage);
        setIsInitialLoading(false);
        onError?.(err instanceof Error ? err : new Error(errorMessage));
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [onSuccess, onError]);

  // Fetch on mount and when deps change
  useEffect(() => {
    if (fetchOnMount) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, fetchOnMount]);

  // Set up auto-refresh
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, fetchData]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    data,
    isLoading,
    isInitialLoading,
    error,
    refresh: fetchData,
    clearError,
  };
}

/**
 * Hook for paginated admin queries
 */
export interface UsePaginatedQueryOptions<T> extends UseAdminQueryOptions<T> {
  /** Items per page */
  pageSize?: number;
}

export interface UsePaginatedQueryResult<T> extends UseAdminQueryResult<T> {
  /** Current page (1-indexed) */
  page: number;
  /** Total number of items */
  total: number;
  /** Total number of pages */
  totalPages: number;
  /** Go to specific page */
  goToPage: (page: number) => void;
  /** Go to next page */
  nextPage: () => void;
  /** Go to previous page */
  prevPage: () => void;
}

export function usePaginatedAdminQuery<T extends { total: number }>(
  fetcher: (offset: number, limit: number) => Promise<T>,
  deps: unknown[] = [],
  options: UsePaginatedQueryOptions<T> = {},
): UsePaginatedQueryResult<T> {
  const { pageSize = 20, ...queryOptions } = options;

  const [page, setPage] = useState(1);
  const offset = (page - 1) * pageSize;

  const result = useAdminQuery(
    () => fetcher(offset, pageSize),
    [...deps, offset, pageSize],
    queryOptions,
  );

  const total = result.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const goToPage = useCallback(
    (newPage: number) => {
      if (newPage >= 1 && newPage <= totalPages) {
        setPage(newPage);
      }
    },
    [totalPages],
  );

  const nextPage = useCallback(() => {
    goToPage(page + 1);
  }, [page, goToPage]);

  const prevPage = useCallback(() => {
    goToPage(page - 1);
  }, [page, goToPage]);

  return {
    ...result,
    page,
    total,
    totalPages,
    goToPage,
    nextPage,
    prevPage,
  };
}

export default useAdminQuery;
