/**
 * useClinicalContext Hook
 * Manages clinical context data for conversations
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";
import type {
  ClinicalContext,
  ClinicalContextCreate,
  ClinicalContextUpdate,
} from "@voiceassist/types";

export function useClinicalContext(sessionId?: string) {
  const { apiClient } = useAuth();
  const [context, setContext] = useState<ClinicalContext | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    if (!sessionId) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await apiClient.getCurrentClinicalContext(sessionId);
      setContext(data);
    } catch (err: any) {
      // 404 is expected when no context exists yet
      if (err.response?.status !== 404) {
        setError(err.message || "Failed to load clinical context");
        console.error("Failed to load clinical context:", err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, sessionId]);

  useEffect(() => {
    if (sessionId) {
      loadContext();
    }
  }, [loadContext, sessionId]);

  const createContext = useCallback(
    async (data: ClinicalContextCreate) => {
      setIsLoading(true);
      setError(null);

      try {
        const newContext = await apiClient.createClinicalContext({
          ...data,
          sessionId,
        });
        setContext(newContext);
        return newContext;
      } catch (err: any) {
        setError(err.message || "Failed to create clinical context");
        console.error("Failed to create clinical context:", err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [apiClient, sessionId],
  );

  const updateContext = useCallback(
    async (data: ClinicalContextUpdate) => {
      if (!context) {
        throw new Error("No context to update");
      }

      setIsLoading(true);
      setError(null);

      try {
        const updated = await apiClient.updateClinicalContext(context.id, data);
        setContext(updated);
        return updated;
      } catch (err: any) {
        setError(err.message || "Failed to update clinical context");
        console.error("Failed to update clinical context:", err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [apiClient, context],
  );

  const saveContext = useCallback(
    async (data: ClinicalContextCreate | ClinicalContextUpdate) => {
      // If context exists, update it; otherwise create new
      if (context) {
        return updateContext(data);
      } else {
        return createContext(data);
      }
    },
    [context, createContext, updateContext],
  );

  const deleteContext = useCallback(async () => {
    if (!context) {
      throw new Error("No context to delete");
    }

    setIsLoading(true);
    setError(null);

    try {
      await apiClient.deleteClinicalContext(context.id);
      setContext(null);
    } catch (err: any) {
      setError(err.message || "Failed to delete clinical context");
      console.error("Failed to delete clinical context:", err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, context]);

  const clearContext = useCallback(() => {
    setContext(null);
    setError(null);
  }, []);

  return {
    context,
    isLoading,
    error,
    loadContext,
    createContext,
    updateContext,
    saveContext,
    deleteContext,
    clearContext,
    hasContext: !!context,
  };
}
