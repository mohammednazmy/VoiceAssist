/**
 * useSystemKeys hook for managing system API keys (OpenAI, PubMed, etc.)
 * Allows admins to view, update, and validate external service credentials
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAPI } from "../lib/api";

export interface SystemKeyInfo {
  integration_id: string;
  key_name: string;
  is_configured: boolean;
  source: "environment" | "database" | "not_configured" | "database_error";
  masked_value: string | null;
  is_override: boolean;
  validation_status: "valid" | "invalid" | "unknown" | null;
  last_validated_at: string | null;
  updated_at: string | null;
}

export interface SystemKeysSummary {
  total: number;
  configured: number;
  from_env: number;
  from_db: number;
  not_configured: number;
}

export interface KeyValidationResult {
  success: boolean;
  message: string;
  latency_ms: number;
}

interface UseSystemKeysOptions {
  autoRefresh?: boolean;
  refreshIntervalMs?: number;
}

interface UseSystemKeysResult {
  keys: SystemKeyInfo[];
  summary: SystemKeysSummary | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refreshKeys: () => Promise<void>;
  updateKey: (integrationId: string, value: string) => Promise<void>;
  clearOverride: (integrationId: string) => Promise<void>;
  validateKey: (integrationId: string) => Promise<KeyValidationResult>;
}

export function useSystemKeys(
  options: UseSystemKeysOptions = {},
): UseSystemKeysResult {
  const { autoRefresh = false, refreshIntervalMs = 60000 } = options;

  const [keys, setKeys] = useState<SystemKeyInfo[]>([]);
  const [summary, setSummary] = useState<SystemKeysSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const response = await fetchAPI<{
        keys: SystemKeyInfo[];
        summary: SystemKeysSummary;
      }>("/api/admin/integrations/api-keys/summary");
      setKeys(response.keys);
      setSummary(response.summary);
      return response;
    } catch (err) {
      console.error("Failed to fetch system keys:", err);
      throw err;
    }
  }, []);

  const refreshKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await fetchKeys();
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch keys");
    } finally {
      setLoading(false);
    }
  }, [fetchKeys]);

  const updateKey = useCallback(
    async (integrationId: string, value: string): Promise<void> => {
      await fetchAPI(`/api/admin/integrations/${integrationId}/api-key`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
      // Refresh the list after update
      await refreshKeys();
    },
    [refreshKeys],
  );

  const clearOverride = useCallback(
    async (integrationId: string): Promise<void> => {
      await fetchAPI(`/api/admin/integrations/${integrationId}/api-key`, {
        method: "DELETE",
      });
      // Refresh the list after clearing
      await refreshKeys();
    },
    [refreshKeys],
  );

  const validateKey = useCallback(
    async (integrationId: string): Promise<KeyValidationResult> => {
      const response = await fetchAPI<KeyValidationResult>(
        `/api/admin/integrations/${integrationId}/api-key/validate`,
        { method: "POST" },
      );
      // Refresh to update validation status
      await refreshKeys();
      return response;
    },
    [refreshKeys],
  );

  // Initial load
  useEffect(() => {
    refreshKeys();
  }, [refreshKeys]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const intervalId = setInterval(() => {
      refreshKeys();
    }, refreshIntervalMs);

    return () => clearInterval(intervalId);
  }, [autoRefresh, refreshIntervalMs, refreshKeys]);

  return useMemo(
    () => ({
      keys,
      summary,
      loading,
      error,
      lastUpdated,
      refreshKeys,
      updateKey,
      clearOverride,
      validateKey,
    }),
    [
      keys,
      summary,
      loading,
      error,
      lastUpdated,
      refreshKeys,
      updateKey,
      clearOverride,
      validateKey,
    ],
  );
}
