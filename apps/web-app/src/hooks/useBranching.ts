/**
 * useBranching Hook
 *
 * Manages conversation branching state and operations.
 * Provides actions to create, list, and switch between branches.
 */

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "./useAuth";
import type { Branch, CreateBranchRequest } from "@voiceassist/types";

interface UseBranchingReturn {
  branches: Branch[];
  currentBranchId: string;
  isLoading: boolean;
  error: string | null;
  createBranch: (
    parentMessageId: string,
    initialMessage?: string,
  ) => Promise<Branch | null>;
  switchBranch: (branchId: string) => void;
  loadBranches: () => Promise<void>;
  getBranchMessages: (branchId: string) => Promise<void>;
}

export function useBranching(sessionId: string | null): UseBranchingReturn {
  const { apiClient } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranchId, setCurrentBranchId] = useState<string>("main");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load all branches for the current session
   */
  const loadBranches = useCallback(async () => {
    if (!sessionId) return;

    setIsLoading(true);
    setError(null);

    try {
      const branchList = await apiClient.listBranches(sessionId);
      setBranches(branchList);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load branches";
      setError(errorMessage);
      console.error("Failed to load branches:", err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, apiClient]);

  /**
   * Create a new branch from a specific message
   */
  const createBranch = useCallback(
    async (
      parentMessageId: string,
      initialMessage?: string,
    ): Promise<Branch | null> => {
      if (!sessionId) {
        setError("No active session");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const request: CreateBranchRequest = {
          parentMessageId,
          initialMessage,
        };

        const newBranch = await apiClient.createBranch(sessionId, request);

        // Add to branch list
        setBranches((prev) => [...prev, newBranch]);

        // Switch to the new branch
        setCurrentBranchId(newBranch.branchId);

        return newBranch;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create branch";
        setError(errorMessage);
        console.error("Failed to create branch:", err);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId, apiClient],
  );

  /**
   * Switch to a different branch
   */
  const switchBranch = useCallback((branchId: string) => {
    setCurrentBranchId(branchId);
    setError(null);
  }, []);

  /**
   * Load messages for a specific branch
   */
  const getBranchMessages = useCallback(
    async (branchId: string) => {
      if (!sessionId) return;

      setIsLoading(true);
      setError(null);

      try {
        await apiClient.getBranchMessages(sessionId, branchId);
        // Messages will be handled by the calling component
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to load branch messages";
        setError(errorMessage);
        console.error("Failed to load branch messages:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId, apiClient],
  );

  /**
   * Load branches when session changes
   */
  useEffect(() => {
    if (sessionId) {
      loadBranches();
    } else {
      // Reset state when no session
      setBranches([]);
      setCurrentBranchId("main");
      setError(null);
    }
  }, [sessionId, loadBranches]);

  return {
    branches,
    currentBranchId,
    isLoading,
    error,
    createBranch,
    switchBranch,
    loadBranches,
    getBranchMessages,
  };
}
