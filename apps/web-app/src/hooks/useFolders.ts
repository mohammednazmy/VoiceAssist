/**
 * useFolders Hook
 * Manages folder operations and state
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";
import type {
  Folder,
  CreateFolderRequest,
  UpdateFolderRequest,
} from "@voiceassist/types";
import { extractErrorMessage } from "@voiceassist/types";

export function useFolders() {
  const { apiClient } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFolders = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const tree = await apiClient.getFolderTree();
      setFolders(tree);
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
      console.error("Failed to load folders:", err);
    } finally {
      setIsLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const createFolder = useCallback(
    async (request: CreateFolderRequest) => {
      try {
        const newFolder = await apiClient.createFolder(request);
        await loadFolders(); // Reload to get updated tree
        return newFolder;
      } catch (err: unknown) {
        setError(extractErrorMessage(err));
        throw err;
      }
    },
    [apiClient, loadFolders],
  );

  const updateFolder = useCallback(
    async (id: string, request: UpdateFolderRequest) => {
      try {
        const updated = await apiClient.updateFolder(id, request);
        await loadFolders(); // Reload to get updated tree
        return updated;
      } catch (err: unknown) {
        setError(extractErrorMessage(err));
        throw err;
      }
    },
    [apiClient, loadFolders],
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      try {
        await apiClient.deleteFolder(id);
        await loadFolders(); // Reload to get updated tree
      } catch (err: unknown) {
        setError(extractErrorMessage(err));
        throw err;
      }
    },
    [apiClient, loadFolders],
  );

  const moveFolder = useCallback(
    async (folderId: string, targetFolderId: string) => {
      try {
        await apiClient.moveFolder(folderId, targetFolderId);
        await loadFolders(); // Reload to get updated tree
      } catch (err: unknown) {
        setError(extractErrorMessage(err));
        throw err;
      }
    },
    [apiClient, loadFolders],
  );

  return {
    folders,
    isLoading,
    error,
    createFolder,
    updateFolder,
    deleteFolder,
    moveFolder,
    reload: loadFolders,
  };
}
