/**
 * useBulkOperations Hook
 *
 * Provides functionality for bulk user operations:
 * - Selection management
 * - Bulk activate/deactivate
 * - Bulk role change
 */

import { useState, useCallback } from "react";
import { fetchAPI, APIError } from "../lib/api";

export type BulkAction = "activate" | "deactivate" | "set_role";
export type AdminRole = "user" | "admin" | "viewer";

export interface BulkOperationResult {
  action: BulkAction;
  total_requested: number;
  successful: number;
  failed: number;
  skipped: number;
  results: {
    successful: Array<{ user_id: string; email: string }>;
    failed: Array<{ user_id: string; reason: string }>;
    skipped: Array<{ user_id: string; email?: string; reason: string }>;
  };
}

interface UseBulkOperationsReturn {
  // Selection state
  selectedIds: Set<string>;
  isAllSelected: boolean;
  selectedCount: number;

  // Selection actions
  toggleSelection: (userId: string) => void;
  selectAll: (userIds: string[]) => void;
  clearSelection: () => void;
  isSelected: (userId: string) => boolean;

  // Bulk operation
  executeBulkOperation: (
    action: BulkAction,
    role?: AdminRole,
    reason?: string,
  ) => Promise<BulkOperationResult>;
  isLoading: boolean;
  error: string | null;
  lastResult: BulkOperationResult | null;
  clearError: () => void;
}

export function useBulkOperations(
  totalUsers: number = 0,
): UseBulkOperationsReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<BulkOperationResult | null>(
    null,
  );

  const isAllSelected = selectedIds.size > 0 && selectedIds.size === totalUsers;
  const selectedCount = selectedIds.size;

  const toggleSelection = useCallback((userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((userIds: string[]) => {
    setSelectedIds(new Set(userIds));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (userId: string) => selectedIds.has(userId),
    [selectedIds],
  );

  const executeBulkOperation = useCallback(
    async (
      action: BulkAction,
      role?: AdminRole,
      reason?: string,
    ): Promise<BulkOperationResult> => {
      if (selectedIds.size === 0) {
        throw new Error("No users selected");
      }

      setIsLoading(true);
      setError(null);
      setLastResult(null);

      try {
        const response = await fetchAPI<BulkOperationResult>(
          "/api/admin/panel/users/bulk",
          {
            method: "POST",
            body: JSON.stringify({
              user_ids: Array.from(selectedIds),
              action,
              role: action === "set_role" ? role : undefined,
              reason,
            }),
          },
        );

        setLastResult(response);

        // Clear selection after successful operation
        if (response.successful > 0) {
          // Remove successfully processed users from selection
          setSelectedIds((prev) => {
            const next = new Set(prev);
            response.results.successful.forEach((item) => {
              next.delete(item.user_id);
            });
            return next;
          });
        }

        return response;
      } catch (err) {
        let message = "Failed to perform bulk operation";
        if (err instanceof APIError) {
          message = err.message;
        } else if (err instanceof Error) {
          message = err.message;
        }
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [selectedIds],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    selectedIds,
    isAllSelected,
    selectedCount,
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,
    executeBulkOperation,
    isLoading,
    error,
    lastResult,
    clearError,
  };
}

export default useBulkOperations;
