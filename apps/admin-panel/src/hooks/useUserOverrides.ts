/**
 * User Flag Override Hook (Phase 4)
 *
 * Provides CRUD operations for per-user feature flag overrides.
 * Used for beta testing, debugging, and personalized feature experiences.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAPI } from "../lib/api";

// Types for User Flag Override API
export interface UserFlagOverride {
  id: string;
  user_id: string;
  flag_name: string;
  enabled: boolean;
  value?: unknown;
  created_at: string;
  updated_at: string;
  expires_at?: string;
  metadata?: Record<string, unknown>;
  reason?: string;
  created_by?: string;
  updated_by?: string;
}

export interface UserFlagOverrideCreate {
  user_id: string;
  flag_name: string;
  value?: unknown;
  enabled?: boolean;
  reason?: string;
  expires_at?: string;
  metadata?: Record<string, unknown>;
}

export interface UserFlagOverrideUpdate {
  value?: unknown;
  enabled?: boolean;
  reason?: string;
  expires_at?: string;
  metadata?: Record<string, unknown>;
}

export interface ResolvedFlag {
  value: unknown;
  enabled: boolean;
  source: "override" | "segmentation" | "scheduled" | "default";
  override_details?: UserFlagOverride;
  flag_type?: string;
}

export interface OverrideStats {
  total_overrides: number;
  active_overrides: number;
  expired_overrides: number;
  overrides_by_flag: Record<string, number>;
  users_with_overrides: number;
}

export interface BulkOverrideCreate {
  overrides: UserFlagOverrideCreate[];
}

export interface BulkOverrideDelete {
  user_ids: string[];
  flag_name?: string;
}

interface UseUserOverridesOptions {
  /** Optional user ID to filter overrides for specific user */
  userId?: string;
  /** Optional flag name to filter overrides for specific flag */
  flagName?: string;
  /** Auto-refresh interval in ms (0 to disable) */
  refreshIntervalMs?: number;
}

interface UseUserOverridesState {
  overrides: UserFlagOverride[];
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  stats: OverrideStats | null;
  refreshOverrides: () => Promise<void>;
  createOverride: (override: UserFlagOverrideCreate) => Promise<boolean>;
  updateOverride: (
    userId: string,
    flagName: string,
    updates: UserFlagOverrideUpdate,
  ) => Promise<boolean>;
  deleteOverride: (userId: string, flagName: string) => Promise<boolean>;
  toggleOverride: (userId: string, flagName: string) => Promise<boolean>;
  getResolvedFlags: (
    userId: string,
  ) => Promise<Record<string, ResolvedFlag> | null>;
  bulkCreate: (overrides: UserFlagOverrideCreate[]) => Promise<boolean>;
  bulkDelete: (userIds: string[], flagName?: string) => Promise<boolean>;
  refreshStats: () => Promise<void>;
}

const DEFAULT_REFRESH_MS = 0; // No auto-refresh by default

export function useUserOverrides(
  options: UseUserOverridesOptions = {},
): UseUserOverridesState {
  const { userId, flagName, refreshIntervalMs = DEFAULT_REFRESH_MS } = options;

  const [overrides, setOverrides] = useState<UserFlagOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [stats, setStats] = useState<OverrideStats | null>(null);

  const refreshOverrides = useCallback(async () => {
    try {
      let url: string;

      if (userId) {
        // Get overrides for specific user
        url = `/api/admin/users/${userId}/flags`;
      } else if (flagName) {
        // Get overrides for specific flag
        url = `/api/admin/flag-overrides/${flagName}`;
      } else {
        // Get stats (no way to list all overrides efficiently)
        const statsData = await fetchAPI<OverrideStats>(
          "/api/admin/flag-overrides/stats",
        );
        setStats(statsData);
        setLastUpdated(new Date().toISOString());
        setError(null);
        return;
      }

      const data = await fetchAPI<{
        overrides: UserFlagOverride[];
        total?: number;
      }>(url);
      setOverrides(data.overrides || []);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load user overrides";
      setError(message);
    }
  }, [userId, flagName]);

  const refreshStats = useCallback(async () => {
    try {
      const data = await fetchAPI<OverrideStats>(
        "/api/admin/flag-overrides/stats",
      );
      setStats(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load override stats";
      setError(message);
    }
  }, []);

  const createOverride = useCallback(
    async (override: UserFlagOverrideCreate): Promise<boolean> => {
      try {
        await fetchAPI(`/api/admin/users/${override.user_id}/flags`, {
          method: "POST",
          body: JSON.stringify(override),
        });
        await refreshOverrides();
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create override";
        setError(message);
        return false;
      }
    },
    [refreshOverrides],
  );

  const updateOverride = useCallback(
    async (
      targetUserId: string,
      targetFlagName: string,
      updates: UserFlagOverrideUpdate,
    ): Promise<boolean> => {
      try {
        await fetchAPI(
          `/api/admin/users/${targetUserId}/flags/${targetFlagName}`,
          {
            method: "PATCH",
            body: JSON.stringify(updates),
          },
        );
        await refreshOverrides();
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update override";
        setError(message);
        return false;
      }
    },
    [refreshOverrides],
  );

  const deleteOverride = useCallback(
    async (targetUserId: string, targetFlagName: string): Promise<boolean> => {
      try {
        await fetchAPI(
          `/api/admin/users/${targetUserId}/flags/${targetFlagName}`,
          {
            method: "DELETE",
          },
        );
        await refreshOverrides();
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete override";
        setError(message);
        return false;
      }
    },
    [refreshOverrides],
  );

  const toggleOverride = useCallback(
    async (targetUserId: string, targetFlagName: string): Promise<boolean> => {
      const override = overrides.find(
        (o) => o.user_id === targetUserId && o.flag_name === targetFlagName,
      );
      if (!override) return false;
      return updateOverride(targetUserId, targetFlagName, {
        enabled: !override.enabled,
      });
    },
    [overrides, updateOverride],
  );

  const getResolvedFlags = useCallback(
    async (
      targetUserId: string,
    ): Promise<Record<string, ResolvedFlag> | null> => {
      try {
        const data = await fetchAPI<{ flags: Record<string, ResolvedFlag> }>(
          `/api/admin/users/${targetUserId}/flags/resolved`,
        );
        return data.flags;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to get resolved flags";
        setError(message);
        return null;
      }
    },
    [],
  );

  const bulkCreate = useCallback(
    async (overridesToCreate: UserFlagOverrideCreate[]): Promise<boolean> => {
      try {
        await fetchAPI("/api/admin/flag-overrides/bulk", {
          method: "POST",
          body: JSON.stringify({ overrides: overridesToCreate }),
        });
        await refreshOverrides();
        return true;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to bulk create overrides";
        setError(message);
        return false;
      }
    },
    [refreshOverrides],
  );

  const bulkDelete = useCallback(
    async (userIds: string[], targetFlagName?: string): Promise<boolean> => {
      try {
        await fetchAPI("/api/admin/flag-overrides/bulk", {
          method: "DELETE",
          body: JSON.stringify({
            user_ids: userIds,
            flag_name: targetFlagName,
          }),
        });
        await refreshOverrides();
        return true;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to bulk delete overrides";
        setError(message);
        return false;
      }
    },
    [refreshOverrides],
  );

  // Initial load
  useEffect(() => {
    setLoading(true);
    refreshOverrides().finally(() => setLoading(false));
  }, [refreshOverrides]);

  // Also load stats on initial render
  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  // Auto-refresh
  useEffect(() => {
    if (!refreshIntervalMs) return;

    const interval = setInterval(() => {
      refreshOverrides().catch(() => {
        // Error handling already done in refresh function
      });
    }, refreshIntervalMs);

    return () => clearInterval(interval);
  }, [refreshIntervalMs, refreshOverrides]);

  const value = useMemo(
    () => ({
      overrides,
      loading,
      error,
      lastUpdated,
      stats,
      refreshOverrides,
      createOverride,
      updateOverride,
      deleteOverride,
      toggleOverride,
      getResolvedFlags,
      bulkCreate,
      bulkDelete,
      refreshStats,
    }),
    [
      overrides,
      loading,
      error,
      lastUpdated,
      stats,
      refreshOverrides,
      createOverride,
      updateOverride,
      deleteOverride,
      toggleOverride,
      getResolvedFlags,
      bulkCreate,
      bulkDelete,
      refreshStats,
    ],
  );

  return value;
}
