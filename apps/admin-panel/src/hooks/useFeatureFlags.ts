import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAPI } from "../lib/api";

// Types for Feature Flags Admin API
export interface FeatureFlag {
  name: string;
  description: string;
  flag_type: "boolean" | "string" | "number" | "json";
  enabled: boolean;
  value?: unknown;
  default_value?: unknown;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface FeatureFlagCreate {
  name: string;
  description: string;
  flag_type?: "boolean" | "string" | "number" | "json";
  enabled?: boolean;
  value?: unknown;
  default_value?: unknown;
  metadata?: Record<string, unknown>;
}

export interface FeatureFlagUpdate {
  enabled?: boolean;
  value?: unknown;
  description?: string;
  metadata?: Record<string, unknown>;
}

interface UseFeatureFlagsOptions {
  refreshIntervalMs?: number;
  autoRefresh?: boolean;
}

interface UseFeatureFlagsState {
  flags: FeatureFlag[];
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  refreshFlags: () => Promise<void>;
  createFlag: (flag: FeatureFlagCreate) => Promise<boolean>;
  updateFlag: (name: string, updates: FeatureFlagUpdate) => Promise<boolean>;
  deleteFlag: (name: string) => Promise<boolean>;
  toggleFlag: (name: string) => Promise<boolean>;
}

const DEFAULT_REFRESH_MS = 30000;

export function useFeatureFlags(
  options: UseFeatureFlagsOptions = {},
): UseFeatureFlagsState {
  const refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_MS;
  const autoRefresh = options.autoRefresh ?? false;

  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const refreshFlags = useCallback(async () => {
    try {
      const data = await fetchAPI<{ flags: FeatureFlag[]; total: number }>(
        "/api/admin/feature-flags",
      );
      setFlags(data.flags);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load feature flags";
      setError(message);
    }
  }, []);

  const createFlag = useCallback(
    async (flag: FeatureFlagCreate): Promise<boolean> => {
      try {
        await fetchAPI("/api/admin/feature-flags", {
          method: "POST",
          body: JSON.stringify(flag),
        });
        await refreshFlags();
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create feature flag";
        setError(message);
        return false;
      }
    },
    [refreshFlags],
  );

  const updateFlag = useCallback(
    async (name: string, updates: FeatureFlagUpdate): Promise<boolean> => {
      try {
        await fetchAPI(`/api/admin/feature-flags/${name}`, {
          method: "PATCH",
          body: JSON.stringify(updates),
        });
        await refreshFlags();
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update feature flag";
        setError(message);
        return false;
      }
    },
    [refreshFlags],
  );

  const deleteFlag = useCallback(
    async (name: string): Promise<boolean> => {
      try {
        await fetchAPI(`/api/admin/feature-flags/${name}`, {
          method: "DELETE",
        });
        await refreshFlags();
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete feature flag";
        setError(message);
        return false;
      }
    },
    [refreshFlags],
  );

  const toggleFlag = useCallback(
    async (name: string): Promise<boolean> => {
      const flag = flags.find((f) => f.name === name);
      if (!flag) return false;
      return updateFlag(name, { enabled: !flag.enabled });
    },
    [flags, updateFlag],
  );

  // Initial load
  useEffect(() => {
    setLoading(true);
    refreshFlags().finally(() => setLoading(false));
  }, [refreshFlags]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      refreshFlags().catch(() => {
        // Error handling already done in refresh function
      });
    }, refreshIntervalMs);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshIntervalMs, refreshFlags]);

  const value = useMemo(
    () => ({
      flags,
      loading,
      error,
      lastUpdated,
      refreshFlags,
      createFlag,
      updateFlag,
      deleteFlag,
      toggleFlag,
    }),
    [
      flags,
      loading,
      error,
      lastUpdated,
      refreshFlags,
      createFlag,
      updateFlag,
      deleteFlag,
      toggleFlag,
    ],
  );

  return value;
}
