import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAPI } from "../lib/api";
import type {
  FlagVariant,
  TargetingRule,
  FlagSchedule,
  FlagEnvironment,
} from "@voiceassist/types";

// Types for Feature Flags Admin API
export interface FeatureFlag {
  name: string;
  description: string;
  flag_type: "boolean" | "string" | "number" | "json" | "multivariate";
  enabled: boolean;
  value?: unknown;
  default_value?: unknown;
  rollout_percentage?: number;
  rollout_salt?: string;
  // Phase 3.2: Advanced features
  variants?: FlagVariant[];
  targeting_rules?: {
    rules: TargetingRule[];
    defaultVariant?: string;
    defaultEnabled?: boolean;
  };
  schedule?: FlagSchedule;
  environment: FlagEnvironment;
  archived: boolean;
  archived_at?: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface FeatureFlagCreate {
  name: string;
  description: string;
  flag_type?: "boolean" | "string" | "number" | "json" | "multivariate";
  enabled?: boolean;
  value?: unknown;
  default_value?: unknown;
  rollout_percentage?: number;
  variants?: FlagVariant[];
  targeting_rules?: {
    rules: TargetingRule[];
    defaultVariant?: string;
    defaultEnabled?: boolean;
  };
  schedule?: FlagSchedule;
  environment?: FlagEnvironment;
  metadata?: Record<string, unknown>;
}

export interface FeatureFlagUpdate {
  enabled?: boolean;
  value?: unknown;
  description?: string;
  rollout_percentage?: number;
  variants?: FlagVariant[];
  targeting_rules?: {
    rules: TargetingRule[];
    defaultVariant?: string;
    defaultEnabled?: boolean;
  };
  schedule?: FlagSchedule;
  archived?: boolean;
  metadata?: Record<string, unknown>;
}

interface UseFeatureFlagsOptions {
  refreshIntervalMs?: number;
  autoRefresh?: boolean;
  /** Filter by environment */
  environment?: FlagEnvironment;
  /** Include archived flags */
  includeArchived?: boolean;
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
  /** Archive a flag (soft delete) */
  archiveFlag: (name: string) => Promise<boolean>;
  /** Update flag variants */
  updateVariants: (name: string, variants: FlagVariant[]) => Promise<boolean>;
  /** Update targeting rules */
  updateTargetingRules: (
    name: string,
    rules: {
      rules: TargetingRule[];
      defaultVariant?: string;
      defaultEnabled?: boolean;
    },
  ) => Promise<boolean>;
}

const DEFAULT_REFRESH_MS = 30000;

export function useFeatureFlags(
  options: UseFeatureFlagsOptions = {},
): UseFeatureFlagsState {
  const refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_MS;
  const autoRefresh = options.autoRefresh ?? false;
  const environment = options.environment;
  const includeArchived = options.includeArchived ?? false;

  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const refreshFlags = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (environment) {
        params.set("environment", environment);
      }
      if (includeArchived) {
        params.set("include_archived", "true");
      }
      const queryString = params.toString();
      const url = `/api/admin/feature-flags${queryString ? `?${queryString}` : ""}`;

      const data = await fetchAPI<{ flags: FeatureFlag[]; total: number }>(url);
      setFlags(data.flags);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load feature flags";
      setError(message);
    }
  }, [environment, includeArchived]);

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

  const archiveFlag = useCallback(
    async (name: string): Promise<boolean> => {
      try {
        await fetchAPI(`/api/admin/feature-flags/${name}/archive`, {
          method: "POST",
        });
        await refreshFlags();
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to archive feature flag";
        setError(message);
        return false;
      }
    },
    [refreshFlags],
  );

  const updateVariants = useCallback(
    async (name: string, variants: FlagVariant[]): Promise<boolean> => {
      try {
        await fetchAPI(`/api/admin/feature-flags/${name}/variants`, {
          method: "PUT",
          body: JSON.stringify({ variants }),
        });
        await refreshFlags();
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update variants";
        setError(message);
        return false;
      }
    },
    [refreshFlags],
  );

  const updateTargetingRules = useCallback(
    async (
      name: string,
      targetingRules: {
        rules: TargetingRule[];
        defaultVariant?: string;
        defaultEnabled?: boolean;
      },
    ): Promise<boolean> => {
      try {
        await fetchAPI(`/api/admin/feature-flags/${name}/targeting-rules`, {
          method: "PUT",
          body: JSON.stringify({ targeting_rules: targetingRules }),
        });
        await refreshFlags();
        return true;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to update targeting rules";
        setError(message);
        return false;
      }
    },
    [refreshFlags],
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
      archiveFlag,
      updateVariants,
      updateTargetingRules,
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
      archiveFlag,
      updateVariants,
      updateTargetingRules,
    ],
  );

  return value;
}
