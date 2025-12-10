/**
 * useUserAPIKeys hook for managing user-generated API keys
 * Allows users to create, view, and revoke their personal API keys
 * for programmatic access to the VoiceAssist API.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAPI } from "../lib/api";

export interface UserAPIKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_revoked: boolean;
}

export interface UserAPIKeyCreated extends UserAPIKey {
  key: string; // Full key - only returned once at creation
}

interface UseUserAPIKeysResult {
  keys: UserAPIKey[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refreshKeys: () => Promise<void>;
  createKey: (
    name: string,
    expiresInDays?: number,
  ) => Promise<UserAPIKeyCreated>;
  revokeKey: (keyId: string) => Promise<void>;
}

export function useUserAPIKeys(): UseUserAPIKeysResult {
  const [keys, setKeys] = useState<UserAPIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const response = await fetchAPI<{ keys: UserAPIKey[]; total: number }>(
        "/api/auth/api-keys",
      );
      setKeys(response.keys);
      return response;
    } catch (err) {
      console.error("Failed to fetch API keys:", err);
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

  const createKey = useCallback(
    async (
      name: string,
      expiresInDays?: number,
    ): Promise<UserAPIKeyCreated> => {
      const response = await fetchAPI<UserAPIKeyCreated>("/api/auth/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name,
          expires_in_days: expiresInDays || null,
        }),
      });
      // Refresh the list after creation
      await refreshKeys();
      return response;
    },
    [refreshKeys],
  );

  const revokeKey = useCallback(
    async (keyId: string): Promise<void> => {
      await fetchAPI(`/api/auth/api-keys/${keyId}`, {
        method: "DELETE",
      });
      // Refresh the list after revocation
      await refreshKeys();
    },
    [refreshKeys],
  );

  // Initial load
  useEffect(() => {
    refreshKeys();
  }, [refreshKeys]);

  return useMemo(
    () => ({
      keys,
      loading,
      error,
      lastUpdated,
      refreshKeys,
      createKey,
      revokeKey,
    }),
    [keys, loading, error, lastUpdated, refreshKeys, createKey, revokeKey],
  );
}
