/**
 * Scheduled Variant Changes Hook (Phase 3 - Feature Flags)
 *
 * Hook for managing scheduled variant weight changes for A/B tests
 * and gradual rollouts.
 *
 * Features:
 * - List all pending scheduled changes
 * - Create, update, cancel, delete scheduled changes
 * - Preview change impact before applying
 * - Timezone-aware scheduling
 *
 * @example
 * ```tsx
 * const { scheduledChanges, createChange, cancelChange } = useScheduledChanges();
 * ```
 */

import { useCallback, useEffect, useState } from "react";
import { fetchAPI } from "../lib/api";

export interface ScheduledChange {
  id: string;
  flag_name: string;
  scheduled_at: string;
  changes: Record<string, number>;
  description?: string;
  timezone_id: string;
  applied: boolean;
  cancelled: boolean;
  cancelled_at?: string;
  cancelled_by?: string;
  created_at: string;
  created_by?: string;
  modified_at?: string;
  modified_by?: string;
}

export interface ScheduledChangeCreate {
  scheduled_at: string;
  changes: Record<string, number>;
  description?: string;
  timezone_id?: string;
}

export interface ScheduledChangeUpdate {
  scheduled_at?: string;
  changes?: Record<string, number>;
  description?: string;
  timezone_id?: string;
}

export interface ScheduledChangePreview {
  before: {
    variants: Array<{
      name: string;
      weight: number;
    }>;
  };
  after: {
    variants: Array<{
      name: string;
      weight: number;
    }>;
  };
  change_summary: string;
}

interface UseScheduledChangesState {
  scheduledChanges: ScheduledChange[];
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  refreshChanges: () => Promise<void>;
  getChangesForFlag: (flagName: string) => Promise<ScheduledChange[]>;
  createChange: (
    flagName: string,
    change: ScheduledChangeCreate,
  ) => Promise<boolean>;
  updateChange: (
    flagName: string,
    changeId: string,
    updates: ScheduledChangeUpdate,
  ) => Promise<boolean>;
  cancelChange: (flagName: string, changeId: string) => Promise<boolean>;
  deleteChange: (flagName: string, changeId: string) => Promise<boolean>;
  previewChange: (
    flagName: string,
    changeId: string,
  ) => Promise<ScheduledChangePreview | null>;
}

export function useScheduledChanges(): UseScheduledChangesState {
  const [scheduledChanges, setScheduledChanges] = useState<ScheduledChange[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Fetch all pending scheduled changes
  const refreshChanges = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchAPI<{ changes: ScheduledChange[] }>(
        "/api/admin/feature-flags/scheduled-changes/all",
      );
      setScheduledChanges(data.changes || []);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load scheduled changes";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Get scheduled changes for a specific flag
  const getChangesForFlag = useCallback(
    async (flagName: string): Promise<ScheduledChange[]> => {
      try {
        const data = await fetchAPI<{ changes: ScheduledChange[] }>(
          `/api/admin/feature-flags/${flagName}/scheduled-changes`,
        );
        return data.changes || [];
      } catch (err) {
        console.error(`Failed to get changes for flag ${flagName}:`, err);
        return [];
      }
    },
    [],
  );

  // Create a new scheduled change
  const createChange = useCallback(
    async (
      flagName: string,
      change: ScheduledChangeCreate,
    ): Promise<boolean> => {
      try {
        await fetchAPI(
          `/api/admin/feature-flags/${flagName}/scheduled-changes`,
          {
            method: "POST",
            body: JSON.stringify(change),
          },
        );
        await refreshChanges();
        return true;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to create scheduled change";
        setError(message);
        return false;
      }
    },
    [refreshChanges],
  );

  // Update an existing scheduled change
  const updateChange = useCallback(
    async (
      flagName: string,
      changeId: string,
      updates: ScheduledChangeUpdate,
    ): Promise<boolean> => {
      try {
        await fetchAPI(
          `/api/admin/feature-flags/${flagName}/scheduled-changes/${changeId}`,
          {
            method: "PATCH",
            body: JSON.stringify(updates),
          },
        );
        await refreshChanges();
        return true;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to update scheduled change";
        setError(message);
        return false;
      }
    },
    [refreshChanges],
  );

  // Cancel a scheduled change
  const cancelChange = useCallback(
    async (flagName: string, changeId: string): Promise<boolean> => {
      try {
        await fetchAPI(
          `/api/admin/feature-flags/${flagName}/scheduled-changes/${changeId}/cancel`,
          { method: "POST" },
        );
        await refreshChanges();
        return true;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to cancel scheduled change";
        setError(message);
        return false;
      }
    },
    [refreshChanges],
  );

  // Delete a scheduled change
  const deleteChange = useCallback(
    async (flagName: string, changeId: string): Promise<boolean> => {
      try {
        await fetchAPI(
          `/api/admin/feature-flags/${flagName}/scheduled-changes/${changeId}`,
          { method: "DELETE" },
        );
        await refreshChanges();
        return true;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to delete scheduled change";
        setError(message);
        return false;
      }
    },
    [refreshChanges],
  );

  // Preview a scheduled change
  const previewChange = useCallback(
    async (
      flagName: string,
      changeId: string,
    ): Promise<ScheduledChangePreview | null> => {
      try {
        const data = await fetchAPI<ScheduledChangePreview>(
          `/api/admin/feature-flags/${flagName}/scheduled-changes/${changeId}/preview`,
        );
        return data;
      } catch (err) {
        console.error(`Failed to preview change ${changeId}:`, err);
        return null;
      }
    },
    [],
  );

  // Initial load
  useEffect(() => {
    refreshChanges();
  }, [refreshChanges]);

  return {
    scheduledChanges,
    loading,
    error,
    lastUpdated,
    refreshChanges,
    getChangesForFlag,
    createChange,
    updateChange,
    cancelChange,
    deleteChange,
    previewChange,
  };
}
